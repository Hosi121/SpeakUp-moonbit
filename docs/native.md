# Native backend

backend は MoonBit の native target でビルドする Linux 実行ファイル。HTTP／WebSocket は `moonbitlang/async@0.22.1`、MySQL は MariaDB Connector/C、RSA／HMAC は OpenSSL の型付き FFI を使う。Linux x86_64、MySQL 8.4 で検証した。macOS／Windows は今回の対応範囲に含めない。

```mermaid
flowchart LR
  Core[MoonBit 共通 DTO・検証・状態モデル] --> JS[JS へコンパイル]
  Core --> Native[native へコンパイル]
  JS --> UI[React / TypeScript]
  Native --> API[MoonBit API・通話 controller]
  UI <-->|JSON / WebSocket| API
  API --> IO[MoonBit async HTTP / WebSocket]
  API --> DB[Connector/C worker pool]
  DB --> MySQL[(MySQL)]
```

ブラウザへ backend の実行ファイルを渡す構成ではない。同じ MoonBit の定義をそれぞれの target にビルドする。TypeScript は Mbt2TS 生成の `.d.ts` を参照する。ネットワーク上は JSON なので、共通型とは別に入出力の検証が必要。

## ビルドと起動

Node 24.13.0、固定版 MoonBit、C compiler、MariaDB Connector/C と OpenSSL の開発ファイルを用意する。Ubuntu の通常のインストール:

```bash
sudo apt-get install build-essential libmariadb-dev libssl-dev
npm run moon -- update
npm run build:core
npm run build:native
npm start
```

通常は最適化した release ビルドを使う。panic の原因を追えるよう `--no-strip` でスタック情報を残す。最適化なしで調べる場合は `NATIVE_DEBUG=1 npm run build:native` を使い、調査後に通常の `npm run build:native` で戻す。

sudo を使えない Ubuntu 24.04 x86_64 環境では `bash scripts/install-native-deps.sh` が apt から取得したライブラリを `.tools/native` に展開する。システムのライブラリは変更しない。実行時ライブラリも同時に取得し、OpenSSL の意図しない static link を避ける。配布物のハッシュはローカルの `SHA256SUMS` に残す。

`npm start` は `.env` 読み込み後に `process.execve` で `dist/native/speakup` へ置き換わる。稼働中の backend に Node event loop は存在しない。環境変数と共有ライブラリをシステム側で用意すれば、`./dist/native/speakup` を直接起動でき、Node は不要。Node は frontend の開発・ビルドと既存 DB migration/seed ツールに使う。

比較と回帰確認用の JS backend は `npm run start:node` で起動できる。通常の `npm run dev` は native backend と Vite を起動する。

## DB 待ちと通話中継

MoonBit の業務処理は単一の非同期 event loop 上で動く。同期の MySQL API をそのまま呼ぶと、その待ち時間に signaling も止まる。そのため、10 接続の pool にそれぞれ C worker を持たせ、完了通知の pipe を MoonBit 側で非同期に待つ。

- SQL は prepared statement。transaction は同じ接続で実行し、失敗時は rollback。結果が不明な書き込みを自動で再試行しない。
- worker が触れるのはコピー済みの C memory と Connector/C のオブジェクトだけ。MoonBit の管理メモリは worker に渡さない。
- HTTP がキャンセルされても、実行中の DB job の完了を回収してから接続を pool へ戻す。
- MySQL の接続・read/write timeout は 5 秒。結果は 10,000 行／16 MiB で制限する。大きな履歴は API 側で pagination が必要。
- 接続時に UTF-8 と UTC を設定。`MYSQL_SSL_CA` を設定した場合は TLS とサーバ証明書検証を必須にする。
- `DATABASE_URL` は `mysql://user:password@host:port/database`。user/password/database の percent encoding を扱う。今回の parser は DNS 名／IPv4 と query parameter のない URL に対応する。

SDP／ICE の中継は DB を参照しない。media-ready 後の開始保存も reader と別の task で行う。会話の参加・開始・終了・期限処理を会話 ID ごとの mutex で順序付ける。各 WebSocket に writer を一つ置き、送信待ち 256 KiB、入力 64 KiB、毎秒 100 messages、接続 10,000 件で制限する。5 秒の認証 timeout と ping/pong も持つ。async 0.22.1 は close 送信後に WebSocket reader を停止するため、残る close 応答を上限付きで読み捨ててから TCP を閉じ、proxy 越しのリセットを防ぐ。これらは防御上の設定値であり、処理能力を認定する数値ではない。

## 検証

```bash
npm run test:native
npm run build:native
npm run test:integration:native
npm run test:browser:native
npm run bench
```

JS backend と同じ API／WebSocket tests を native に対して実行する。JWT は exp を必須とし、user_id は正の整数の十進文字列に限定する（比較用 JS backend も同じ規則）。jose との相互検証、改ざん・期限・issuer/audience・nbf を確認。avatar は multipart の別フィールドとバイナリを含めて検証する。DB 10 接続を実際の row lock で待たせ、その間にも ICE が中継されることを検証する。ブラウザ試験はイベント／随時の音声 RTP、再接続、終了通知、本人だけの振り返り保存を含む。

`moonbitlang/async` は experimental API。native にしても Go より速くなるとは限らない。[測定結果](performance.md)は HTTP 認証や DB を除いた中継の比較で、実サービス全体や音声そのものの速さを表すものではない。Supabase／OpenAI／TURN の実サービス接続と production rollout は今回の検証対象外。

アプリ内通知の `/activity` は別の bounded writer を利用し、認証後に本人向けの更新通知だけを送る。イベント期限は開始時刻から 300 秒として永続状態を走査し、ブラウザの生存に依存せず終了させる。詳細は [周辺機能](features.md)。
