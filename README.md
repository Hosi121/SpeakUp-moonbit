# SpeakUp MoonBit

[SpeakUp](https://github.com/Hosi121/SpeakUp) の独立した実験的移植です。API の処理・通話の状態管理・マッチング・共通 DTO を MoonBit に移し、React の画面と型付きの Node／WebRTC アダプターを組み合わせています。

イベントのラウンド通話と、相手を選んで随時始める 1 対 1 通話を、同じ会話モデルで扱います。再接続しても会話の開始時刻を保ち、終了後は本人だけの振り返りを保存できます。[モデルと設計判断](docs/domain-model.md)にまとめています。

**MoonBit 化だけによる高速化は確認できませんでした。** 今回のローカル signaling 中継の中央値は Go 比較用実装の約 0.90 倍で、JS/Node 版のメモリ使用量も大きくなります。[測定方法と結果](docs/performance.md)を参照してください。

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

`http://localhost:5173/login` を開きます。開発用アカウントは `alice@example.test` / `bob@example.test`、パスワードは両方 `speakup-local-only`。Alice は管理者です。二つの別ブラウザまたは別プロファイルでログインし、`/sessionlist` から同じ会話を選びます。マイクの許可が必要です。

seed のイベント通話を選ぶか、Alice が「相手を選んで通話する」で Bob を検索して新規通話を作れます。Bob は一覧を更新して参加します。双方が接続すると開始し、一人が終了すると双方の画面が振り返りへ進みます。画面から退出するだけなら会話は未終了のまま再参加できます。

この認証は `.env.example` の `AUTH_MODE=development` を明示したときだけ有効です。Supabase を使う場合は `AUTH_MODE=supabase`、URL/key と RS256 の鍵を設定します。開発用鍵は起動ごとに生成されるため、サーバ再起動後は再ログインしてください。

MySQL は `127.0.0.1:3308`、backend は `127.0.0.1:8081`。**移植用の新規 DB** を使います。元の Ent schema に対する in-place migration ではありません。seed はローカル確認用データのみを追加します。

初回公開版の移植用 DB は `npm run db:migrate` で更新できます。旧 room の ID を保って会話へ移し、旧表も残します。時刻が不明な FINISHED 行や二重割当がある場合はデータの確認が必要です。[更新時の扱い](docs/domain-model.md#検証と-db-更新)

外部ネットワークでの通話には HTTPS/WSS と TURN が必要になる場合があります。`TURN_URLS` / `TURN_SECRET` で期限付き TURN credentials を発行できます。Supabase、OpenAI、TURN の実サービスへの接続はこの repo のローカル試験には含みません。

## 型とコード生成

```text
core/shared       DTO、画面向け変換、WebSocket 入力検証
core/conversation 開始・終了・取消、再送時の不変条件（I/O なし）
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

テストは元 TS/Go を実行して作った fixture との比較、認証・API・WebSocket の MySQL 結合テスト、MoonBit native core test を含みます。DB 更新テストだけは Compose の開発用 root で一時 DB を作って削除します。別の隔離 MySQL を使う場合は `TEST_DATABASE_URL` / `TEST_MYSQL_ADMIN_URL` を設定してください。

Playwright はイベント／随時通話の双方で audio RTP 受信、退出と再接続、開始時刻の維持、同時終了通知、振り返りの保存・非公開性、ログイン・メモ保存を確認します。

## 現在の範囲

Go backend の主要 route と通話を移植し、会話のライフサイクル・随時通話・振り返り・履歴を新モデルで実装しました。React/MUI と I/O アダプターは TS のままです。着信の push 通知、実績・AI feedback、イベント管理 UI の全面統合、サーバ側の厳密な期限管理、元の Ent DB の移行、production rollout は未実施です。[機能別の対応表と変更点](docs/migration.md)で区別しています。

公開したコードは本番への切替ではありません。元 repo はそのまま残しています。元チームのコード・画像の出典は [NOTICE.md](NOTICE.md) を参照してください。
