# JS 境界の契約 fixture

SpeakUp の `wire` / `bridge` と、固定版 `@mizchi/ts@0.6.0` の生成・検査を
独立した JS consumer から実行する fixture です。アプリが採用する DTO と
文字列 callback の契約を検証します。

- `src/contract`: 整数検証を通した DTO、callback の成功・失敗・二重完了
- `host.d.ts`, `host.mjs`: TS2Mbt の入力と実際の JS host
- `src/platform`: `npm run generate` で再生成する bridge
- `generated`: Mbt2TS から生成する raw 宣言

root で `npm run test:boundaries` を実行します。生成 JS の実行テストと
TypeScript の strict consumer 検査の両方を通します。
`#js-boundary/host` は root の `package.json` で `host.mjs` に解決します。

Native MySQL / WebSocket の独立 consumer は
[servicekit.mbt](https://github.com/Hosi121/servicekit.mbt/tree/main/examples) に移動しました。
