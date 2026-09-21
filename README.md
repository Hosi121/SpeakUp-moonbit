# SpeakUp MoonBit

[SpeakUp](https://github.com/Hosi121/SpeakUp) の独立した実験的移植です。API の処理・通話の状態管理・マッチング・共通 DTO を MoonBit に移し、React の画面と型付きの Node／WebRTC アダプターを組み合わせています。

**MoonBit 化だけによる高速化は確認できませんでした。** ローカルの signaling 中継では Go 比較用実装とほぼ同程度で、JS/Node 版のメモリ使用量は大きくなります。[測定方法と結果](docs/performance.md)を参照してください。

## 起動

Node **24.13.0** 以上、Docker Compose を使います。MoonBit は **0.10.14+7d59c7ec9** で検証。Linux x86_64 用の固定版インストーラは既存のグローバル環境を変更せず `.tools/moon` に入れます。

```bash
npm ci
npm --prefix frontend ci
bash scripts/install-moon.sh
cp .env.example .env
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run dev
```

`http://localhost:5173/login` を開きます。開発用アカウントは `alice@example.test` / `bob@example.test`、パスワードは両方 `speakup-local-only`。Alice は管理者です。二つの別ブラウザまたは別プロファイルでログインし、それぞれ `/session` を開くと seed した room 1 で通話できます。マイクの許可が必要です。

この認証は `.env.example` の `AUTH_MODE=development` を明示したときだけ有効です。Supabase を使う場合は `AUTH_MODE=supabase`、URL/key と RS256 の鍵を設定します。開発用鍵は起動ごとに生成されるため、サーバ再起動後は再ログインしてください。

MySQL は `127.0.0.1:3308`、backend は `127.0.0.1:8081`。**移植用の新規 DB** を使います。元の Ent schema に対する in-place migration ではありません。seed はローカル確認用データのみを追加します。

外部ネットワークでの通話には HTTPS/WSS と TURN が必要になる場合があります。`TURN_URLS` / `TURN_SECRET` で期限付き TURN credentials を発行できます。Supabase、OpenAI、TURN の実サービスへの接続はこの repo のローカル試験には含みません。

## 型とコード生成

```text
core/shared       DTO、画面向け変換、WebSocket 入力検証
core/signaling    部屋と negotiation の状態管理（I/O なし）
core/matching     rank / round / 参加ビットによるペア生成
core/api          HTTP 入力検査、業務処理、SQL と応答構築
core/platform     TS2Mbt で生成した host binding
server            HTTP/WS、MySQL pool、JWT、外部 API のアダプター
frontend          既存 React UI、型付きブラウザアダプター
```

TS2Mbt と Mbt2TS は `@mizchi/ts@0.6.0` を固定して使います。共通型を TS に手で二重定義せず、MoonBit interface から生成します。手書きコード、生成 bridge、公開型の `any` / `Any` / `JSValue` を CI で禁止しています。

```bash
npm run generate       # bindings/host.d.ts → MoonBit、strict mode
npm run build:core     # MoonBit JS と公開 TypeScript 型を生成
npm run check          # MoonBit / TS / frontend build / 動的型の検査
```

標準 `.d.ts` の struct→any、Promise ABI、callback の opaque 型、JS prototype、数値範囲、JSON 境界については [移行記録](docs/migration.md#js-境界と-ts2mbt) に記載しています。

## 検証

DB の起動・migration・seed 後に実行します。

```bash
npm test
npm run test:native
npx playwright install chromium
npm run test:browser
npm run fixtures
npm run bench
node bench/summarize.mjs
```

テストは元 TS/Go を実行して作った fixture との比較、認証・API・WebSocket の MySQL 結合テスト、MoonBit native core test を含みます。Playwright は二つの実ブラウザの SDP/ICE 交換と双方の audio RTP 受信、退出、ログイン・メモ保存を確認します。

## 現在の範囲

Go backend の有効な主要 route と通話を移植しました。React/MUI と I/O アダプターは TS のままです。元から Go route がなかった会話履歴・通知・実績などのモック機能、管理 UI への新しい参加/マッチング API の全面統合、旧 DB データ移行、production rollout は未完成です。[機能別の対応表と変更点](docs/migration.md)で区別しています。

公開したコードは本番への切替ではありません。元 repo はそのまま残しています。元チームのコード・画像の出典は [NOTICE.md](NOTICE.md) を参照してください。
