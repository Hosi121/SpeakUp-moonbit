# CI の待ち時間と検証範囲

`Verify migration` は型・契約・単体・DOM 試験と、実 DB・通話試験を並行実行する。
既存の必須 status `verify` は両 job の成功を確認する。失敗・cancel・skip を成功として
扱わない。同じ ref / PR の古い実行は新しい実行で取り消す。本番への配備は行わない。

## 並列化時の実測（2026-09-23 JST）

アプリ本体が同じ `6955157` の直前 CI と比較した。時間は workflow の作成から完了までで、
queue と最後の `verify` job も含む。cache の有無は native executable のことであり、
npm / Go の既存 cache まで空にした比較ではない。

| 構成 | native cache | 全体の待ち時間 | runner 稼働時間の合計 |
| --- | --- | --- | --- |
| [変更前](https://github.com/Hosi121/SpeakUp-moonbit/actions/runs/35790563433) | 未導入 | 3分30秒 | 3分26秒 |
| [最初の並列化](https://github.com/Hosi121/SpeakUp-moonbit/actions/runs/35792878960) | なし | 3分31秒 | 5分09秒 |
| [最初の並列化](https://github.com/Hosi121/SpeakUp-moonbit/actions/runs/35793321126) | あり | 2分19秒 | 3分25秒 |
| [DOM も並行する最終構成](https://github.com/Hosi121/SpeakUp-moonbit/actions/runs/35793676231) | なし | 3分18秒 | 4分55秒 |
| [DOM も並行する最終構成](https://github.com/Hosi121/SpeakUp-moonbit/actions/runs/35794150618) | あり | 2分20秒 | 3分52秒 |

すべて成功。最終構成の cache ありでは約33%短縮した。なしの12秒差は各条件1回の
計測なので、安定した改善率とは扱わない。同じアプリでも native compile は40〜61秒、
MySQL の準備は19〜36秒と runner 間で揺れる。最初の並列化だけでは初回の待ち時間は
改善しなかったため、production DOM の build と試験も独立側へ移した。

Node の135試験そのものは変更前の実行で約3.7秒であり、件数が主因ではなかった。
重複 build、使わない benchmark executable、直列の準備・ブラウザ試験を整理した。
2 runner で準備するため合計稼働時間は増えている。今回は待ち時間の短縮を優先しており、
計算資源の総量が減ったという結果ではない。ソース変更で cache が無効になれば再 compile が
必要で、常に2分20秒になるわけではない。

[計測記録](../bench/ci-results.json)に全試行の commit、step 時間と、参考として過去4 run も
残した。過去4 run はアプリの版も異なるため改善率の分母には使わない。
計測後の点検で npm の build entry (`package.json`) も cache key に加えた。
この表はテスト責務を整理する前の記録であり、以下の件数変更による速度向上を測ったものではない。

## テストの分担

| job | 実行内容 |
| --- | --- |
| Types, contracts and DOM | TS2Mbt / Mbt2TS、型・build・lint、凍結 source oracle、生成物差分、MoonBit JS 22件 / native 25件、DB 不要の Node 113件、独立 JS 境界 consumer、production DOM / navigation 29件 |
| API and browser integration | Node API 21件 + DB migration 4件、native API 21件、native backend 上の実 API UI / RTP 11件、Node の通話・ログイン・メモ3件 |
| verify | 上の2 job が成功したことの確認 |

Node の135件から、凍結した旧 HTTP adapter の5件を任意実行へ移し、競合するフレンド操作の
原子性を試す1件を追加し、131件 = 107 + 24 とした。続く型モデルの変更では、同期 callback と
音声の部分初期化失敗の2件を追加し、133件 = 109 + 24 とした。フレンドの純粋な業務規則3件は MoonBit
の両 target へ追加し、wire の native 2件も native 単体コマンドに統合した。通話の期限と
signal の方向検査も両 target で各1件を追加した。型だけで保証できる形の試験は追加していない。
CI の boundary コマンドが重複していた JS 5件は除き、独立 consumer の型検査を残す。
その後の Lifetime 適用・型付き API・履歴ページングに伴い、現在は138件 = 113 + 25。
API のインスタンス分離は MoonBit の両 target で各1件を追加した。
`scripts/test-node.mjs` は同じ `tests/*.test.mjs` を分類し、新規ファイルは単体側へ入れる。
DB の試験は専用 MySQL 8.4 に限定し、両 backend が同じ API 契約を通ることを維持する。

共有 frontend を Node / native 両方で繰り返す部分は前回整理した。その後、同じ message
renderer の6シナリオの重複も除いたため、ブラウザ試験は計61 → 48 → 42件になった。
今回、履歴ページングの DOM 接続1件を追加して43件となる。
HTTP / media の5件は件数を維持して DB 不要の production DOM 側へ移動した。
native backend では実 API の全11件を実行し、Node にもイベント／随時通話の実 RTP、
再接続・終了・振り返り、ログインとメモ保存を残す。API での権限・永続化・画像・通知・
フレンド・メッセージ等は引き続き両 backend を検査する。
`npm run test:browser` は実 API の11件を Node でも実行できる。
[テストの対応表と型による分離](testing.md)に、残す理由と任意実行の旧試験を記載した。

DB を共有する browser worker は1のまま。異なる job は別 runner を使う。
時間のかかる通話試験を同じ DB 上で無理に並列化する変更はしていない。
MySQL の healthcheck は TCP 接続を使い、初期化用の socket 専用サーバを準備完了と扱わない。

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
MoonBit / Mooncakes の宣言、npm の build entry、生成・build script、binding、workflow、OS image、
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
npm run test:consumer
# 隔離 DB の起動・migration・seed 後
npm run test:database
npm run test:integration:native
npm run test:browser:native
npm run test:browser:node-parity
npm --prefix frontend run build:message-views
npm run test:navigation:built
```

`test:unit` / `test:database` / `test:consumer` / `test:navigation:built` は対応する成果物が
最新であることを前提にする。`workflow_dispatch` でも同じ全検証を再実行できる。
境界だけを build からまとめて確認したい場合は `npm run test:boundaries` を使える。
CI は既に単体 suite で実行した ABI 試験をここで繰り返さない。
