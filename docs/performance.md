# 性能測定

以下は保存済みの比較であり、現在の HEAD を測り直した値ではない。
測定日時・環境・全試行はリンク先の JSON、対象実装は指定 revision を正本とする。
異なる変更・条件の結果を足し合わせて改善率にしない。

## サーバー中継

2026-09-22 の [生データ](../bench/results.json)。Core Ultra 7 255H / Linux WSL2 /
Node 24.13.0 / Go 1.23.5、native は release C backend。各6 trial の中央値。
記録を収録した revision は [1aff958](https://github.com/Hosi121/SpeakUp-moonbit/tree/1aff9585a83a1208cefa13f74c8c33f3f623fdbd)。

| 指標 | Go 比較用実装 | MoonBit JS / Node | MoonBit native |
| --- | ---: | ---: | ---: |
| messages/秒 | 63,377 | 62,850 | 60,405 |
| trial 間の範囲 | 50,239–69,225 | 49,033–68,679 | 47,481–64,131 |
| p50 中継 latency (ms) | 0.453 | 0.456 | 0.472 |
| p95 (ms) | 0.868 | 0.826 | 0.877 |
| p99 (ms) | 1.158 | 1.089 | 1.128 |
| RSS (MiB) | 12.43 | 85.32 | 10.50 |
| CPU time / 96,000 messages (秒) | 1.34 | 1.33 | 1.31 |

native の throughput は Go 比0.953倍で、高速化は確認できない。
native の RSS は Node の約1/8.1だが、DB pool・認証を含む本番サーバーの値ではない。

- 32 rooms / 64接続、各 room に同時1 message の closed-loop 負荷。
  12 KiB の SDP を交換し、各 room で1,000 messages の warm-up 後に3,000 ICE messages を測り、payload を照合する。
- 各方式を単独起動し、6 trial で実行順を全順列にする。
  Go は GOMAXPROCS=1、Node と native は単一 event loop。ビルドや他の計測を並走させない。
- client / server は同一 PC の loopback。音声 latency、外部回線 RTT、通話開始時間ではない。
  client が上限を作る可能性もあり、最大容量を証明する負荷ではない。
- MoonBit はアプリの signaling core / native transport、Go は mutex と writer lock を備えた比較用プログラム。
  元の Gin/Ent アプリ全体や compiler だけを比較したものではない。
- 合成 user / room を使い、JWT・DB・TLS・TURN・rate limit・heartbeat は除外。payload は ASCII。
- RSS は trial 最後の標本で peak ではない。CPU は /proc の user + system tick。GC pause / allocation 数は未測定。

全 DB 接続を row lock 待ちにしても ICE が進むことは[統合テスト](testing.md)で確認する。
これは待ち時間の分離の検証であり、DB throughput や本番 capacity の計測ではない。

### native 最適化の採用判断

2026-09-24 JST、`a1c811c` を基準に3案を独立に比較し、**いずれも不採用**。
[再計測・予備比較](../bench/relay-optimization/exploration.json)、
[確認比較の全50 trial](../bench/relay-optimization/results.json)、
[基準 revision・差分・測定上の制約](../bench/relay-optimization/study.json)を保存している。
本体と公開ライブラリの実装は変更していない。

| 案 | 同じ round の変更前に対する throughput 比の幾何平均 | round ごとの比の範囲 | 判断 |
| --- | ---: | ---: | --- |
| 単一 chunk の受信で Buffer へのコピーを省く | 0.998 | 0.887–1.133 | 改善を確認できず |
| 送信 queue で UTF-8 bytes を保持し再変換を省く | 0.995 | 0.936–1.059 | RSS は10.75 → 9.75 MiB、速度改善は確認できず |
| メッセージ単位の timeout を接続単位の watchdog に置き換える | 0.998 | 0.881–1.098 | 予備比較の中央値 +4.5% は再現せず |

確認比較は Go・変更前 native・3案を各10 trial。server は CPU 14、client は CPU 15 に固定し、
5方式の巡回順と逆順を組み合わせた10通りで実行した。全120順列ではない。
各 trial は32 rooms、warm-up 1,000 / 測定3,000 ICE messages per room。全 ICE payload を照合した。
表の範囲は実測比の最小・最大で、信頼区間ではない。全体の中央値だけで採用を判断しない。
Go の同 round 比は1.015（範囲0.831–1.210）。Go / native の優劣も確定できない。

別途の [CPU profile](../bench/relay-optimization/profile-self.txt)では、self の15.93%が
`moonbit_drop_object`、11.73%が `_mi_page_malloc_zero`、5.38%が `mi_free`。
[呼出先込みの記録](../bench/relay-optimization/profile-callers.txt)には async task・I/O・JSON 処理も現れるが、
割合は重複し、継続の呼出元に見える時間をその関数単独のコストとは扱えない。
profile は起動・warm-up を含む user-space の標本で、速度比較には使っていない。

共有 WSL ホストの他の負荷は除去できていない。変更前の CPU 中央値は server 1.64秒 / client 1.60秒で、
client が負荷の上限を作っている可能性も残る。今回の結果は3案を採用する根拠がないという判断であり、
native の高速化余地がないという結論ではない。

## フロントエンド

主な比較は2026-09-23 JST。Linux / Core Ultra 7 255H / Node 24.13.0 /
headless Chromium 153.0.8010.12、production build を gzip HTTP/1.1 で配信。
新しい context、cache 無効、warm-up 1回 + 7試行、旧新の順序を交互にする。
「制限あり」は追加遅延40 ms、down 200,000 B/s、up 93,750 B/s、CPU 4倍抑制。

表示時間は見出し・メッセージの DOM 更新 + 2 animation frames。LCP / INP ではない。
API は共通 fixture を使い、実 DB・認証サーバー・通知 socket・実機の回線は含めない。
単一環境の少数試行で信頼区間は算出していない。

| 変更（再現用 revision） | 結果（前 → 後） | 採用理由・制約と記録 |
| --- | --- | --- |
| MUI → HTML/CSS（`f6bfee4 → e7d3a46`） | JS gzip 228.75 → 141.42 kB、JS + CSS 229.31 → 143.67 kB | 標準要素と依存削減。UI 全体の変更で、MUI 単独のサイズや表示速度ではない。[build 記録](https://github.com/Hosi121/SpeakUp-moonbit/blob/e7d3a46/docs/frontend.md) |
| Axios → fetch（`7cf05a4 → 4d4dd61`） | JS gzip 147,802 → 130,618 bytes | 必要な通信契約に限定。[HTTP 計測](../bench/http-client-results.json) |
| Router と画面分割（`4d4dd61 → 7bf6ffc`） | login 初期 JS gzip 130,618 → 94,870 bytes、制限あり表示1,176.4 → 981.3 ms | 平坦な route と遅延読み込み。全 JS gzip は125,531 bytes。[全試行](../bench/navigation-results.json) |
| 認証の先読み（`7bf6ffc → 018634f`） | login 初期 JS gzip 94,870 → 53,377 bytes、制限あり表示756.9 → 545.2 ms | 初期フォームを先に操作可能にする。即時送信後は222.0 → 410.7 ms、全 JS は686 bytes増。[全試行](../bench/auth-loading-results.json) |
| メッセージ controller（`018634f → 3561429`） | 通常 app の初期 JS gzip 99,224 → 104,774 bytes、制限あり表示950.2 → 990.5 ms | 状態と描画の分離。高速化としては採用しない。[全試行](../bench/message-results.json) |
| 全画面 controller（`3561429 → e26c994`） | 全 JS gzip 131,806 → 153,787 bytes | 通信順序・寿命の集約。軽量化・高速化は確認していない。[全試行](../bench/frontend-controller-results.json) |
| React → DOM（`e26c994 → 6955157`） | login 初期 asset gzip 60,253 → 14,966 bytes、全 asset 156,142 → 108,959 bytes | 依存削減と描画の交換可能性。CSS / SVG も集計。[全試行](../bench/react-removal-results.json) |
| 通話 async（`53dd8e2 → 78e1d2b`） | Session gzip 8,064 → 19,288 bytes、全 JS 103,948 → 115,266 bytes | 終了順序・解放の集約に約11 kB増を許容。速度・CPU・メモリは未計測。[build 記録](https://github.com/Hosi121/SpeakUp-moonbit/blob/78e1d2b/docs/async-browser.md#配布サイズと制約) |

表の revision は実装を再現する組。元の capture には変更前 HEAD + 未コミット差分のものがあり、
その commit だけで旧新を識別できない。各 JSON の label・dirty・asset hash・bytes を併せて参照する。
MUI と通話 async は build サイズのみ。compiler と依存の条件は各 build 記録に記載する。

HTTP の応答比較は別条件で、1件 / 100件の通知、同時1 / 6要求、20 batch × 8 round を計測する。
warm-up は別に除外し、実際の `fetchInbox` と decoder を両側で使う。
中央値は6–17%短縮したが、100件・逐次の p95 は3.3 → 3.6 msに増えた。
bundle 取得・描画・DB の速度を測った結果ではない。

React / DOM の通常アプリ比較では、制限あり初回表示は login 582.1 → 257.9 ms、
home 887.7 → 574.1 ms、message 1,091.1 → 746.8 ms。
一方、暖まったメッセージ送信は loopback 41.9 → 42.1 ms、制限あり126.6 → 131.7 ms。
すべての操作が速くなったとは扱わない。単独 renderer の比較は通常アプリの数値と区別する。

## CI

[生データと全 run](../bench/ci-results.json)。同じアプリ `6955157` に対する
並列化と native executable cache の比較。queue と最後の verify を含む。

| 構成 | native cache | 待ち時間 | runner 稼働時間の合計 |
| --- | --- | ---: | ---: |
| 直列 | 未導入 | 3分30秒 | 3分26秒 |
| 型・DOM と統合試験を並列 | なし | 3分18秒 | 4分55秒 |
| 同上 | あり | 2分20秒 | 3分52秒 |

採用理由は待ち時間の短縮。runner 稼働時間は増える。
各条件1回で、native compile・MySQL 準備も runner により変動する。
native cache 以外を空にした比較ではなく、現在の全実行が2分20秒で終わる保証はない。
テスト削減の効果は未計測。

## 再現

[開発環境](development.md)を準備する。新しい結果は別名で保存し、比較条件と全試行を残す。
保存済み JSON を再集計しても、再測定したことにはならない。

サーバー中継（Go 1.23.5、Linux /proc が必要）:

```bash
mkdir -p _build
BENCH_OUTPUT=_build/relay-results.json npm run bench
node bench/summarize.mjs _build/relay-results.json
```

集計は標準出力へ出し、この文書を上書きしない。
`node bench/summarize.mjs bench/results.json` は保存済みの結果を集計する。
race 確認は `BENCH_GO_RACE=1 BENCH_ROUNDS=1 BENCH_MESSAGES=300 node bench/run.mjs`。
race 有効の値は通常の速度比較に混ぜない。

独立した変更前後を比較するには、release executable を別名で保存し、
`_build/variants.json` に指定する。この場合は再ビルドせず、指定した実行ファイルを測る。

```json
[
  { "kind": "before", "command": "_build/native-before" },
  { "kind": "after", "command": "_build/native-after" }
]
```

```bash
BENCH_VARIANTS=_build/variants.json BENCH_SERVER_CPU=14 BENCH_ROUNDS=10 \
  BENCH_OUTPUT=_build/comparison.json taskset -c 15 node bench/run.mjs
node bench/summarize.mjs _build/comparison.json before
node bench/summarize.mjs bench/relay-optimization/results.json native-baseline
```

CPU 番号は環境に合わせる。CPU 固定はホストの負荷を排除しない。
結果には試行順・実行ファイル hash・ソース revision・dirty・client CPU も残る。
JS 方式の実行ファイル hash は Node のもので、アプリの JS 全体を識別する値ではない。

保存した3案の再ビルドには、`study.json` の revision を別 checkout に用意し、対応する `.patch` を適用する。
ライブラリ案は `moonbit-sessions/ws_session` を一時的に `moon.work` の members に追加する。
各案とも変更前から独立に `node scripts/build-bench.mjs` でビルドし、`.tools/native-bench` を別名で保存する。
通常のアプリは Mooncakes 依存を使う。予備比較の watchdog は上限 clamp 追加前で、保存差分は確認比較の版。

CPU profile は別実行にする。`perf` の場所は環境に合わせ、出力先を先に作成する。

```bash
mkdir -p _build/profile
BENCH_VARIANTS=_build/variants.json BENCH_ROUNDS=1 BENCH_MESSAGES=30000 \
  BENCH_PERF=/usr/bin/perf BENCH_PROFILE_PREFIX=_build/profile/relay \
  BENCH_OUTPUT=_build/profile/results.json node bench/run.mjs
perf report --stdio --no-children -i _build/profile/relay-before-0.data
```

フロントエンドは表の旧新 checkout でそれぞれ `npm ci`、`npm --prefix frontend ci`、
固定 MoonBit の準備、`npm run build:core`、`npm --prefix frontend run build` を行う。

```bash
node bench/navigation.mjs capture before /path/to/before-checkout
node bench/navigation.mjs capture after /path/to/after-checkout
node bench/navigation.mjs compare before after
node bench/navigation.mjs compare-auth before after
```

capture は同じ label を上書きしない。結果は `_build/navigation-bench/` に保存する。
メッセージの app 比較は `node bench/message.mjs before after`。
単独 renderer も比較する場合は、各 checkout で `build:message-views` を実行して
`_build/message-views` を対応する capture の `views` へコピーする。
React 版は旧 checkout の成果物を使い、現行依存へ React を戻さない。

旧 HTTP 比較は `fetchInbox` のある `7cf05a4` / `4d4dd61` の checkout を使う。
現在の HEAD はその export を持たない。

```bash
node bench/http-client.mjs capture axios /path/to/7cf05a4-checkout
node bench/http-client.mjs capture fetch /path/to/4d4dd61-checkout
node bench/http-client.mjs compare axios fetch
```

結果は `_build/http-client-bench/`。再試行には新しい label を使う。
