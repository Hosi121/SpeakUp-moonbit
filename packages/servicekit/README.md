# servicekit

MoonBit で繰り返し書く実行環境との境界をまとめた独立モジュールです。
モジュール名は `hosi121/servicekit`。SpeakUp の型、DB schema、認証、環境変数への依存はありません。
SpeakUp と [小さな利用例](../../examples/servicekit) が同じ公開 API を使います。

| import | target | 引き受ける処理 |
| --- | --- | --- |
| `hosi121/servicekit/mysql` | native / Linux | 同期 Connector/C の worker 化、prepared statement、pool、transaction、キャンセル後の回収 |
| `hosi121/servicekit/websocket` | native | 送信 queue、負荷制限、heartbeat、最終メッセージと切断、reader のサイズ制限 |
| `hosi121/servicekit/wire` | JS / native で検証 | JSON ingress、整数性・範囲検証、具体的な DTO decoder の入口 |
| `hosi121/servicekit/bridge` | JS | 文字列コールバックと async の接続、二重完了の抑止 |
| `tools/ts-bindings.mjs`, `tools/js-contract.mjs` | 開発時の Node | TS2Mbt の strict 生成、Mbt2TS の公開型抽出と検査 |

## 別のプロジェクトで使う

現段階はソース配布です。Mooncakes / npm への登録はしていません。`moon add` だけで取得できる状態ではありません。
このディレクトリをそのまま持ち出し、利用アプリと [Moon workspace](https://docs.moonbitlang.com/en/latest/toolchain/moon/workspace.html) のメンバーにします。

```text
my-project/
  moon.work
  servicekit/       # このディレクトリ
  app/moon.mod
```

```moonbit
// moon.work
members = ["servicekit", "app"]
```

アプリの `moon.mod` で `"hosi121/servicekit@0.1.0"` を import し、各 `moon.pkg` では上表の必要なパッケージを import します。
実行例の [`moon.mod`](../../examples/servicekit/moon.mod) と [`moon.pkg`](../../examples/servicekit/src/check_mysql/moon.pkg) を参照してください。

検証した環境は MoonBit **0.10.14+7d59c7ec9** / moon **0.1.20260920** / `moonbitlang/async@0.22.1`、Linux x86_64 です。
MySQL adapter には MariaDB Connector/C の開発ファイルと pthread が必要です。既存の依存を利用し、新しい外部ライブラリは追加していません。
MySQL を使う**実行パッケージ**には以下も必要です。この moon の版では依存ライブラリの linker flags が実行パッケージへ伝播しないことを、単独 consumer のリンクで確認しています。

```moonbit
options(link: { "native": { "cc-link-flags": "-lmariadb -lpthread" } })
```

[C FFI の設定](https://docs.moonbitlang.com/en/latest/language/ffi.html)も参照してください。
wire のみの利用では Connector/C や Node の実行時依存は不要です。

## MySQL

利用側は `async fn` 内でプールを作り、スコープ終了時に閉じます。

```moonbit
let db = @mysql.Pool::new(
  host="127.0.0.1", port=3306,
  user="app", password="password", database="app", size=4,
)
defer db.close()
let result = db.query("SELECT username FROM users WHERE id=?", params=[Integer(42L)])
for row in result.rows {
  if row.get("username") is Some(Text(name)) { println(name) }
}
```

- `Pool::query` は `QueryResult` を返します。行は `rows`、更新数と採番値は `UInt64` の `affected_rows` / `insert_id`。列があるかは `has_rows` で判定できます。
- 引数も列値も `Value`：`Null`, `Text`, `Integer(Int64)`, `Unsigned(UInt64)`, `Float`, `Decimal(String)`, `Blob(Bytes)`。整数は native の 64 bit bind を使い、JSON / Double で精度を落としません。Decimal の引数は十進文字列として bind します。日時は UTC のテキストです。SQL の結果型はサーバの列 metadata に従います。`SELECT ?` だけではバイナリ列を宣言しないため、バイナリ式には `CAST(? AS BINARY)` またはバイナリ型の列を使います。
- `transaction([statement(...), ...])` は同一接続で一括実行し、最後の statement の結果を返します。途中で失敗すれば rollback します。DDL の暗黙 commit や、手動の transaction / session 操作は MySQL の仕様通りです。任意の callback 内で結果を読みながら SQL を組み立てる transaction API は含みません。
- 接続ごとに C worker を持ち、MoonBit 側の scheduler は pipe の完了通知を待ちます。worker に MoonBit 管理メモリは渡しません。
- キャンセルは実行中 SQL の取り消しではありません。結果を回収してから接続を再利用するため、timeout の返却が SQL の完了まで遅れることがあります。書き込みが失敗・キャンセルされたときの自動 retry はしません。
- `close()` は新規・待機中の要求を拒否し、実行中の worker はその要求の完了時に回収します。複数回呼べます。プールを使う task のスコープを終えてから `close()` するのが基本です。同じプールは一つの async event loop で使用します。
- `size`, `timeout_seconds`, `max_rows`, `max_bytes` を設定できます。既定は 10 接続、Connector/C の connect/read/write timeout 5 秒、10,000 行、値の payload 合計 16 MiB です。メモリ全体の上限ではありません。
- `ssl_ca` を指定すると証明書検証と TLS を必須にします。省略時は Connector/C の既定方針です。`plugin_dir` も明示指定です。ライブラリ自身は環境変数や `.env` を読みません。

エラーは `DatabaseError`。結果の上限超過は `ResultTooLarge`、worker を確保できなければ `WorkerUnavailable`、SQL / 引数数の不一致などは `InvalidParameter`。サーバの番号は `ServerError(code)` として届き、例えば重複キーは 1062。SpeakUp はここをアプリの 409 応答へ変換します。アプリの HTTP status や SQL schema はライブラリに入りません。

## WebSocket

HTTP upgrade は `moonbitlang/async/websocket` を使い、その後の接続を渡します。

```moonbit
let peers = @connections.Connections::new()
defer peers.close()
peers.with_peer(ws, async fn(peer) {
  ignore(peer.finish("goodbye"))
})
@connections.drain_close(conn)
```

`with_peer` のスコープが writer と heartbeat を所有します。`send` と `finish` は enqueue の成否を返し、`finish` の最後の payload → close frame の順序を守ります。ハンドラがすぐ return しても最終メッセージを送信します。
通常の `send` はハンドラが動いている間の送信です。終了時に最後の送信を待ちたい場合は `finish` を使います。

既定の送信待ちは 256 KiB / 1,024 メッセージ、write timeout 30 秒、heartbeat 30 秒、close timeout 1 秒です。空文字の連続送信もメッセージ数で制限し、超過した遅い接続は閉じます。
`on_leave` はルームなどアプリ状態の片付け、`on_error` はエラー観測と close code の選択に使えます。
`limited_body(reader, limit)` の超過は `TooLarge` → 1009、その他の既定は 1011。
HTTP connection の所有権は呼び出し元にあり、`defer conn.close()` も置いてください。

JWT、room、offer/answer、メンバー認可、通話終了の判定は含みません。SpeakUp の `native_transport` はこれらの判断と `Peer` への配送だけを行います。

## JSON と JS 境界

DTO は MoonBit 側で定義し、`FromJson` の前に `wire.integer_field` / `wire.int` で数値を検証します。
`decode(text, decoder)` は MoonBit の例外付き入口、`decode_or_throw(text, decoder)` は JS export 用の同期ラッパーです。
後者は JS の catch 可能な例外に変換します。native からは前者を使ってください。

検証は JSON parser が生成した Double に対して行います。JSON parser がすでに丸めた十進数の原文精度を復元する API ではありません。正確な decimal / 64 bit 値を JS とやりとりする契約では文字列を使ってください。

`bridge.await_text` は `(error: string, value: string) => void` を受け取る処理を MoonBit async にします。空の error は成功、先に届いた一回だけを採用します。callback を呼ばない host や、同期的に JS exception を投げる host の制御は host 側の責任です。
`bridge.run` はエラーを処理済みの async 処理を JS 公開 callback API から開始します。
TS2Mbt が生成する opaque callback への変換は、利用側に具体的な関数型の `%identity` を一行置きます。汎用の unchecked cast はありません。

生成ツールは既存の `@mizchi/ts@0.6.0` と TypeScript を使う開発用 `.mjs` です。CLI の場所を引数で渡せるため、SpeakUp のパスや package 名を知りません。
`generateBindings` は strict 生成と診断確認、`emitDeclaration` は `moon.pkg` の JS export から到達する型だけの抽出を行います。直接の `async` / `raise` / `Result` / `Option` export や未対応の型を拒否します。
対象は concrete struct・primitive・配列・具体的な callback の契約です。任意の MoonBit API を自動で JS 化するものではありません。

**型宣言だけでは JS ABI を保証できません。** DTO は生成 class の instance であり、フィールド構造と JSON 表現を公開契約とします。prototype や内部の Map / Json / Result は契約に含めません。
例の [`contract`](../../examples/servicekit/src/contract) は Mbt2TS で型を作り、Node から生成 JS を実際に呼ぶ試験と TypeScript consumer の両方で検証します。

## 検証

このリポジトリの root で、toolchain と npm 依存を準備して実行します。

```bash
npm run generate
npm run test:servicekit
# 移植用の隔離 MySQL を起動してから:
npm run test:servicekit:mysql
```

前者は JS/native の整数検証、生成 JS/TS の契約、単独 WebSocket server の切断・queue 制限を検証し、このディレクトリと consumer だけを一時 workspace にコピーして両 target を check します。
後者は `TEST_DATABASE_URL`（既定は移植用の localhost:3308）へ接続し、専用テスト表を作って削除します。64 bit / decimal / binary、commit / rollback、query のキャンセル後の再利用、全 worker が動いている間の scheduler、close 時の待機要求、結果の上限を検証します。
SpeakUp 自体の API / WebRTC 回帰試験も継続します。この抽出による高速化を主張する新しい benchmark は行っていません。
