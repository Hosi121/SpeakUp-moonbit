# テスト

## 分担

内部表現と match の網羅性は型で制約する。業務規則、未信頼入力、認可、並行更新、
資源の実際の解放は実行時に検証する。型宣言を確認するだけの試験や、
ライブラリ内部・同じ renderer の重複シナリオは追加しない。

| 層 | 検証すること | 実装・入口 |
| --- | --- | --- |
| 型・生成 | MoonBit / TS strict、export の具体型、動的型禁止、生成物差分 | `check`、`generate`、`test:consumer` |
| 純粋なドメイン | 参加者と操作、期限、再送、フレンドの同意、信号の方向 | `core/*/*test.mbt`、JS / native |
| Controller / port | 同期・二重・遅い完了、取消からの再入、並列 GET、再試行、通知競合、資源解放 | [tests](../tests) の controller / presenter 試験。DB・ブラウザ不要 |
| JS / HTTP 境界 | 実際の生成 JS、source fixture、整数範囲、JSON、不正 token、status、multipart、abort | [contract](../contract/levels.md)、transport / boundary 試験 |
| MySQL / socket | 認可、CAS、transaction、通知の一意性、migration、履歴 cursor、接続切断 | `integration.test.mjs / features.test.mjs / migration.test.mjs` |
| Production DOM | URL、module 遅延、focus、IME、行の保持、dialog、media の部分初期化失敗 | [tests/navigation](../tests/navigation)。HTTP fixture、DB 不要 |
| 実 API と通話 | イベント・随時の RTP、再接続、開始時刻、終了、非公開の振り返り、画面との接続 | [tests/browser](../tests/browser)。native 全体、Node は代表通話経路 |

DB 試験はケースごとに自分のユーザーと必要な関係を作る。
サーバー起動は共有できるが、他ケースの作成データや実行順には依存しない。
実 transaction の原子性を SQL 文字列の mock だけで検証済みとは扱わない。

汎用の DB / WebSocket / Lifetime は公開元の CI で検証する。
SpeakUp は公開版を使うアプリの接続部分を検証する。[依存の分担](dependencies.md)を参照。

## 実行

[開発手順](development.md)で toolchain を準備し、repo のルートから実行する。
source fixture の生成には Go 1.23.5 も必要。

```bash
npm run generate
npm run check
npm --prefix frontend run lint
npm run fixtures
npm run test:unit
npm run test:native
npm run test:consumer
npx playwright install chromium
npm run test:navigation
```

`test:unit / test:consumer` は最新の `build:core` 成果物を前提とする。
上記では `check` が生成する。`test:navigation` は production build も行う。
build 済みの CI では `build:message-views` の後に `test:navigation:built` を使う。

DB・実通話は、空の専用 DB に migration → seed を適用してから実行する。

```bash
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run build:core
npm run build:native
npm run test:database
npm run test:integration:native
npm run test:browser:native
npm run test:browser:node-parity
```

別の隔離 DB を使う場合は `TEST_DATABASE_URL`、一時 DB の作成・削除には
`TEST_MYSQL_ADMIN_URL` を指定する。migration / seed は `DATABASE_URL` を使用する。
既定値は Compose のローカル MySQL。元の SpeakUp や本番 DB は使用しない。
DB を共有する browser worker は1にし、別 suite を同時実行する場合は出力先も分ける。

| 部分実行 | コマンド |
| --- | --- |
| フレンドの純粋規則 | `npm run moon -- test --target js core/friendship` |
| メッセージ API 単独 | `node --test --test-name-pattern='^private messages' tests/features.test.mjs` |
| JS 境界の build・実行・型検査 | `npm run test:boundaries` |
| 凍結した旧 HTTP adapter | `npm run test:oracle-http` |
| Node の全 UI / 通話 | `npm run test:browser` |

`npm test` は JS build・MoonBit JS・Node の全通常試験をまとめるため DB が必要。
CI の分割コマンドと重複して実行する必要はない。

## Source fixture

[contract/source](../contract/source)、[message](../contract/message/README.md)、
[frontend](../contract/frontend/README.md) の固定 source を実行して expected を生成する。
通常の `npm run fixtures` は Git 履歴に依存しない。
再抽出は指定 revision からだけ行い、現行実装に合わせて oracle を書き換えない。
意図的な動作変更は[移植差分](migration.md)へ記載し、source parity と別に検証する。

## CI

正本は [.github/workflows/check.yml](../.github/workflows/check.yml)。
`Verify migration` は次の二つの job を並行実行し、`verify` は双方の成功を必須とする。
失敗・cancel・skip は成功扱いしない。同じ ref / PR の古い実行は取り消す。本番配備は行わない。

| job | 内容 |
| --- | --- |
| Types, contracts and DOM | 生成・型・lint・fixture 差分、JS / native 単体、独立 consumer、production DOM |
| API and browser integration | JS と native server の build、MySQL 準備、Node API / migration、native API / browser、Node 通話 parity |

JS は各 job で一度 build する。単体 suite に含む ABI 試験を別 command で重複実行しない。
native executable は source・toolchain・依存・build 設定・OS / C ABI の完全一致 cache のみ使用する。
古い prefix による復元はせず、cache hit でも API / browser 試験を省略しない。
Chromium は headless shell、MySQL の readiness は TCP で確認する。
並列化の費用と待ち時間は[性能測定](performance.md#ci)を参照。

## 検証範囲

自動ブラウザ検証は Chromium。ローカルの実 RTP 受信を確認するが、TURN 実回線、
Supabase / OpenAI 実サービス、本番 traffic の replay は含まない。AI はローカル HTTP fixture を使う。
IME は composition event、BFCache 復帰は page transition event の再現であり、実機の採用条件は保証しない。
320 / 1024 px の主要画面とキーボード操作を検査するが、Safari / Firefox 実機、
スクリーンリーダーによる評価は未実施。

件数から coverage 率や高速化を推定しない。最新の実行結果は
[GitHub Actions](https://github.com/Hosi121/SpeakUp-moonbit/actions)を参照。
