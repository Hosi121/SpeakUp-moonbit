# 画面遷移と初回表示の軽量化

> 移行段階の記録（参照 revision: `e26c994`）。現在は全画面から React を削除済み。
> [現在の構成と測定](react-removal.md)を参照。以下の React 固有コードと数値は当時のもの。

このページは `7bf6ffc` で行った画面分割の記録。現在の認証フォームの先読みと追加計測は [認証コードの初期読み込み](auth-loading.md)を参照。

2026-09-23、React Router を削除し、ブラウザの History API で既存の平坦な画面一覧を切り替える構成にした。frontend の直接 runtime 依存は React / React DOM。HTTP 応答の検査とドメイン型は引き続き MoonBit と Mbt2TS の生成宣言を使う。

## 実装の範囲

- [`navigation/location.ts`](https://github.com/Hosi121/SpeakUp-moonbit/blob/e26c994/frontend/src/navigation/location.ts): URL を React に購読させ、同一 origin の `pushState` / `replaceState` と戻る・進むを扱う。
- [`navigation/links.tsx`](https://github.com/Hosi121/SpeakUp-moonbit/blob/e26c994/frontend/src/navigation/links.tsx): 実際の `a href` を使う。通常のアプリ内クリックを処理し、修飾キー、新しいタブ、download、外部 URL、同じページの hash はブラウザへ任せる。
- [`App.tsx`](https://github.com/Hosi121/SpeakUp-moonbit/blob/e26c994/frontend/src/App.tsx): 既存のパス、メッセージ相手の ID、旧 URL の転送先を宣言する。query の conversation ID は各画面で従来と同じ範囲を検査する。未知のパスは戻り先のある画面を表示する。
- [`PageBoundary.tsx`](https://github.com/Hosi121/SpeakUp-moonbit/blob/e26c994/frontend/src/navigation/PageBoundary.tsx): 画面取得の失敗時に再読み込みを案内する。URL のパスが変わると前画面を unmount し、遷移先の読み込みが遅くても media を解放する。

通知の `ActivityLayout` は画面切り替えをまたいで維持し、ログイン・ログアウト時は現在の token で接続を更新する。ログイン／登録は初期 bundle に含め、ほかの画面を `React.lazy` で読み込む。初めて開く画面では追加の JS リクエストが発生する。未取得時は読み込み状態を表示し、既に読み込んだ module は再利用する。

History API はブラウザ I/O、画面表はこのアプリの UI の定義なので TS に置いた。loader / action / nested route の状態は元から使っていない。汎用 Router の機能全体を保有する構成にはせず、今回の app adapter を独立ライブラリとして配布しない。

`pushState` は `popstate` を発火しないので、プログラムからの遷移には専用の更新通知を使う。[MDN の履歴イベント](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event)。React 側は stable な URL 文字列を [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) の snapshot として読む。遷移時に古い画面を保持する transition は使わず、通話の後始末を先に進める。静的配信側は従来どおり、アプリの URL を `index.html` へ返す SPA fallback が必要。

## 削減量

変更前は `4d4dd61bdd1adc17c1666770c5d909618c7fa165`。Node 24.13.0 / Vite 7.3.6 で両方を production build。残存パッケージの version 変更と、新しい package の追加はない。

| 指標 | 変更前 | 変更後 |
| --- | ---: | ---: |
| ログイン初期 JS bytes | 416,975 | 300,700 |
| ログイン初期 JS gzip bytes | 130,618 | 94,870 |
| ホーム初期 JS gzip bytes | 130,618 | 100,912 |
| ホーム初期 JS リクエスト数 | 1 | 8 |
| 全画面の JS bytes 合計 | 416,975 | 364,329 |
| 全画面の JS gzip bytes 合計 | 130,618 | 125,531 |
| 全画面の CSS gzip bytes 合計 | 2,295 | 2,355 |
| frontend の直接 runtime 依存 | 3 | 2 |
| lockfile の全 package（root 除外） | 334 | 228 |
| lockfile の non-dev package | 8 | 5 |

ログイン初期 JS gzip は 27.4% 減。分割後は使う画面によって通信量が変わり、全画面の JS を足すと 3.9% 減になる。chunk ごとの圧縮と request の増加を含むため、初期 bundle の削減率をアプリ全体の削減率としては使わない。

削除した 106 package は React Router 関連の 3 つと、未使用だった `eslint-plugin-react` / `eslint-config-prettier` に由来する 103 個の開発用依存。使用中の lint ルールは変更していない。[依存監査の記録](dependencies.md)。

## ブラウザでの比較

[`bench/navigation.mjs`](../bench/navigation.mjs) は旧／新の build を保存し、gzip を付けたローカル HTTP/1.1 サーバから Chromium で読み込む。各条件で新しい browser context を作り、HTTP cache を無効化する。順序を交互に入れ替え、warm-up 1 回を除いて各 7 回を測った。生の timing、実際に読み込んだ script、build metadata は [`bench/navigation-results.json`](../bench/navigation-results.json)。

測る値は navigation 開始から対象画面の見出しが DOM に現れ、その後 2 animation frame が進むまで。登録への遷移は実際の click から同じ条件まで。LCP / INP や API の完了時間ではない。ホームの予定一覧は空の HTTP fixture を使い、認証・通知 WebSocket・DB は測定に含めない。

環境は Linux、Intel Core Ultra 7 255H、Node v24.13.0、headless Chromium 153.0.8010.12。通常の loopback と、CDP で latency 40 ms / download 200,000 bytes/s / upload 93,750 bytes/s / CPU 4 倍 slowdown を指定した条件を比較した。後者は実機のモバイル回線ではない。

| 条件 | 画面 | 初回表示の中央値 ms（前 → 後） |
| --- | --- | ---: |
| loopback | ログイン | 138.5 → 124.5 |
| loopback | ホーム | 152.3 → 152.0 |
| 通信・CPU 制限 | ログイン | 1,176.4 → 981.3 |
| 通信・CPU 制限 | ホーム | 1,240.9 → 1,110.3 |

ログインから登録への遷移は、loopback 24.9 → 22.8 ms、制限あり 94.7 → 77.0 ms。両画面を初期 bundle に残しているため、追加 chunk を待たない。

この測定では制限ありの初回表示が約 11–17% 短縮した。通常条件のホームはほぼ同じで、サイズ削減がそのまま表示時間の改善になるわけではない。単一環境・各 7 回の比較で信頼区間は算出していない。実回線、実機の CPU、全画面の遷移、backend の性能へこの数値を一般化しない。

保存した旧 build の metadata は HEAD `4d4dd61`、dirty は測定スクリプトの追加によるもの。新 build は同じ HEAD に今回の変更を加えた未コミット状態。capture 時の asset の hash / bytes と依存一覧も保存した。

## 再現と回帰試験

README の toolchain 準備を済ませた新旧 checkout で、それぞれ `npm run build:core` と `npm --prefix frontend run build` を実行する。旧 checkout は上記 commit に固定する。新 checkout から次を実行する。DB や `.env` は不要。

```bash
npx playwright install chromium
node bench/navigation.mjs capture router-before /path/to/old-checkout
node bench/navigation.mjs capture history-after
node bench/navigation.mjs compare router-before history-after
```

同じ label の capture は上書きしない。別の測定では新しい label を使う。結果は `_build/navigation-bench/` 以下に出力する。

`npm run test:navigation` は production build と preview server で 7 件のブラウザ試験を実行する。履歴、URL 直開き、query と hash、リンクの新規タブ・download、転送、未定義パス、遅い chunk に対する戻る操作、media 解放、chunk 取得失敗からの復帰を含む。API は明示した fixture で、DB は使わない。

JS/native 両サーバの既存ブラウザ試験も実行する。そこで検出したメモ初回取得の競合は、画面を破棄した際の abort と、古い応答を反映しない検査で修正した。StrictMode で破棄された effect の応答を後から完了させても、編集中のメモが上書きされないことを回帰試験にした。通話の実 RTP、再接続、終了、プロフィール・画像・メモの保存も従来の試験で確認する。
