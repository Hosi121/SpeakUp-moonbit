# JS 境界の契約 fixture

SpeakUp の `wire / bridge` と固定版 TS2Mbt / Mbt2TS の生成物を、
独立した JS / TypeScript consumer から検証する。

| 場所 | 内容 |
| --- | --- |
| `src/contract` | 整数検証、callback の成功・失敗・二重完了 |
| `host.d.ts / host.mjs` | TS2Mbt の入力と実際の JS host |
| `src/platform` | `npm run generate` で再生成する bridge |
| `generated` | Mbt2TS の raw 宣言 |

root で `npm run test:boundaries` を実行する。
生成 JS の実行と TypeScript strict consumer の型検査を行う。
`#js-boundary/host` は root の `package.json` で `host.mjs` に解決する。

公開境界の契約は[アーキテクチャ](../../docs/architecture.md#js-境界と生成)を参照。
Native MySQL / WebSocket の独立 consumer は
[moonbit-sessions](https://github.com/Hosi121/moonbit-sessions/tree/main/examples) で管理する。
