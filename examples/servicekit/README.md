# servicekit の独立 consumer

この MoonBit module の依存は `hosi121/servicekit` と `moonbitlang/async` だけです。SpeakUp の core / DB schema / 認証は使いません。

- `src/contract`: `Note` DTO、厳密な整数検証、JS の callback 境界。`generated/` の宣言は Mbt2TS で再生成します。
- `src/platform`: `host.d.ts` から TS2Mbt が生成した host binding。`host.mjs` は成功・失敗・二重完了を返す検証用 host です。
- `src/server`: localhost:18083 の echo server。`/finish` は最後の payload を送って close、`/overflow` は queue のメッセージ数上限を検証します。
- `src/check_mysql`: 明示した隔離 MySQL に対する利用契約の検証用実行ファイル。

root の `npm run test:servicekit` と `npm run test:servicekit:mysql` で実行できます。
生成 JS が使う `#servicekit-example/host` は package.json の imports で `host.mjs` に解決します。
別 workspace で利用するときは、実際の host に対応する module specifier で TS2Mbt を生成し直してください。

[ライブラリの設定と制約](../../packages/servicekit/README.md)
