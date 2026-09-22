import { readFileSync, writeFileSync } from 'node:fs';
const r = JSON.parse(readFileSync('bench/results.json', 'utf8'));
const kinds = ['go-corrected', 'moonbit-js', 'moonbit-native'];
const median = xs => { const sorted = [...xs].sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; };
const stats = kind => Object.fromEntries(['messagesPerSecond', 'p50Ms', 'p95Ms', 'p99Ms', 'serverRssBytes', 'serverCpuSeconds'].map(key => [key, median(r.results.filter(x => x.kind === kind).map(x => x[key]))]));
const values = kinds.map(stats);
const [g, j, n] = values;
const f = (n, d = 2) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const row = (label, key, decimals = 3, scale = 1) => `| ${label} | ${values.map(v => f(v[key] / scale, decimals)).join(' | ')} |`;
const ranges = kinds.map(kind => { const rates = r.results.filter(x => x.kind === kind).map(x => x.messagesPerSecond); return `${f(Math.min(...rates), 0)}–${f(Math.max(...rates), 0)}`; });
const trials = r.results.filter(x => x.kind === kinds[0]).length;
writeFileSync('docs/performance.md', `# 性能測定

native の中継 throughput の中央値は Go 比較用実装の **${f(n.messagesPerSecond / g.messagesPerSecond, 3)} 倍**、JS/Node は **${f(j.messagesPerSecond / g.messagesPerSecond, 3)} 倍**だった。今回の負荷では native 化による高速化を確認できない。trial 間の揺らぎを考慮すると、数% の差で言語の優劣は判断できない。

native の RSS は **${f(n.serverRssBytes / 1048576, 1)} MiB**、JS/Node は **${f(j.serverRssBytes / 1048576, 1)} MiB**。この中継プログラムでは native が約 **${f(j.serverRssBytes / n.serverRssBytes, 1)} 分の 1**になった。DB pool や認証を含む production server のメモリ量ではない。

| 指標（${trials} trial の中央値） | Go 比較用実装 | MoonBit → JS / Node | MoonBit native |
| --- | ---: | ---: | ---: |
${row('forwarded messages/sec', 'messagesPerSecond', 0)}
| throughput の trial 間範囲 | ${ranges.join(' | ')} |
${row('p50 中継 latency (ms)', 'p50Ms')}
${row('p95 中継 latency (ms)', 'p95Ms')}
${row('p99 中継 latency (ms)', 'p99Ms')}
${row('server RSS (MiB)', 'serverRssBytes', 2, 1048576)}
${row('server CPU time / 96,000 messages (s)', 'serverCpuSeconds', 2)}

測定時刻: ${r.measuredAt}。${r.cpu}、${r.os}、${r.node}、${r.go}、${r.moon}。native は release の C backend。

## 方法と限界

\`npm run bench\`、\`node bench/summarize.mjs\` で再現する。Linux の /proc を使用する。

- 32 rooms / 64 WebSocket connections。各 room は同時に一つの message を送る closed-loop 負荷で、room 間は並行。
- 12 KiB の SDP で offer/answer 後、各 room 1,000 messages の warm-up、3,000 ICE messages を測る。全受信 payload を照合する。
- 3 方式を一度に一方ずつ起動し、6 trial で全順列の実行順を使う。Go は GOMAXPROCS=1、Node は単一 JS thread、native は単一 MoonBit event loop。測定中にビルドやブラウザ試験を並走させない。
- client と server は同じ PC の loopback。latency は送信から相手の受信までの host 内時間。ネットワーク越し RTT、音声 latency、通話開始時間ではない。Node の client 処理が上限を作る可能性もあり、最大 throughput を証明する負荷ではない。
- MoonBit は両 target とも production の signaling core を使う。native は production と同じ送信 queue／frame reader も使う。各方式の admission は合成 user/room で、JWT、DB、TLS、TURN、rate limit、heartbeat を除く。
- Go reference は mutex と接続ごとの writer lock を持つ比較用プログラム。元 Gin/Ent アプリの計測ではない。native の HTTP/WebSocket は moonbitlang/async、Node は ws、Go は Gorilla を使う。言語、JSON 処理、I/O library、runtime を含む比較で、コンパイラだけの差ではない。
- payload は ASCII。入力検証はどちらにもあるが、Unicode 長や allocation の細部は同一ではない。
- RSS は trial 最後の標本で peak ではない。CPU は /proc の user+system tick の差分。6 件の中央値は中央 2 件の平均。allocator ごとの allocation 数や GC pause は未測定。
- 認証・DB・再接続負荷を含む capacity test、外部ネットワーク、負荷生成器を別 host に置いた open-loop test は未実施。

[前回の JS 測定](https://github.com/Hosi121/SpeakUp-moonbit/blob/251bfb7ee82d566409ece233715d7a215d997073/docs/performance.md) は Go 比約 0.90 倍だった。今回は Go 側の絶対値も大きく変わったため、時点をまたぐ差を native 化や設計変更の効果とみなさない。今回の同一測定からも「Node だから Go に負けた」とは断定できない。

## 待ち時間を分離した構成の確認

native 結合テストでは、10 本すべての DB 接続を MySQL の row lock 待ちにし、その間にも ICE が中継されることを確認する。これは DB 同期処理が MoonBit event loop を止めない構成の検証で、DB API の throughput 比較ではない。会話単位の順序制御は参加とライフサイクル操作に限り、通常の中継は DB を読まない。

元 Go にある共有 map の無同期アクセス、並行 WebSocket writer、接続時の全体照会をそのまま比較対象にはしていない。モデルと同期処理の修正による効果と、言語変更による効果は区別する。

Go race detector の確認は \`BENCH_GO_RACE=1 BENCH_ROUNDS=1 BENCH_MESSAGES=300 node bench/run.mjs\`。race 有効の結果は表へ混ぜない。

生データ: [bench/results.json](../bench/results.json)。実装: [Go](../bench/go/main.go)、[Node host](../bench/moonbit-server.mjs)、[native host](../core/native_bench/main.mbt)、[共通 signaling](../core/signaling/hub.mbt)、[native の実送信経路](../core/native_transport/relay.mbt)。
`);
