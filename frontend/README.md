# SpeakUp frontend

React / TypeScript と標準 HTML/CSS による UI。共通の会話モデルと DTO は MoonBit の JS target と Mbt2TS から生成した `../dist/shared.js` / `.d.ts` を利用する。MUI・Emotion・CSS-in-JS の依存はない。

セットアップと native backend の起動は [ルート README](../README.md) を参照。ルートで `npm run dev` を実行すると共通コードをビルドし、native backend と Vite を起動する。

- `npm run build` — TypeScript check と production build
- `npm run lint` — ESLint
- `src/styles/app.css` — 共通の CSS と色
- `src/components/ui` — 型付き DOM 部品
- `src/services` — HTTP / WebRTC / マイク等のブラウザ境界

MUI の削除内容、bundle 比較、残る依存と未実装機能は [frontend の設計](../docs/frontend.md) に記載している。
