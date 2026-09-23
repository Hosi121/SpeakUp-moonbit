# 型付き backend と画面の寿命、履歴ページング

`Api` は DB・認証・AI・時計・通知先を受け取るインスタンスになった。
`configure_host` と `Host.invoke(Json) -> Json` は廃止し、native server が DB pool・RSA key を
持つ `Runtime` を起動時に作り、接続ごとに同じ `Api` を渡す。リクエストの途中で別の
API を呼び出しても、DB や URL 変換先が切り替わらないことを DB なしで検証できる。

## I/O 境界

| 境界 | MoonBit 内の表現 |
| --- | --- |
| SQL | `Statement { sql, params: Array[SqlValue] }`。配列・object は SQL parameter にできない |
| DB 応答 | `Rows(Array[DbRow])` / `Written(WriteResult)`。行と更新件数を区別する |
| 認証 | `AuthAction` と `Credentials`、トークン発行は `UserId -> String` |
| AI | `ChatKind` と検証済み `ChatReply`。業務処理は `content` を使う |
| 失敗 | `Credentials / NotConfigured / Conflict / Unavailable / InvalidData` を HTTP status に変換 |

native の DB は driver の値を直接 `SqlValue` に変換する。安全な整数範囲と重複列名は引き続き
境界で確認する。Node 比較用 backend の `dispatch` は既存の文字列 FFI として残すが、
JSON の組み立てと応答の解釈は JS adapter と DB codec に閉じる。
SQL の行から DTO を作る codec、および HTTP の入出力には JSON を使用する。
`ChatReply` は旧 HTTP 応答の provider metadata を落とさないために元の JSON も保持する。

SQL と列名は依然として実行時のデータで、schema の静的検査や方言変換は行わない。
transaction は既存の「型付き statement 列を同じ接続で実行し、最後の結果を返す」契約を維持する。
通話・フレンドの純粋な規則、SQL の CAS・transaction、認可検査はそれぞれの層に残る。
型だけで認可や原子性を保証したとは扱わない。SpeakUp の運用 DB は引き続き MySQL。

## ID と通知、フォーム操作

`core/identity` の `UserId`・`ConversationId`・`MessageId` は互換性のない型で、正の整数から
検証して作る。会話モデルと backend の参加者・会話操作ではそれらを使用する。
既存の JSON と JS 表示 DTO の ID は number のままなので、共有モデルの型の区別を
そのまま JavaScript の実行時表現へ持ち出さない。

`Notice` の variant は必要な ID を持つ。通話招待・マッチング結果には会話 ID、メッセージには
送信者とメッセージ ID が必要で、欠けた入力は inbox の入口で拒否する。説明と遷移先は
その enum の pattern match から求める。公開済みの `projectNotification` は旧 flat projection の
互換用として維持し、アプリの通知表示は検証済み `Notice` を使用する。

管理・振り返りフォームは `set_date_time`・`set_theme`・`set_comment` 等、通話の dialog は
`open_memo`・`open_assistant`・`open_topic` に分けた。認証の旧 `set_field` adapter も削除した。
これらの内部 controller API は DOM renderer と同時に更新し、Mbt2TS で `.d.ts` を再生成する。
HTTP/WebSocket の既存 payload、URL、通常の画面操作は維持する。

## 寿命の共有

画面の `Scope` はキーごとの置換というアプリ方針を残し、取消・解放は公開版 `Lifetime` に渡す。
起動ごとに新しい親、要求ごとに子を作り、停止した寿命を開き直さない。並列 GET は一つの
子 scope に所属する。同期完了・二重完了、取消からの再入でも古い画面を更新しない。
購読の登録が終わる前に破棄された場合も、その購読は元の寿命へ登録してすぐ解除する。

通知 socket、マイク確認、認証 module 待ちと送信にも同じ寿命を使用する。
マイク確認は途中の meter 初期化失敗・sample 例外でも track と listener を解放する。
単純な callback を一律に async 化せず、公開ライブラリの同期的な所有機能を使う。
cleanup は同期・例外なしという port 契約を維持する。DOM の `ViewScope` のように例外を集約する
別の解放契約や、shell の画面 module の世代管理はそのまま残す。
依存の追加・更新と汎用ライブラリ内部のテストの複製は行っていない。

## 履歴を100件より前へ読む

既存の `GET /conversations/history` は直近100件の配列を返す互換 API として残す。
履歴画面は次の API を使用する。

- `GET /conversations/history/page`: 最初のページ。
- `GET /conversations/history/page/{cursor}`: 続きのページ。
- 応答は `{ "items": [...], "next_cursor": "..." }`。空の `next_cursor` が終端。

1回の SQL は本人の membership で絞り、`ended_at DESC, id DESC` の順で最大101件を読み、
100件を返す。カーソルは終了時刻と ID の組で、次ページはこの組より古い行を検索する。
同時刻の終了、読み込み途中の新着、カーソルになった行の削除でも OFFSET の位置には依存しない。
最新ページへの再訪問で新着を取得する方式であり、全ページを固定した DB snapshot ではない。

画面の「さらに表示」、再試行、二重クリック防止、画面を離れた後の応答破棄は MoonBit が担当する。
取得済みの履歴を残して同じカーソルから再試行し、DOM は既存の行を保持して追加分を表示する。
通知・稼働中通話など、他の一覧の100件制限は今回のページング対象に含めない。

## 検証の分担

型の宣言や enum の網羅性だけを確認するテストは追加しない。
API インスタンスの再入、取消中の画面再起動、マイクの部分初期化失敗、ページの再試行は
DB 不要のテストで確認する。実 MySQL では103件の同時刻の履歴、途中追加、カーソル行削除、
他人の履歴の除外、旧 API の互換性を一つのケースで検証する。
新しい DOM 試験は「さらに表示」と行の保持を確かめる1件。
未信頼 JSON、認可・SQL 競合、実音声 RTP の既存試験は維持する。
この変更の実行速度の改善は計測しておらず、高速化は主張しない。
