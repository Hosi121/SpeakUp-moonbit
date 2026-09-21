import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

mkdirSync('.tools', { recursive: true });
execFileSync('go', ['build', ...(process.env.BENCH_GO_RACE ? ['-race'] : []), '-o', '../../.tools/go-bench', '.'], { cwd: 'bench/go', stdio: 'inherit' });
const rounds = Number(process.env.BENCH_ROUNDS ?? 5);
const roomCount = Number(process.env.BENCH_ROOMS ?? 32);
const messages = Number(process.env.BENCH_MESSAGES ?? 3000);
const results = [];
const clockTicks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
const cpuSeconds = pid => {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  return (Number(fields[11]) + Number(fields[12])) / clockTicks;
};
const candidate = i => JSON.stringify({ type: 'ice-candidate', candidate: { candidate: `candidate:${i} 1 udp 2122260223 192.0.2.1 54321 typ host generation 0 ufrag abc network-cost 999`, sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'abc' } });
async function connect(port, room, user) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${room}&user=${user}`);
  const pending = [], queued = [];
  ws.on('message', b => { const text = b.toString(); if (JSON.parse(text).type === 'waiting') return; if (pending.length) pending.shift()(text); else queued.push(text); });
  const next = () => queued.length ? Promise.resolve(queued.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('benchmark message lost')), 10000);
    pending.push(text => { clearTimeout(timer); resolve(text); });
  });
  await once(ws, 'open'); return { ws, next };
}
for (let round = 0; round < rounds; round++) for (const kind of (round % 2 ? ['moonbit-js', 'go-corrected'] : ['go-corrected', 'moonbit-js'])) {
  const port = kind === 'go-corrected' ? 18101 : 18102;
  const child = kind === 'go-corrected' ? spawn('.tools/go-bench', { env: { ...process.env, PORT: String(port), GOMAXPROCS: '1' } }) : spawn(process.execPath, ['bench/moonbit-server.mjs'], { env: { ...process.env, PORT: String(port) } });
  let log = ''; child.stderr.on('data', b => log += b);
  const pairs = [];
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {} if (i > 100) throw new Error(log); await new Promise(r => setTimeout(r, 20)); }
    for (let i = 0; i < roomCount; i++) {
      const a = await connect(port, i + 1, 1), b = await connect(port, i + 1, 2);
      await Promise.all([a.next(), b.next()]);
      b.ws.send(JSON.stringify({ type: 'offer', offer: { type: 'offer', sdp: 'v=0\r\n'.repeat(2048) } })); await a.next();
      a.ws.send(JSON.stringify({ type: 'answer', answer: { type: 'answer', sdp: 'v=0\r\n'.repeat(2048) } })); await b.next();
      pairs.push([a, b]);
    }
    const run = async (n, collect) => Promise.all(pairs.map(async ([a, b]) => {
      for (let i = 0; i < n; i++) {
        const [from, to] = i % 2 ? [a, b] : [b, a];
        const wire = candidate(i); const t = performance.now();
        from.ws.send(wire); assert.equal(await to.next(), wire);
        if (collect) collect.push(performance.now() - t);
      }
    }));
    await run(1000);
    const latencies = []; const cpuStart = cpuSeconds(child.pid); const start = performance.now();
    await run(messages, latencies);
    const elapsed = performance.now() - start;
    latencies.sort((a, b) => a - b);
    const rss = Number(/^VmRSS:\s+(\d+)/m.exec(readFileSync(`/proc/${child.pid}/status`, 'utf8'))?.[1]) * 1024;
    const row = { kind, round, rooms: roomCount, connections: roomCount * 2, forwarded: latencies.length, elapsedMs: elapsed, messagesPerSecond: latencies.length / elapsed * 1000, p50Ms: latencies[Math.floor(latencies.length * .5)], p95Ms: latencies[Math.floor(latencies.length * .95)], p99Ms: latencies[Math.floor(latencies.length * .99)], serverRssBytes: rss, serverCpuSeconds: cpuSeconds(child.pid) - cpuStart };
    results.push(row); console.log(JSON.stringify(row));
  } finally { for (const pair of pairs) for (const c of pair) c.ws.terminate(); child.kill(); await once(child, 'exit'); if (/DATA RACE/.test(log)) throw new Error(log); }
}
const report = { measuredAt: new Date().toISOString(), cpu: cpus()[0].model, logicalCpus: cpus().length, os: `${platform()} ${release()}`, node: process.version, go: execFileSync('go', ['version'], { encoding: 'utf8' }).trim(), moon: execFileSync(process.execPath, ['scripts/moon.mjs', 'version'], { encoding: 'utf8' }).split('\n')[0], methodology: 'Loopback, 32 concurrent room tasks by default, one message in flight per room, 1000 warmup messages per room, one Go scheduler CPU, Node single JS thread. Alternating runtime order. No auth/DB in either server. Measures signaling relay only, not RTP or production capacity. Correctness checks every received payload. RSS is an end-of-trial sample, not peak.', results };
writeFileSync(process.env.BENCH_GO_RACE ? '.tools/race-results.json' : 'bench/results.json', JSON.stringify(report, null, 2) + '\n');
