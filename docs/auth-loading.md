# 認証フォームから共有コードの初期読み込みを分離

2026-09-23、未ログインのログイン／登録フォームで最初に読む JS を gzip 94,870 → 53,377 bytes（43.7% 減）にした。MoonBit の decoder、共有型、JSON の数値検査は変更していない。npm / Mooncakes の依存追加・削除・version 変更もない。

## 採用した構成

変更前 (`7bf6ffc25bdb67152b4c87d1591eeb44fb386b48`) は、認証フォームの `authService` と通知用の `features` が `dist/shared.js` を静的に import していた。この生成 module は全画面の DTO 検査を含むため、画面を分割しても login の初期 bundle に残っていた。Vite の module 集計では、minify 前の entry に生成コード 442,843 bytes が含まれていた。

[`authLoader.ts`](../frontend/src/services/authLoader.ts) を境界にし、フォーム自体は初期 bundle に残す。入力欄へのフォーカスで認証 service と共有 decoder を先読みし、送信も同じ module を使う。[動的 import の module cache](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) と [Vite の依存 chunk の並列読み込み](https://vite.dev/guide/features#async-chunk-loading-optimization)を利用する。独自 cache、型の複製、生成 JS の加工は追加しない。

送信処理は module の準備完了を待ってから API を呼ぶ。コード取得に失敗した場合に、登録だけが実行されて応答を扱えなくなることを防ぐ。先読み失敗は未処理の Promise rejection にせず、送信時に再読み込みの案内を表示する。読み込み待ちの間にフォームが破棄された場合は送信しない。この判定は新しく導入した module 待ちの境界に対するもので、送信済みの認証 API を取り消す機能ではない。

`ActivityLayout` は token があるときだけ通知 service を読み込む。読み込み後に effect の破棄・要求の世代を再確認し、ログアウト済みの処理から通知を取得しない。サーバーとの時計差の計測は module 読み込み後、HTTP の開始時刻から行う。

## 配信サイズ

Node v24.13.0 / Vite 7.3.6、同じ lockfile と MoonBit toolchain で production build した。初期フォームは localStorage に token がない条件。

| 指標 | 変更前 | 変更後 |
| --- | ---: | ---: |
| ログイン初期 JS bytes | 300,700 | 161,093 |
| ログイン初期 JS gzip bytes | 94,870 | 53,377 |
| ホーム直開き時の JS gzip bytes | 100,912 | 100,844 |
| 初回ログインからホームまでの JS gzip bytes | 100,912 | 101,068 |
| 初回ログインからホームまでの JS リクエスト数 | 8 | 11 |
| 全画面の JS gzip bytes 合計 | 125,531 | 126,217 |
| 全画面の JS ファイル数 | 28 | 31 |
| frontend の直接 runtime 依存 | 2 | 2 |
| lockfile の全 package（root 除外） | 228 | 228 |

初期配信を減らす変更であり、アプリ全体のコード削除ではない。全 JS の gzip 合計は 686 bytes（0.5%）増える。React / React DOM、HTTP adapter とすべての decoder は維持する。

## 速度比較と採用の限界

[`bench/auth-loading-results.json`](../bench/auth-loading-results.json) に全試行と build metadata を保存した。Linux / Intel Core Ultra 7 255H / Chromium 153.0.8010.12。gzip を付けた loopback HTTP/1.1、新しい browser context、HTTP cache 無効、warm-up 1 回を除外し各条件 7 回。旧／新の順番を交互にした。制限あり条件は CDP で latency 40 ms / download 200,000 bytes/s / upload 93,750 bytes/s / CPU slowdown 4 倍。

見出しが DOM に現れた後、2 animation frame が進むまでを計測する。LCP / INP ではない。認証は成功 token、イベントと通知は空の HTTP fixture で、実際の認証処理・DB・通知 WebSocket は測っていない。全ページの性能や実機の回線に一般化しない。

| 条件 | 画面 | 初回表示中央値 ms（前 → 後） |
| --- | --- | ---: |
| loopback | ログイン | 59.6 → 57.0 |
| loopback | ホーム直開き | 80.3 → 71.4 |
| 通信・CPU 制限 | ログイン | 756.9 → 545.2 |
| 通信・CPU 制限 | ホーム直開き | 827.9 → 853.7 |

さらに、Email / password を即座に `fill` して送信する条件と、34 文字を 30 ms 間隔で入力する条件を比較した。両方とも同じフォーカス・先読みのコードを通り、前者は入力時間による待ちの隠蔽がほぼない。後者の打鍵間隔は制御した入力条件であり、利用者の平均入力速度を主張するものではない。

| 条件 | 入力 | 送信 → ホーム ms（前 → 後） | ページを開く → ホーム ms（前 → 後） |
| --- | --- | ---: | ---: |
| loopback | 即時入力 | 44.2 → 57.2 | 182.0 → 195.5 |
| loopback | 30 ms 間隔 | 44.4 → 44.8 | 1,318.8 → 1,330.7 |
| 通信・CPU 制限 | 即時入力 | 222.0 → 410.7 | 1,165.7 → 1,134.2 |
| 通信・CPU 制限 | 30 ms 間隔 | 235.5 → 253.4 | 2,455.4 → 2,254.3 |

制限下のログイン初期表示は約 28% 短縮した。即時送信では decoder を待つため送信後が約 189 ms 長くなり、ページを開いてからの合計では約 32 ms 短い。入力を挟む条件では合計が約 201 ms 短い。一方、loopback の合計と制限下のホーム直開きは若干長くなった。7 試行・単一環境で信頼区間は算出していないため、この小さな差の有意性は未確認。

未ログインのフォームを先に使えることと、入力時間に取得を重ねられることを理由に採用した。すべての操作が速くなる変更とは扱わない。token を保持した再訪時は通知でも共有コードが必要になる。

## 再現と回帰試験

旧 checkout を上記 commit に固定し、新旧で README の toolchain 準備、`npm run build:core`、`npm --prefix frontend run build` を実行する。新 checkout から以下を実行する。DB と `.env` は不要。

```bash
node bench/navigation.mjs capture auth-eager /path/to/old-checkout
node bench/navigation.mjs capture auth-lazy
node bench/navigation.mjs compare auth-eager auth-lazy
node bench/navigation.mjs compare-auth auth-eager auth-lazy
```

capture は同じ label を上書きしない。別の試行には別名を使う。保存した旧 build は clean な `7bf6ffc`、新 build は同じ HEAD に今回の差分を加えた状態。hash 付き asset 名・bytes と全 timing を記録している。比較結果と build は `_build/navigation-bench/` に保存される。

`npm run test:navigation` は既存の画面遷移 7 件と、認証読み込みの 6 件を production build で実行する。入力・送信中の読み込み待ち、重複しない取得と送信、フォーム破棄後の送信抑止、失敗時の登録抑止と reload 復帰、通知コード読み込み中のログアウトを検証する。preview server の起動確認は他のブラウザ試験と同じ stdout 待ちにし、未使用の loopback port への接続が timeout する環境でも起動できるようにした。実際の画面と通信は各試験で確認する。

`npm run check` と lint、MoonBit JS 7 件・native 8 件、Node 54 件、native 結合 19 件、JS 境界の契約検査が成功。生成 fixture・型宣言は変更なし。既存の Node/native ブラウザ試験各 14 件と production 13 件、計 41 件も成功した。DB は今回専用の Compose project で作成し、検証後に container・volume とも削除した。
