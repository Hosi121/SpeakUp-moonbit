# ブラウザの非同期処理とリソースの寿命

通話の開始・SDP / ICE・音量監視を MoonBit の `async fn` と公式の
`moonbitlang/async@0.22.1` に移した。フロントの公開 controller / port 型、HTTP、
signaling の JSON は維持している。native backend の実装や DB schema は変えていない。

## 先行実装との役割分担

2026-09-23 に公式資料と公開リポジトリを確認した。

| 先行例 | 既に提供されるもの | 今回の判断 |
| --- | --- | --- |
| [moonbitlang/async](https://github.com/moonbitlang/async) / [JS 接続](https://docs.moonbitlang.com/en/latest/language/async-experimental.html#javascript-support) | TaskGroup、キャンセル、Promise / AbortSignal の接続 | そのまま利用。新しい scheduler やキャンセル runtime は作らない |
| [mizchi/x](https://github.com/mizchi/x) | 公式 async と native / Node の HTTP・socket 等を揃える API | 今回の browser media の所有・破棄を代替するものではないため、依存は追加しない |
| [Kotlin suspendCancellableCoroutine](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines/suspend-cancellable-coroutine.html) | callback の解除、キャンセルと結果受け渡しの競合、受け取れなかった resource の解放 | 境界で必要な契約を整理する参考にした |
| [Effection](https://github.com/thefrontside/effection) | JavaScript の structured concurrency と resource scope | 同じ問題に対する先行設計。JS の別 runtime を追加せず、MoonBit の公式 runtime を利用する |

「MoonBit に async がないため独自に作る」という判断ではない。調査した範囲では、
ブラウザの WebRTC とキャンセル後の media 解放まで含めて、そのまま差し替えられる
MoonBit 実装は確認できなかった。設計自体の新規性を主張するものではない。

## 分離した部分

* [`Hosi121/lifetime`](https://github.com/Hosi121/moonbit-lifetime/tree/main/lifetime) は再開しない `Lifetime` と一度だけ実行する
  `Release`。子の寿命、登録と逆順の解放、終了後に届いた resource の即時解放を扱う。
  DOM、HTTP、通話の型、async runtime に依存せず、JS / native の双方で検証する。
* [`Hosi121/lifetime_js`](https://github.com/Hosi121/moonbit-lifetime/tree/main/lifetime_js) は JS 用の薄い接続層。
  `wait[T]` は `Result[T, PortError]` を受け取り、重複完了を抑え、処理終了時に callback の
  登録を解除する。渡せなかった成功値は `discard` に返す。
  `run` が公式 `TaskGroup` を作り、`Inbox[T]` が容量制限のあるイベント入口を提供する。
  `acquire(release~)` は受け渡した資源を lifetime へ登録するところまでを行う。
* [`voice_ports.mbt`](../core/presenter/voice_ports.mbt) でブラウザの空の error 文字列を
  checked error に変換する。`DescriptionKind` は Offer / Answer を表す。
* [`voice.mbt`](../core/presenter/voice.mbt) は通話の規則を扱う。SDP 作成→local 設定→送信、
  remote 設定→保留 ICE→answer 作成を、順番に読める async 関数にした。
  音量監視は同じ TaskGroup の子タスクである。

callback ごとにあった世代番号・完了済みフラグと、再帰的な ICE 排出処理を通話側から除いた。
再接続では新しい `Lifetime` と通話の実行状態を作る。古い callback は古い寿命にしか触れない。
終了した状態を再び active にすることはない。

Promise は `Unit` の通知にだけ使う。成功値 `T` と `Result` は MoonBit 内部に保持するため、
FFI に generic cast や動的な値型を持ち込む必要がない。FFI の型パラメーター制限もこの形で避ける。
WebRTC / MediaStream の具体的な JS 操作は既存の型付き port に残した。

JS の同期例外は MoonBit の checked error へ自動では変換されない。
検証では音量取得の例外が scheduler の外へ抜けることを確認し、`guard_sync` を通すよう修正した。
同期 I/O の例外を `PortError` に変換してから TaskGroup へ渡すことで、音量監視の失敗でも
SDP 待機を取り消して全 resource を解放できる。型宣言だけで外部 JS の例外規約は保証しない。

## キャンセルの契約

`stop()` は登録済み resource と callback を同期的に解放し、同時に root task をキャンセルする。
その後に runtime が子タスクの巻き戻しを行う。公式 async のキャンセル信号は通常の `catch` では
捕まらず、`defer` が動く。`Stopped` は閉じた Lifetime への操作を拒否する別の checked error である。

`getUserMedia` のように元の処理を中断できないものは、待機の解除と後からの成功を分けて扱う。
値が届いてから async 関数が再開するまでの間に終了した場合も `discard` で解放する。
待機を Promise に包むだけでは、この所有権の受け渡しは保証できない。

次の利用契約は残る。

* 成功 callback は値の所有を渡す。既に渡した同じ resource を再送してはいけない。
  別の成功値が重複して届いた場合は、それも `discard` へ渡す。
* `wait` から受け取った resource は、次に待機する前に `life.own` 等へ登録する。
  音声取得では公開版の `acquire` を使い、その登録をライブラリ側で行う。
  resource を持たない値では `discard` は不要。
* cleanup は同期・例外なし。非同期 rollback 等は、この utility の対象にせず公式 async の
  `defer` / `protect_from_cancel` と個別 driver の契約で扱う。
* `Inbox` は一つの reader から消費する。複数 reader の公平性や配送保証を提供するものではない。

## 検証できた挙動の変更

従来は全 signaling を同じ queue に入れていたため、`createOffer` 等が完了しないと相手の退出や
会話終了の通知も待たされていた。現在は `Negotiation` enum の３種類だけを queue に入れる。
会話状態・相手退出・エラーはその場で処理し、SDP の途中でも接続と音声を閉じられる。
ICE の保留128件・negotiation queue 256件の上限は維持する。

型だけで保証できない競合に絞り、MoonBit に5件（寿命2件、callback / cancellation 3件）、
Node に終了通知の1件を追加した。既存の試験にも、保留 SDP と終了通知、再接続後の古い完了を
含めた。callback の同じスタックで後続処理まで終わるという前提は外し、条件成立を待って検査する。
E2E は増やしていない。

JS の通話・session の実行部分は JS ターゲットに限定した。native でも使う会話モデル、protocol、
純粋な状態処理、汎用 Lifetime はそのまま共有する。公開 JS の `.d.ts` に変更はない。

ローカルでは `check`、lint、生成物・fixture の差分検査、独立 TS consumer、MoonBit JS 26件 /
native 26件、Node 134件、native API 20件、production DOM 28件、native browser 11件、
Node 通話 parity 3件が成功した。音量取得の例外変換を修正した後も、関連単体29件と
native の実音声・再接続・終了3件を再確認した。
DOM と通話試験を同時に動かした際は Playwright の共通出力先が衝突したため、
`--output` で分離して DOM を再実行した。アプリの assertion の失敗ではない。

## 配布サイズと制約

Node 24.13.0、固定 MoonBit 0.10.14、同じ Vite 設定で、変更前 `53dd8e2` と `78e1d2b` の production
build を比較した。gzip は各出力ファイルに Node の `gzipSync` を適用した値。

| 対象 | 変更前 bytes / gzip | 変更後 bytes / gzip |
| --- | ---: | ---: |
| 通話画面 Session chunk | 23,662 / 8,064 | 69,493 / 19,288 |
| 共通 runtime chunk | 154,832 / 44,641 | 154,928 / 44,691 |
| index chunk | 29,082 / 10,248 | 29,082 / 10,250 |
| 全 JS の合計 | 301,023 / 103,948 | 347,004 / 115,266 |

公式 async runtime は通話画面の遅延 chunk に入り、追加の npm runtime 依存はない。
共通 chunk のサイズも完全に同一ではない。実行速度、CPU 負荷、メモリ使用量の改善は未測定。
今回は完了順序と解放を一か所で扱う構造のために、通話 chunk の gzip 約11 kB 増を受け入れた。

生成 JS を分割する既存 script には、公式 scheduler が使う core の Deque / Set 初期化を許可した。
任意の初期化関数を許すものではなく、単一の共有状態を保つ試験も維持する。

## 独立公開した範囲

2026-09-24 に既存の DisposableStack binding、editor の Disposable、公式 async を比較し、
即時終了と callback の資源受け渡しを扱う薄い層として
[moonbit-lifetime](https://github.com/Hosi121/moonbit-lifetime) を公開した。
`Hosi121/lifetime@0.1.0` は async 依存なし、`Hosi121/lifetime_js@0.1.0` が JS 接続を担う。
登録 ID の wrap / 再利用と、解除時の再入を修正し、`Inbox` は同時 reader を checked error で拒否する。

通話以外の ImageBitmap preview で、取消後の遅い decode、差し替え、DOM listener の解除、
描画例外による sibling task の取消を実ブラウザで検証した。配布 ZIP と Mooncakes 公開版の
双方から独立 consumer をビルドしている。SpeakUp は公開版を import し、汎用実装と内部試験の
コピーを持たない。[比較と公開判断](https://github.com/Hosi121/moonbit-lifetime/blob/main/docs/design.md)

公開版への切り替え後は `check`、frontend lint、独立 TS consumer、生成物・fixture の差分検査、
MoonBit JS 21件 / native 24件、Node 134件、native API 20件、production DOM 28件、
native browser 11件、Node 通話 parity 3件を通過した。アプリ側の MoonBit 試験が減ったのは
汎用の5件をライブラリ側へ移したため。通話の JS 公開型と payload の変更はない。

その後、フォームの Scope・通知 socket・マイク確認・認証送信にも公開版 Lifetime を適用した。
同期 callback の契約は保ち、全処理を一律に async 化していない。[現在の所有範囲](typed-boundaries.md#寿命の共有)
