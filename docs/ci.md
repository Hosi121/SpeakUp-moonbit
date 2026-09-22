# CI の待ち時間と検証範囲

`Verify migration` は型・契約・単体・DOM 試験と、実 DB・通話試験を並行実行する。
既存の必須 status `verify` は両 job の成功を確認する。失敗・cancel・skip を成功として
扱わない。同じ ref / PR の古い実行は新しい実行で取り消す。本番への配備は行わない。

## テストの分担

| job | 実行内容 |
| --- | --- |
| Types, contracts and DOM | TS2Mbt / Mbt2TS、型・build・lint、凍結 source oracle、生成物差分、MoonBit JS 16件 / native 17件、DB 不要の Node 112件、独立 JS 境界 consumer、production DOM / navigation 29件 |
| API and browser integration | Node API 19件 + DB migration 4件、native API 19件、native backend 上の全 UI / RTP 16件、Node の通話・ログイン・メモ3件 |
| verify | 上の2 job が成功したことの確認 |

Node の従来の135件は112 + 23へ分割しただけで、削除・skip はない。
`scripts/test-node.mjs` は同じ `tests/*.test.mjs` を分類し、新規ファイルは単体側へ入れる。
DB の試験は専用 MySQL 8.4 に限定し、両 backend が同じ API 契約を通ることを維持する。

共有 frontend の13件を Node / native 両方で繰り返す部分を整理した。
標準 backend の native では全16件を実行する。Node でもイベント／随時通話の実 RTP、
再接続・終了・振り返り、ログインとメモ保存を残す。API での権限・永続化・画像・通知・
フレンド・メッセージ等は引き続き両 backend を検査する。ブラウザ試験は計61 → 48件。
Node の全画面試験自体は消さず、`npm run test:browser` で従来どおり全16件を実行できる。

DB を共有する browser worker は1のまま。異なる job は別 runner を使う。
時間のかかる通話試験を同じ DB 上で無理に並列化する変更はしていない。

## 省いた処理と cache

- JS の build を各 job 内で一度にする。CI は build 済みの単体・境界・navigation entry を使う。
  通常の `npm test` / `npm run test:navigation` は必要な build を引き続き行う。
- CI で一度も実行していなかった `native-bench` の事前 build を除いた。
  性能測定用 executable は `npm run bench` 自身が build する。
- Go と native 単体試験の準備は DB 不要の job に移し、重いサーバ build と並行する。
- production の frontend build と DOM 試験も DB 不要側へ移す。通話側は共有 JS のみ
  build し、Vite の開発サーバで実 API と接続する。DOM 試験が native の build を待たない。
- Chromium は従来と同じ headless shell を使う。使用しない headed Chromium の download を
  [`--only-shell`](https://playwright.dev/docs/browsers#chromium-headless-shell) で省く。
- npm は lockfile cache を維持。MoonBit の大きな展開済み toolchain と Chromium は
  cache の圧縮・復元コストを増やさず、固定版の取得を続ける。
  [Playwright の cache に関する説明](https://playwright.dev/docs/ci#caching-browsers)も参照。

native release executable だけは完全一致の cache を使う。キーには全 core source、
MoonBit / Mooncakes の宣言、生成・build script、binding、workflow、OS image、
C compiler と MariaDB / OpenSSL の package version を含める。prefix による古い
実行ファイルの復元はしない。cache が空・消失・不一致なら通常の release build を行う。
cache の有無で API / browser 試験を skip しない。成功した integration job だけが保存する。
[`actions/cache` の exact hit](https://github.com/actions/cache#usage) を使い、JS や生成型は
毎回現在のソースから build・監査する。

## ローカルでの実行

従来の README の一括検証コマンドは維持する。build 済みの CI 相当の部分実行は次のとおり。

```bash
npm run check
npm run test:unit
npm run test:native
npm run test:boundaries -- --no-build
# 隔離 DB の起動・migration・seed 後
npm run test:database
npm run test:integration:native
npm run test:browser:native
npm run test:browser:node-parity
npm --prefix frontend run build:message-views
npm run test:navigation:built
```

`test:unit` / `test:database` / `--no-build` / `test:navigation:built` は対応する成果物が
最新であることを前提にする。`workflow_dispatch` でも同じ全検証を再実行できる。
