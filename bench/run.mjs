import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

mkdirSync('.tools', { recursive: true });
const variantsFile = process.env.BENCH_VARIANTS;
if (!variantsFile) {
  execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
  execFileSync('go', ['build', ...(process.env.BENCH_GO_RACE ? ['-race'] : []), '-o', '../../.tools/go-bench', '.'], { cwd: 'bench/go', stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/build-bench.mjs'], { stdio: 'inherit' });
}
const variants = variantsFile ? JSON.parse(readFileSync(variantsFile, 'utf8')) : [
  { kind: 'go-corrected', command: '.tools/go-bench' },
  { kind: 'moonbit-js', command: process.execPath, args: ['bench/moonbit-server.mjs'] },
  { kind: 'moonbit-native', command: '.tools/native-bench' },
];
assert.ok(Array.isArray(variants) && variants.length > 0);
for (const v of variants) {
  assert.match(v.kind, /^[a-z0-9-]+$/);
  assert.equal(typeof v.command, 'string');
  assert.ok(v.args === undefined || (Array.isArray(v.args) && v.args.every(a => typeof a === 'string')));
}
const kinds = variants.map(v => v.kind);
assert.equal(new Set(kinds).size, kinds.length);
// This hashes the executable; for JS, source provenance also needs the commit/diff.
const artifacts = variants.map(v => ({ ...v, sha256: createHash('sha256').update(readFileSync(v.command)).digest('hex') }));
const rounds = Number(process.env.BENCH_ROUNDS ?? 6);
const roomCount = Number(process.env.BENCH_ROOMS ?? 32);
const messages = Number(process.env.BENCH_MESSAGES ?? 3000);
for (const n of [rounds, roomCount, messages]) assert.ok(Number.isSafeInteger(n) && n > 0);
const results = [];
const serverCpu = process.env.BENCH_SERVER_CPU;
if (serverCpu !== undefined) assert.match(serverCpu, /^\d+$/);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
const harnessSha256 = createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex');
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
const order = round => {
  const rotated = [...kinds.slice(round % kinds.length), ...kinds.slice(0, round % kinds.length)];
  return round % 2 && kinds.length % 2 ? rotated.reverse() : rotated;
};
for (let round = 0; round < rounds; round++) for (const kind of order(round)) {
  const port = 18101 + kinds.indexOf(kind);
  const variant = variants.find(v => v.kind === kind);
  const command = serverCpu === undefined ? variant.command : 'taskset';
  const args = serverCpu === undefined ? variant.args ?? [] : ['-c', serverCpu, variant.command, ...(variant.args ?? [])];
  const child = spawn(command, args, { env: { ...process.env, PORT: String(port), ...(kind === 'go-corrected' ? { GOMAXPROCS: '1' } : {}) } });
  let log = ''; child.stderr.on('data', b => log += b);
  // Diagnostic sampling is opt-in; never compare profiled throughput with normal trials.
  const profiler = process.env.BENCH_PERF ? spawn(process.env.BENCH_PERF, ['record', '--quiet', '-F', '199', '-e', 'cpu-clock:u', '--call-graph', 'dwarf', '-p', String(child.pid), '-o', `${process.env.BENCH_PROFILE_PREFIX ?? '_build/perf/profile'}-${kind}-${round}.data`], { stdio: ['ignore', 'ignore', 'inherit'] }) : undefined;
  const pairs = [];
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {} if (i > 100) throw new Error(log); await new Promise(r => setTimeout(r, 20)); }
    for (let i = 0; i < roomCount; i++) {
      const a = await connect(port, i + 1, 1), b = await connect(port, i + 1, 2);
      await Promise.all([a.next(), b.next()]);
      const offer = JSON.stringify({ type: 'offer', offer: { type: 'offer', sdp: 'v=0\r\n'.repeat(2048) } });
      b.ws.send(offer); assert.equal(await a.next(), offer);
      const answer = JSON.stringify({ type: 'answer', answer: { type: 'answer', sdp: 'v=0\r\n'.repeat(2048) } });
      a.ws.send(answer); assert.equal(await b.next(), answer);
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
    const latencies = []; const cpuStart = cpuSeconds(child.pid); const clientStart = process.cpuUsage(); const start = performance.now();
    await run(messages, latencies);
    const elapsed = performance.now() - start;
    const clientCpu = process.cpuUsage(clientStart);
    const serverCpuSeconds = cpuSeconds(child.pid) - cpuStart;
    latencies.sort((a, b) => a - b);
    const rss = Number(/^VmRSS:\s+(\d+)/m.exec(readFileSync(`/proc/${child.pid}/status`, 'utf8'))?.[1]) * 1024;
    const row = { kind, round, rooms: roomCount, connections: roomCount * 2, forwarded: latencies.length, elapsedMs: elapsed, messagesPerSecond: latencies.length / elapsed * 1000, p50Ms: latencies[Math.floor(latencies.length * .5)], p95Ms: latencies[Math.floor(latencies.length * .95)], p99Ms: latencies[Math.floor(latencies.length * .99)], serverRssBytes: rss, serverCpuSeconds, clientCpuSeconds: (clientCpu.user + clientCpu.system) / 1e6 };
    results.push(row); console.log(JSON.stringify(row));
  } finally {
    if (profiler && profiler.exitCode === null && profiler.signalCode === null) { profiler.kill('SIGINT'); await once(profiler, 'exit'); }
    for (const pair of pairs) for (const c of pair) c.ws.terminate();
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); }
    if (/DATA RACE/.test(log)) throw new Error(log);
    if (profiler && profiler.exitCode !== 0 && profiler.signalCode !== 'SIGINT' && profiler.exitCode !== 130) throw new Error('CPU profiler failed');
  }
}
const report = {
  measuredAt: new Date().toISOString(), cpu: cpus()[0].model, logicalCpus: cpus().length,
  os: `${platform()} ${release()}`, node: process.version,
  go: execFileSync('go', ['version'], { encoding: 'utf8' }).trim(),
  moon: execFileSync(process.execPath, ['scripts/moon.mjs', 'version'], { encoding: 'utf8' }).split('\n')[0],
  methodology: `Loopback, ${roomCount} concurrent room tasks, one message in flight per room, 1000 warmup messages per room; Go GOMAXPROCS=1, native single event loop. Rotating variant order (all six permutations over six rounds for three variants). No auth/DB. Signaling relay, not RTP or production capacity. SDP and every warm-up/measured ICE payload are checked byte-for-byte. RSS is end-of-trial, not peak.`,
  artifacts, commit, dirty, harnessSha256, results,
  profiled: !!process.env.BENCH_PERF,
  configuration: { rounds, rooms: roomCount, messages, warmup: 1000 },
  affinity: { serverCpu: serverCpu ?? null, client: readFileSync('/proc/self/status', 'utf8').match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1] },
};
writeFileSync(process.env.BENCH_OUTPUT ?? (process.env.BENCH_GO_RACE ? '.tools/race-results.json' : 'bench/results.json'), JSON.stringify(report, null, 2) + '\n');
