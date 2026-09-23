# 開発手順

## 必要な環境

Linux x86_64、Node 24.13.0 以上、Docker Compose、C compiler、
MariaDB Connector/C と OpenSSL の開発ファイルを使う。固定 MoonBit は
`0.10.14+7d59c7ec9`。[インストーラ](../scripts/install-moon.sh)はハッシュを検証して
`.tools/moon` に展開し、既存のグローバル環境を変更しない。

```bash
sudo apt-get install build-essential libmariadb-dev libssl-dev
npm ci
npm --prefix frontend ci
bash scripts/install-moon.sh
npm run moon -- update
```

sudo を使えない Ubuntu 24.04 x86_64 では、代わりに
`bash scripts/install-native-deps.sh` でライブラリを `.tools/native` に展開できる。
macOS / Windows native は未検証。

## 初回起動

元の SpeakUp の DB・`.env` は使わず、専用の移植用 DB を作る。

```bash
cp .env.example .env
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run dev
```

| 接続先 | 既定値 |
| --- | --- |
| ブラウザ | `http://localhost:5173/login` |
| backend | `127.0.0.1:8081` |
| MySQL | `127.0.0.1:3308` |

開発用アカウントは `alice@example.test` / `bob@example.test`、パスワードは両方
`speakup-local-only`。Alice は管理者。`AUTH_MODE=development` を明示した場合だけ使用できる。
鍵は起動ごとに生成されるため、backend の再起動後は再ログインする。

別ブラウザまたは別プロファイルで二人としてログインし、`/sessionlist` から同じ会話に参加する。
seed のイベント通話のほか、「相手を選んで通話する」で随時通話を作れる。双方のマイク許可が必要。
通話の開始・退出・終了の規則は[ドメイン仕様](domain-model.md)を参照。

通常の停止は `docker compose stop db`。使い捨ての検証 DB を破棄する場合のみ
`docker compose down -v` を使う。後者は DB volume のデータを削除する。

## ビルドと実行

| コマンド | 内容 |
| --- | --- |
| `npm run generate` | TS2Mbt の binding を再生成 |
| `npm run build:core` | JS と Mbt2TS の公開型を生成 |
| `npm run build:native` | release の `dist/native/speakup` を生成 |
| `npm --prefix frontend run build` | frontend の型検査と production build |
| `npm run build` | 上記の JS・native・frontend build |
| `npm run dev` | JS / native を build し、native server と Vite を起動 |
| `npm start` | build 済みの native server を起動 |
| `npm run start:node` | 比較用 Node backend を起動 |

`npm start` は `.env` 読み込み後に `process.execve` で native 実行ファイルへ置き換わる。
稼働中の backend に Node event loop はない。環境変数・共有ライブラリを用意すれば
`./dist/native/speakup` で直接起動できる。Node はビルドと DB migration / seed に使用する。

native build は `--no-strip` でスタック情報を残す。
調査用には `NATIVE_DEBUG=1 npm run build:native`、通常へ戻すには `npm run build:native` を使う。
同じ生成先への build は順番に実行する。

## 設定

[.env.example](../.env.example) がローカル設定のひな型。

| 環境変数 | 用途 |
| --- | --- |
| `HOST / PORT` | backend の待受け |
| `DATABASE_URL` | `mysql://user:password@host:port/database`。DNS / IPv4、user・password・database の percent encoding に対応。query parameter は未対応 |
| `MYSQL_SSL_CA` | 指定時は TLS と DB サーバ証明書の検証を必須にする |
| `MYSQL_PLUGIN_DIR` | native MySQL 認証 plugin の探索先 |
| `PUBLIC_ORIGIN / ALLOWED_ORIGINS` | 画像の公開 origin と接続を許可する origin |
| `AUTH_MODE` | ローカル専用の `development`、または `supabase` |
| `SUPABASE_URL / SUPABASE_ANON_KEY` | Supabase 認証 |
| `JWT_PRIVATE_KEY / JWT_PUBLIC_KEY` | RS256 の鍵。実改行または `\n` を使用 |
| `OPENAI_API_KEY / OPENAI_MODEL` | AI の有効化と model。既定 model は `gpt-4.1-mini` |
| `OPENAI_BASE_URL` | 互換 API / fixture 用。既定は `https://api.openai.com/v1` |
| `TURN_URLS / TURN_SECRET` | 期限付き TURN credentials |
| `VITE_API_URL` | frontend の API base。未指定は `/api`。変更後は frontend を再ビルド |

Vite は `/api` を backend HTTP、`/ws` と `/activity` を WebSocket へ転送する。
別の配信環境では同等の proxy と、URL 直開き用の SPA fallback を設定する。
外部ネットワークでは HTTPS/WSS と TURN が必要になる場合がある。
実サービス接続の検証範囲は[テスト](testing.md#検証範囲)を参照。

## 入出力の上限

| 対象 | 上限・動作 |
| --- | --- |
| HTTP JSON / avatar | 64 KiB / 2 MiB |
| 通話 WebSocket | frame 64 KiB、100 messages/秒、送信待ち256 KiB、接続10,000件 |
| 接続認証 | 5秒。通知 socket の初回入力は8 KiB |
| native DB | 接続・read/write timeout 5秒、結果10,000行 / 16 MiB |
| 外部 AI | timeout 20秒 |
| DB session | utf8mb4・UTC・matched-row count |

これらは入出力を制限する設定値であり、保証する処理能力ではない。

## 移植用 DB の更新

`npm run db:migrate` はこの repo の schema を更新する。元の Go/Ent DB の直接変換ではない。

- 旧 `rooms` は ID を保って会話へコピーする。旧表を残し、再実行で完了状態を初期化しない。
- 終了時刻を持たない旧 FINISHED 行や二重割当は、時刻を補完せず停止・rollback する。元データの確認が必要。
- 旧 `friends` は相互 FRIEND を承認済み、片方向を申請中へ移す。BLOCKED は維持する。
- 再実行で関係や通知を重複作成しない。

検証用 DB は空の専用 DB に migration → seed の順で準備する。
[検証コマンドと接続先の指定](testing.md#実行)を参照。
