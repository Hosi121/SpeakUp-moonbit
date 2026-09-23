# SpeakUp frontend

MoonBit controller と標準 DOM / HTML / CSS による UI。
TypeScript は描画とブラウザ API を担当し、公開型は Mbt2TS で生成する。
frontend の実行時 npm 依存はない。

セットアップと起動は[開発手順](../docs/development.md)、責務・画面遷移・通信の契約は
[フロントエンド設計](../docs/frontend.md)を参照。

| 場所 | 内容 |
| --- | --- |
| `src/dom` / `src/message/dom.ts` | DOM renderer |
| `src/services` | ブラウザ API adapter |
| `src/styles/app.css` | CSS |
| `src/main.ts` | アプリの host と module 読み込み |

root で `npm run build:core` 後、このディレクトリの `npm run build` で production build、
`npm run lint` で ESLint を実行する。通常の開発は root の `npm run dev` を使う。
