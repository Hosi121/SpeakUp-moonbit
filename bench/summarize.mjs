import { readFileSync, writeFileSync } from 'node:fs';
const r = JSON.parse(readFileSync('bench/results.json', 'utf8'));
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const stats = kind => {
  const rows = r.results.filter(x => x.kind === kind);
  return Object.fromEntries(['messagesPerSecond', 'p50Ms', 'p95Ms', 'p99Ms', 'serverRssBytes', 'serverCpuSeconds'].map(key => [key, median(rows.map(x => x[key]))]));
};
const g = stats('go-corrected'), m = stats('moonbit-js');
const f = (n, d = 2) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const range = kind => { const rows = r.results.filter(x => x.kind === kind).map(x => x.messagesPerSecond); return `${f(Math.min(...rows), 0)}–${f(Math.max(...rows), 0)}`; };
writeFileSync('docs/performance.md', `# 性能測定

MoonBit JS の中継 throughput の中央値は、Go 比較用実装に対して **${f(m.messagesPerSecond / g.messagesPerSecond, 3)} 倍**。RSS は **${f(m.serverRssBytes / g.serverRssBytes, 1)} 倍**で、Node/V8 の常駐コストが目立つ。これは中継実装と runtime を含む比較であり、言語単体の性能差を示すものではない。

| 指標（5 trial の中央値） | Go 比較用実装 | MoonBit → JS / Node |
| --- | ---: | ---: |
| forwarded messages/sec | ${f(g.messagesPerSecond, 0)} | ${f(m.messagesPerSecond, 0)} |
| throughput の trial 間範囲 | ${range('go-corrected')} | ${range('moonbit-js')} |
| p50 中継 latency (ms) | ${f(g.p50Ms, 3)} | ${f(m.p50Ms, 3)} |
| p95 中継 latency (ms) | ${f(g.p95Ms, 3)} | ${f(m.p95Ms, 3)} |
| p99 中継 latency (ms) | ${f(g.p99Ms, 3)} | ${f(m.p99Ms, 3)} |
| server RSS (MiB) | ${f(g.serverRssBytes / 1048576)} | ${f(m.serverRssBytes / 1048576)} |
| server CPU time / 96,000 messages (s) | ${f(g.serverCpuSeconds)} | ${f(m.serverCpuSeconds)} |

測定時刻: ${r.measuredAt}。${r.cpu}、${r.os}、${r.node}、${r.go}、${r.moon}。

## 方法と比較の限界

\`npm run bench\` で再現する。Linux の /proc を使用。

- 32 rooms / 64 WebSocket connections。各 room は同時に一つの message を送る closed-loop 負荷で、room 間は並行。
- 12 KiB の SDP で offer/answer 後、各 room 1,000 messages の warm-up、3,000 ICE messages を計測。全受信 payload を照合。
- Go と MoonBit を一度に一方ずつ起動し、trial ごとに先行順を交換。Go は GOMAXPROCS=1、Node は単一 JS thread。ビルドやブラウザ試験と並走させていない。
- client と server は同じ PC の loopback。latency は send から相手の受信までの host 内時間であり、ネットワーク越し RTT、音声 latency、通話開始時間ではない。client 側も Node なので client 処理が上限を作る可能性がある。
- production の MoonBit hub を直接使うが、両ランタイムとも admission は合成 user/room。JWT、DB、TLS、TURN、rate limit、heartbeat を計測から除く。Go reference は mutex と接続ごとの writer lock を使う比較用プログラムであり、元の Gin/Ent アプリを起動した計測ではない。
- 負荷 payload は ASCII。検証処理は両方にあるが、MoonBit/Go の Unicode 長、細かな parse allocation まで完全に同一ではない。実装・ライブラリ・runtime を含む比較であり、コンパイラだけの差を分離していない。
- RSS は trial 最後の標本であり peak ではない。CPU は /proc の user+system tick の差分。allocator ごとの allocation 数や GC pause は未測定。
- trial 間の揺らぎは大きく、1% 程度の差から優劣は判断できない。これは最大同時接続数や production capacity の認定ではない。

初回の [測定記録](https://github.com/Hosi121/SpeakUp-moonbit/blob/9a2aa3d6707416a33699fdef2de33677b330843b/docs/performance.md) では throughput 比は 0.993 倍だった。今回とは Go 側の絶対値も大きく異なるため、時点をまたぐ数値を今回の再設計の効果とみなさない。会話の DB 処理削減や JSON 再生成の除去はコード上の変更として確認できるが、変更別の性能寄与を分離した測定は未実施。\n\n元 Go は無同期 map と複数 writer を含むため、そのままの throughput を「正しく動く baseline」として使わない。DB を接続時に全件読む設計の改善効果と、言語/runtime 変更の効果を分けた。認証・DB・接続 churn を含む production-shaped replay は未実施。

Go reference は別途 \`BENCH_GO_RACE=1 BENCH_ROUNDS=1 BENCH_MESSAGES=300 node bench/run.mjs\` で race detector を有効にして同時接続を実行できる。race 有効の数値はこの表へ混ぜない。

native backend は純粋 core のコンパイル・テストまで。native HTTP/WS サーバはまだ作っていないため、Go に対する native の性能については結論を出さない。

生データ: [bench/results.json](../bench/results.json)。比較実装: [Go](../bench/go/main.go)、[MoonBit host](../bench/moonbit-server.mjs)、[production core](../core/signaling/hub.mbt)。
`);
