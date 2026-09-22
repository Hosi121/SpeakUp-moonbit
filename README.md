# SpeakUp MoonBit

[SpeakUp](https://github.com/Hosi121/SpeakUp) の独立した実験的移植です。API の処理・通話の状態管理・マッチング・共通 DTO を MoonBit に移し、native の HTTP／WebSocket サーバと React の画面を組み合わせています。共通 MoonBit コードを backend は native、frontend は JS へビルドします。

イベントのラウンド通話と、相手を選んで随時始める 1 対 1 通話を、同じ会話モデルで扱います。再接続しても会話の開始時刻を保ち、終了後は本人だけの振り返りを保存できます。[モデルと設計判断](docs/domain-model.md)にまとめています。

SQL の接続・トランザクション管理、MySQL adapter、WebSocket の送信・終了処理は、別 repo の **[moonbit-sessions](https://github.com/Hosi121/moonbit-sessions)** を利用しています。`Hosi121/sql_session@0.1.0` が寿命管理を担い、ライブラリは既存の PostgreSQL client/pool と `moondb.AsyncDriver` を再利用します。SpeakUp は `Hosi121/mysql@0.3.0` と `Hosi121/ws_session@0.1.0` を含む3 module を、Apache-2.0 の公開版として Mooncakes から取得します。依存は `moon.mod` で宣言しており、submodule の初期化は不要です。[既存ライブラリとの役割分担](https://github.com/Hosi121/moonbit-sessions/blob/main/docs/ecosystem.md)

共通 API は MySQL / PostgreSQL の両実 DB で同じ契約試験を実行しています。SpeakUp の native backend もその API を使いますが、アプリの SQL・schema・運用 DB は引き続き MySQL です。SQL 方言の自動変換やアプリ全体の PostgreSQL 対応を意味しません。[実装した抽象化と制約](https://github.com/Hosi121/moonbit-sessions/blob/main/docs/database-abstraction.md)

**今回の測定では native 化による高速化は確認できませんでした。** signaling 中継の中央値は Go 比較用実装の約 0.95 倍。中継プログラムの RSS は JS/Node の約 85 MiB に対し native は約 10.5 MiB でした。[測定方法と結果](docs/performance.md)を参照してください。

## 起動

Linux x86_64、C compiler、MariaDB Connector/C・OpenSSL の開発ファイル、Node **24.13.0** 以上、Docker Compose を使います。MoonBit は **0.10.14+7d59c7ec9** で検証。Linux x86_64 用の固定版インストーラは既存のグローバル環境を変更せず `.tools/moon` に入れます。

```bash
# Ubuntu: sudo apt-get install build-essential libmariadb-dev libssl-dev
# sudo なしの Ubuntu 24.04: bash scripts/install-native-deps.sh
npm ci
npm --prefix frontend ci
bash scripts/install-moon.sh
npm run moon -- update
cp .env.example .env
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run dev
```

通常の backend は native です。`npm start` は `.env` を読み込んで native 実行ファイルへ置き換わり、稼働中のサーバに Node event loop はありません。[構成と起動方法](docs/native.md)を参照してください。

`http://localhost:5173/login` を開きます。開発用アカウントは `alice@example.test` / `bob@example.test`、パスワードは両方 `speakup-local-only`。Alice は管理者です。二つの別ブラウザまたは別プロファイルでログインし、`/sessionlist` から同じ会話を選びます。マイクの許可が必要です。

seed のイベント通話を選ぶか、Alice が「相手を選んで通話する」で Bob を検索して新規通話を作れます。Bob には通知と一覧の更新が届き、自分で参加を選びます。双方が接続すると開始し、一人が終了すると双方の画面が振り返りへ進みます。画面から退出するだけなら再参加できます。イベント通話は開始から 300 秒でサーバーが終了させます。

この認証は `.env.example` の `AUTH_MODE=development` を明示したときだけ有効です。Supabase を使う場合は `AUTH_MODE=supabase`、URL/key と RS256 の鍵を設定します。開発用鍵は起動ごとに生成されるため、サーバ再起動後は再ログインしてください。

MySQL は `127.0.0.1:3308`、backend は `127.0.0.1:8081`。**移植用の新規 DB** を使います。元の Ent schema に対する in-place migration ではありません。seed はローカル確認用データのみを追加します。

初回公開版の移植用 DB は `npm run db:migrate` で更新できます。旧 room の ID を保って会話へ移し、旧表も残します。時刻が不明な FINISHED 行や二重割当がある場合はデータの確認が必要です。[更新時の扱い](docs/domain-model.md#検証と-db-更新)

外部ネットワークでの通話には HTTPS/WSS と TURN が必要になる場合があります。`TURN_URLS` / `TURN_SECRET` で期限付き TURN credentials を発行できます。Supabase、OpenAI、TURN の実サービスへの接続はこの repo のローカル試験には含みません。

## 型とコード生成

```text
core/shared       DTO、画面向け変換、HTTP 応答・WebSocket 入力検証
core/conversation 開始・終了・取消、再送時の不変条件（I/O なし）
core/signaling    部屋と negotiation の状態管理（I/O なし）
core/matching     rank / round / 参加ビットによるペア生成
core/api          HTTP 入力検査、業務処理、SQL と応答構築
core/native_server    native HTTP / 通話 controller
core/native_transport connection ID 管理、signaling の判断と配送
core/native_io        HTTP 入力制限、async 0.22.1 の close drain
core/native_host      共通 SQL API の利用・MySQL 設定・DB 値変換 / JWT / 外部 API
core/wire, bridge     アプリの JSON 数値検査と JS callback 規約
scripts/boundaries    固定版 TS2Mbt / Mbt2TS の生成・公開型検査
examples/js-boundary  アプリの JS 境界を実行する契約 fixture
core/platform     TS2Mbt で生成した JS host binding
server            比較用 JS backend、DB migration / seed
frontend          React + 標準 HTML/CSS、型付きブラウザアダプター
```

TS2Mbt と Mbt2TS は `@mizchi/ts@0.6.0` を固定して使います。共通型を TS に手で二重定義せず、MoonBit interface から生成します。手書きコード、生成 bridge、公開型の `any` / `Any` / `JSValue` を CI で禁止しています。

frontend の直接 runtime 依存は React / React DOM の 2 つです。HTTP は標準 `fetch` と共通 MoonBit decoder、画面遷移は History API を使います。未ログインの認証フォームが最初に読む JS は gzip 約 53 kB。入力時に認証処理を先読みします。[初回表示と送信後の待ち時間の比較](docs/auth-loading.md)、[画面遷移](docs/navigation.md)、[通信の契約](docs/http-client.md)を記録しています。

```bash
npm run generate       # bindings/host.d.ts → MoonBit、strict mode
npm run build:core     # MoonBit JS と公開 TypeScript 型を生成
npm run build:native   # native サーバを生成
npm run check          # MoonBit / TS / frontend build / 動的型の検査
```

標準 `.d.ts` の struct→any、Promise ABI、callback の opaque 型、JS prototype、数値範囲、JSON 境界については [移行記録](docs/migration.md#js-境界と-ts2mbt) に記載しています。

## 検証

DB の起動・migration・seed 後に実行します。

```bash
npm test
npm run test:native
npm run test:boundaries
npm run test:integration:native
npx playwright install chromium
npm run test:browser
npm run test:browser:native
npm run test:navigation # production build を作って画面遷移を検証。DB は不要
npm run fixtures
npm run bench
node bench/summarize.mjs
```

テストは元 TS/Go を実行して作った fixture との比較、認証・API・WebSocket の MySQL 結合テスト、MoonBit native test を含みます。API/WS とブラウザ試験は JS/native の両サーバで実行します。native は jose との JWT 相互検証と、全 DB 接続のロック待ち中にも signaling が進む試験を含みます。DB 更新テストだけは Compose の開発用 root で一時 DB を作って削除します。別の隔離 MySQL を使う場合は `TEST_DATABASE_URL` / `TEST_MYSQL_ADMIN_URL` を設定してください。

Playwright はイベント／随時通話の双方で audio RTP 受信、退出と再接続、開始時刻の維持、同時終了通知、振り返りの保存・非公開性、ログイン・メモ保存を確認します。

ライブラリ単体の型境界・接続寿命・各 DB adapter・配布物の検証は `moonbit-sessions` の CI が担当します。この repo の CI は Mooncakes の公開版でアプリをビルドし、上記の結合試験と通話試験を実行します。

## 現在の範囲

Go backend の主要 route と通話を移植し、会話のライフサイクル・随時通話・振り返り・履歴を新モデルで実装しました。画面は React/TypeScript と標準 HTML/CSS。MUI・Emotion は削除し、別の UI framework は追加していません。[UI の構成と残る TypeScript](docs/frontend.md)を参照してください。backend I/O は MoonBit async と Connector/C・OpenSSL binding です。フレンド申請と承認、保存されるメッセージ、アプリ内通知、実績、本人の選択回答・AI アドバイス、イベント参加・管理、サーバーによる期限終了も実装しています。[機能の詳細](docs/features.md)を参照してください。OS Web Push、元の Ent DB の移行、production rollout は未実施です。[機能別の対応表と変更点](docs/migration.md)で区別しています。

公開したコードは本番への切替ではありません。元 repo はそのまま残しています。元チームのコード・画像の出典は [NOTICE.md](NOTICE.md) を参照してください。
