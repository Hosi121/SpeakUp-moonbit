# 依存関係の確認（2026-09-22）

初回移植後の `npm audit` は frontend に 21 件（high 12、moderate 8、low 1）。互換範囲の更新後は high/critical 0、moderate 2。`npm audit fix --force` は使っていない。

Axios 1.13.2 → 1.20.0、Vite 7.3.1 → 7.3.6、React Router 6.30.3 → 6.30.6 と推移的依存を更新した。ESLint 9.39.5 / typescript-eslint 8.70.1 に揃え、元の plugin が起動時に落ちる組み合わせも解消した。React/MUI の major update は含めない。

残る監査項目は react-router / react-router-dom に対する以下の advisory。修正版は 7.18.0 以降であり、v7 への移行は別作業にする。

- [外部への意図しない navigation](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6): この UI の遷移先は固定のアプリ内パス。可変の friendName は `/message/` 以下の一つの segment として `encodeURIComponent` する。任意の redirect URL を受け取る機能を追加するときは再評価する。
- [SSR hydration の constructor injection](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg): この UI は `createRoot` で描画する SPA で、SSR/hydration を実装していない。現構成には該当する入力経路がないと判断した。

監査結果がゼロという意味ではない。上記は現在の利用箇所に基づく判断であり、依存の脆弱性そのものを修正したものではない。

更新後の TypeScript check、production build、API/WS 結合テスト、ブラウザの通話・ログイン・メモ保存を検証した。更新直後の JS bundle は約 698 kB → 713 kB（minified、約 2% 増）。その後の会話モデル整理で約 708 kB、lint の従来の hooks 依存配列警告は 2 件となった。500 kB を超える chunk の build 警告は残っている。
