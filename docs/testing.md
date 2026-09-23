# 型とテストの分担

内部の表現・網羅性は型で制約し、業務規則は I/O のない関数で検証する。
JSON、DB、ブラウザから来る値や、競合・時刻・通知の意味までは型だけで保証しない。
[変更前の監査](reviews/2026-09-23-testing.md)と[CI の実行範囲](ci.md)も参照。

## フレンド関係を最初の分離対象にした理由

以前は `core/api/social.mbt` の一つの関数が操作文字列、権限、状態遷移、SQL、通知を扱っていた。
現在は [`core/friendship`](../core/friendship/model.mbt) が次の型を持つ。

```moonbit
enum Action {
  Request
  Accept
  Reject
  Cancel
}
enum State {
  Absent
  Pending(Member)
  Accepted(Member)
  Declined(Member)
  Blocked
}
```

`Member` は ID の小さい側／大きい側の二択。状態の payload は申請者を表す。
承認・拒否後も申請者を保持することで、再送が別の参加者の同意へ化けるのを防ぐ。
`decide(State, Action, Member)` がパターンマッチで `Decision` または型付きの拒否を返す。
`Decision` は外部から構築できない。操作や状態の種類を増やすと、網羅的な match の更新が必要になる。

業務関数は HTTP、SQL、Json、時計、global host に依存しない。3件の単体試験で、両側の役割、
再送、拒否後の新しい申請、ブロックを確認する。型が保証する field 型の確認や SQL 文字列の
mock は追加していない。JS / native の双方で同じ関数を実行する。

[`core/api/friendships.mbt`](../core/api/friendships.mbt) は境界を担当する。

1. HTTP の操作文字列と DB 行を型へ変換し、不正値を拒否する。
2. 読み取った状態から業務関数を呼び、revision を照合して保存する。
3. 状態更新と、同じ revision を持つ通知の挿入を一つの transaction にする。
4. 競合したら最新状態から判断し直す。安定しない競合は最大4回で409にする。

初回 INSERT でも重複キーでは排他ロックを取る no-op UPDATE を使う。共有ロックからの
昇格を伴う `INSERT IGNORE` による deadlock を避けるため。通知には従来の一意な event key を
使い、再送時にも1件だけ保存する。同じ操作の競合、承認と取消／拒否の競合は、両 backend と
実 MySQL で状態・revision・通知を検査する。型や fake DB で原子性を保証したとは扱わない。

HTTP の URL・JSON と通常の承認・取消・再送の意味は維持する。host ABI、schema、Mooncakes
依存は変更していない。状態の事前読み取りが1回増えるため、API の高速化は主張しない。
型付き transaction callback を host 全体へ導入する案は、この分離に必須ではないため見送った。

## 通話・signaling・非同期状態への適用

| 対象 | 内部で保持する型 | 境界に残す形式と検証 |
| --- | --- | --- |
| 通話 | 非公開の fields を持つ `Conversation`。`Phase` が必要な時刻を持ち、revision は状態から導出する。`Origin` は `Direct` / `Event` | `Snapshot` と `ConversationDto` は従来の JSON。ID・整数範囲・時刻・参加者・origin の整合性を入口で確認 |
| 期限と操作 | `Start / Finish / Cancel / Expire` を純粋な `change` で適用。イベントの5分上限もここで処理 | DB adapter は会員照合と revision による CAS を維持。HTTP の権限・並行操作の試験も維持 |
| 画面の通話 | `Call` が検証済みモデルと表示用 metadata を保持。session は timer ごとに DTO を復元しない | JS の表示用 DTO はコピー。clock / partner / 終了判定は内部のモデルから求める |
| signaling | `ClientSignal` / `ServerSignal` / `Authorization`。部屋は `Waiting(connection)` / `Paired(pair)`、交渉済みの状態だけが media ACK を持つ | 未信頼 JSON の方向・サイズ・SDP・ICE を検査し、中継は検証した元の文字列を使う。旧 `parseSignal` の公開形式を維持 |
| フレンドと認証操作 | API と presenter が同じ `friendship.Action` を使用。認証の field も enum にする | DOM は `accept(id)` / `set_email(value)` 等の具体的な関数を使用。旧 `change` / `set_field` は互換 adapter として残す |
| 認証 | `Stopped / Idle / Loading(id, draft) / Sending(id, cancel)`。重複した module 完了と、送信後の古い module 失敗を無視 | JS callback の同期完了・二重通知・中断を DB 不要の controller 試験で確認 |
| 音声 | 通話の実行ごとに新しい `Lifetime` を作り、取得した resource をその場で登録。SDP / ICE だけを `Negotiation` enum の queue に入れる | 途中例外・退出・再接続・結果受け渡し中の取消と遅い handle の解放を検証。終了通知は SDP の完了を待たない |

`core/conversation/model.mbt` と `core/signaling/hub.mbt` は DB・ブラウザなしで動作する。
`core/shared/protocol.mbt` がサーバとブラウザの共通 decoder であり、presenter にあった
SDP / ICE の重複パーサは削除した。`core/native_server` も文字列 kind を経由せず認証を受け取る。
内部 enum や Option のコンパイラ固有 ABI は JS に公開しない。TS2Mbt / Mbt2TS と独立 consumer
で従来の具体的な型を検査する。依存の追加、DB schema の変更はない。

型は「終了状態なのに終了時刻がない」「1人の部屋なのに交渉済み」といった内部表現を制限する。
一方、どの参加者を許可するか、正しい期限か、callback が遅れて届くか、OS リソースが実際に
閉じたかは型だけで保証しない。必要な時間・競合・再送・解放試験を残す。読み込みと保存など
独立した仕事の Bool を全て一つの enum にまとめる変更もしていない。

追加の試験は MoonBit 2件（期限の規則、方向付き wire 検査）、Node 2件（認証の同期完了・中断、
音声の部分初期化失敗）。既存ケースにも SDP の元文字列保持、表示 DTO の変更からの独立性を
含めた。型の宣言や enum の列挙を確認するだけの試験、E2E の追加は行っていない。
再検証やパーサの重複を減らしたが、速度の比較計測はしておらず高速化は主張しない。

## 整理した検証と、残した根拠

| 変更 | 維持する検証 |
| --- | --- |
| 凍結した旧 HTTP adapter の5件を通常 CI から外す | 現行 `tests/transport.test.mjs` の5件に不足ケースを統合。旧版は `npm run test:oracle-http` で実行可能 |
| 同じ message renderer を app / standalone で二重実行する6件を削除 | app の6件で送信・再送・安全な文字表示・IME・既読を確認。standalone は入口固有の復帰試験を1件残す |
| boundary の同一 CI 内での JS 5件の再実行を除く | wire は JS/native 単体、JS ABI は Node 単体、独立 TS consumer は `test:consumer` で各1回。`test:boundaries` は単独確認用に維持 |
| HTTP / media 初期化のブラウザ5件を DB 不要側へ移動 | production build に対し、古い応答・不正 token・ICE 中断・AudioContext 失敗時の解放を試す。内部 TS ファイルの直接 import は不要になった |
| 比較も upload もしていなかった screenshot 6枚の常時保存を除く | 13画面×2幅の overflow・見出し確認は維持。失敗時には Playwright trace を残す |
| features の共有ユーザーを各ケースの fixture に置換 | メッセージ試験が自分でフレンド関係を用意する。他のテストの実行順に依存しない。共有サーバの起動は1回 |

旧 HTTP 試験にあったもののうち、URL 制限、fresh auth、public request、multipart boundary、
204、キャンセル、切断時の非再送は現行 transport で維持する。401、異なる error body、
空 body の status 付き fallback、空 token、multipart の認証も現行の5件へ統合した。
旧 `ApiError` class 自体の instanceof／cause は、使われていない旧 ABI のため現行へ移さない。
現行は型付き callback の `status / text / failed` を MoonBit が受け取る。

source oracle から作った fixture と現行実装の parity、未信頼 JSON の異常系、整数の桁あふれ、
生成 `.d.ts` の consumer、実 socket 切断、WebRTC の実 RTP は残す。
テスト件数を coverage 率や速度向上の根拠にしない。

## 部分実行

```bash
# フレンド業務規則だけ。DB・Node サーバ・ブラウザは不要
npm run moon -- test --target js core/friendship

# build 済みの JS 契約と controller、型 consumer
npm run test:unit
npm run test:consumer

# 空の専用 DB に schema を適用した後でも、この1件だけで実行できる
node --test --test-name-pattern='^private messages' tests/features.test.mjs

# production DOM。DB は不要
npm run test:navigation
```

全体 API 試験は README の順序で migration → seed → test とする。開発用 seed が使う
固定 ID を、先に別の fixture で埋めた DB は使わない。Compose / CI の healthcheck は TCP を
使い、MySQL image が初期化中に起動する socket 専用サーバを準備完了と判定しない。

フレンド分離時（`21cae20`、2026-09-23）のローカル検証では、`check`、frontend lint、生成物・fixture 差分なし、独立 consumer、
MoonBit JS 19件 / native 22件、Node 131件、native API 20件、production DOM 28件、
native browser 11件、Node 通話 parity 3件が成功した。メッセージ API の1件は seed 前の
空の専用 DB でも単独成功を確認した。任意実行へ移した旧 HTTP 5件も実行可能なことを確認した。

今回の通話・signaling・状態モデルの変更も `check`、lint、fixture 再生成、独立 consumer を
通過した。MoonBit JS 21件 / native 24件、Node 133件、native API 20件、production DOM 28件、
native browser 11件、Node 通話 parity 3件が成功した。API / browser は専用の空の MySQL に
migration → seed を適用して実行した。型だけで保証できない境界と競合を含めた結果であり、
速度の比較結果ではない。

## 残る設計上の課題

通話の callback / 世代管理は、その後 [`Lifetime` と公式 TaskGroup](async-browser.md) に移した。
同期的なブラウザ資源の解放と取消不能な取得の結果処理を共通化し、通話以外の Scope は残す。
通話の controller 試験は JS、共有モデルは JS / native で実行する。
汎用 Lifetime と callback の競合試験は公開先の
[moonbit-lifetime](https://github.com/Hosi121/moonbit-lifetime) へ移した。
ライブラリ側で JS / native / Wasm GC、配布物、通話以外の実 browser 資源を検証し、
SpeakUp 側は公開版を import して controller・実通話・JS 公開型を検証する。
ライブラリ内部の5件をアプリの CI で二重実行するためのコピーは残さない。

API 全体の `Host.invoke(Json) -> Json` と global host は残っている。フレンドと通話の業務規則は
そこから分離したが、全 backend の repository を型付きにしたものではない。通知の kind と
必要な ID の型付け、UserId / ConversationId の区別、他のフォームの具体的な操作関数への
移行は残る。既存の JSON・認可・競合試験をそれらの型付け前に削らない。

凍結 source oracle の再生成を変更パスで選別する案も未実施。今回の CI は引き続き毎回生成物と
fixture の差分を検査する。新しいテスト framework や runtime 依存は追加していない。
