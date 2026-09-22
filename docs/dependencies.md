# 依存関係の確認

## npm の更新と監査（2026-09-22）

初回移植後の `npm audit` は frontend に 21 件（high 12、moderate 8、low 1）。互換範囲の更新後は high/critical 0、moderate 2。`npm audit fix --force` は使っていない。

Axios 1.13.2 → 1.20.0、Vite 7.3.1 → 7.3.6、React Router 6.30.3 → 6.30.6 と推移的依存を更新した。ESLint 9.39.5 / typescript-eslint 8.70.1 に揃え、元の plugin が起動時に落ちる組み合わせも解消した。React の major update は含めない。その後 MUI・Emotion を削除し、標準 HTML/CSS へ置換した。[依存削減と build 比較](frontend.md)。

この時点で残った監査項目は react-router / react-router-dom に対する以下の advisory。更新時には v7 への移行を見送ったが、翌日の依存削減で Router 自体を削除した。

- [外部への意図しない navigation](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6): この UI の遷移先は固定のアプリ内パス。可変の friendName は `/message/` 以下の一つの segment として `encodeURIComponent` する。任意の redirect URL を受け取る機能を追加するときは再評価する。
- [SSR hydration の constructor injection](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg): この UI は `createRoot` で描画する SPA で、SSR/hydration を実装していない。現構成には該当する入力経路がないと判断した。

監査結果がゼロという意味ではない。上記は現在の利用箇所に基づく判断であり、依存の脆弱性そのものを修正したものではない。

更新後の TypeScript check、production build、API/WS 結合テスト、ブラウザの通話・ログイン・メモ保存を検証した。更新直後の JS bundle は約 698 kB → 713 kB、その後の会話モデル整理で約 708 kB。MUI 削除後は約 422 kB、lint の従来の hooks 警告 2 件と 500 kB を超える chunk の build 警告は解消した。MUI 削除による残存パッケージのバージョン変更はなく、Router の moderate 2 件は残る。


## Axios の削除（2026-09-23）

frontend の HTTP adapter を標準 `fetch` にし、Axios 1.20.0 を削除した。新しい runtime / dev 依存の追加、残存パッケージのバージョン更新はない。

lockfile から削除した 11 package は `axios`、`agent-base`、`asynckit`、`combined-stream`、`delayed-stream`、`follow-redirects`、`form-data`、`https-proxy-agent`、`mime-db`、`mime-types`、`proxy-from-env`。全 package は 345 → 334、non-dev は 35 → 8。後者には、ビルドツールでも使う 16 package が dev のみに変わった分を含む。lockfile の個数であり、すべてがブラウザ bundle に入っていたという意味ではない。

frontend の直接 runtime 依存は React / React DOM / React Router の 3 つ。backend / 開発ツールの npm 依存と Mooncakes の依存は変更していない。上記のセキュリティ監査は 2026-09-22 時点の記録であり、今回の削除で Router の advisory が解消されたとは扱わない。

認証、HTTP エラー、multipart、キャンセルと、JS/native 両 backend に対する通話を検証する。JS gzip は 147,802 → 130,618 bytes。[測定条件と速度比較](http-client.md)、[UI 全体の依存削減](frontend.md)。

## React Router と未使用の開発用依存の削除（2026-09-23）

`react-router-dom`、`react-router`、`@remix-run/router` の 3 package を削除した。ルーティングは既存の平坦な画面一覧とブラウザの History API に絞り、画面コードを遅延読み込みする。[構成と表示速度の比較](navigation.md)。

ESLint の flat config は `eslint-plugin-react-hooks` と `eslint-plugin-react-refresh` を使うが、manifest に残っていた `eslint-plugin-react` と `eslint-config-prettier` を import / extends していなかった。この 2 つと不要になった推移的依存、計 103 package を削除した。実行されるルールを減らす変更はなく、lint を再実行して確認した。Prettier、TypeScript、Vite、使用中の ESLint plugin は維持する。

合計 106 package を削除し、lockfile は 334 → 228（root 除外）。non-dev は 8 → 5、直接 runtime 依存は React / React DOM の 2 つ。残存 package の version 変更・新規 package の追加はない。103 個の開発用依存の削除をブラウザ bundle の削減量としては数えない。

削除後の `npm --prefix frontend audit --json` は total / critical / high / moderate / low がすべて 0（2026-09-23）。以前残っていた Router の advisory は対象 package ごと依存から外れた。これは当日の frontend lockfile の監査結果。

## React / React DOM の削除（2026-09-23）

全画面の DOM renderer を実装し、直接 runtime 依存は 2 → 0、lockfile の non-dev
package は 5 → 0、全 package は 228 → 172（root 除外）になった。
React / React DOM / scheduler と、React 型、Vite React plugin、React Hooks / Refresh
の ESLint plugin、不要になった Babel 系など計56 package を削除。
新規 package の追加・残存 package の version 変更はない。TypeScript、Vite、
Prettier、ESLint / typescript-eslint は開発用に残す。Node backend の比較・DB 準備用
依存、Mooncakes、TS2Mbt のバージョンは変更していない。

uninstall 時の npm audit は脆弱性 0（当日の frontend lockfile）。
削除した React 専用 lint rule は DOM コードには適用しない。TypeScript の lint と
動的型の監査、renderer への通信・JSON・アプリ状態の持ち込みを防ぐ検査は維持する。
[配信量と表示時間の比較](react-removal.md)。

## SQL 抽象化で追加した MoonBit 依存

アプリの native module に `Hosi121/sql_session@0.1.0` を追加し、`Hosi121/mysql` を 0.3.0 に更新した。`Hosi121/ws_session@0.1.0` とともに Mooncakes の公開版から解決する。`moonbitlang/async` は 0.22.1 のまま。npm / frontend / `@mizchi/ts` のバージョン変更はない。

`moonbit-sessions` の PostgreSQL adapter は `moonbit-community/postgres@0.0.8` を追加した。推移的依存は `moonbitlang/x@0.4.41` と `tonyfettes/unicode@0.3.0`。ライブラリ CI の実 DB 試験には PostgreSQL 17 の disposable container を追加した。これらの検証はライブラリ repo で実行する。SpeakUp の runtime と CI は MySQL を使い、PostgreSQL module を依存に含めない。

## Mooncakes 配布への整理

ライブラリ repo は `Hosi121/moonbit-sessions` に改名した。公開 namespace は
`Hosi121`、ライセンスは Apache-2.0。`sql` は責務を示す `sql_session` に改名し、
SpeakUp の `moon.mod` / `moon.pkg` を更新した。2026-09-22 に5 module を
Mooncakes へ公開し、registry から取得した独立 consumer をビルドした。
SpeakUp も公開版に切り替え、開発用 submodule とその専用テスト起動スクリプトを
削除した。ライブラリ固有のテストはライブラリ CI、公開版との結合試験はアプリ CI
で実行する。

ライブラリ検証には `moonbitstack/moondb@0.1.8` と
`moonbitstack/moonpostgres@0.6.0` を追加した。これらはライブラリの独立 consumer と
実 DB 試験で使用する。SpeakUp の runtime module には追加していない。
配布 ZIP を取り出した独立 consumer のビルドもライブラリ CI で確認する。
