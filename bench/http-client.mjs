import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { cpus, platform } from 'node:os';
import { chromium } from '@playwright/test';

// Capture the actual application service before and after the change. The old
// browser bundle is a local build artifact, not a retained Axios dependency.
const root = resolve(import.meta.dirname, '..');
const artifacts = join(root, '_build/http-client-bench');
const [mode, ...args] = process.argv.slice(2);
const validLabel = value => /^[a-z0-9-]+$/.test(value ?? '');
mkdirSync(artifacts, { recursive: true });

if (mode === 'capture') {
  const [label, source = root] = args;
  if (!validLabel(label)) throw new Error('Expected capture <label> [source checkout]');
  const checkout = resolve(source);
  const require = createRequire(join(checkout, 'frontend/package.json'));
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);
  const dir = join(artifacts, label);
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, `export { fetchInbox } from ${JSON.stringify(join(checkout, 'frontend/src/services/features.ts'))};\n`);
  await build({
    root: join(checkout, 'frontend'), configFile: false, envDir: false,
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
    build: { outDir: dir, emptyOutDir: false, minify: true,
      lib: { entry, formats: ['es'], fileName: () => 'client.js' } },
  });
  const assets = join(checkout, 'frontend/dist/assets');
  const sizes = readdirSync(assets).filter(name => /\.(js|css)$/.test(name)).map(name => {
    const bytes = readFileSync(join(assets, name));
    return { file: name, bytes: bytes.length, gzip_bytes: gzipSync(bytes).length };
  });
  const lock = JSON.parse(readFileSync(join(checkout, 'frontend/package-lock.json'), 'utf8'));
  const packages = Object.entries(lock.packages).filter(([name]) => name !== '');
  const metadata = { label,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: checkout, encoding: 'utf8' }).trim(),
    assets: sizes, packages: packages.length, runtime_packages: packages.filter(([, value]) => !value.dev).length,
    direct_runtime_dependencies: Object.keys(lock.packages[''].dependencies),
    axios: lock.packages['node_modules/axios']?.version ?? null,
  };
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(JSON.stringify(metadata, null, 2));
} else if (mode === 'compare') {
  if (args.length !== 2 || !args.every(validLabel)) throw new Error('Expected compare <before label> <after label>');
  const clients = args.map(label => ({ label, bundle: readFileSync(join(artifacts, label, 'client.js')),
    metadata: JSON.parse(readFileSync(join(artifacts, label, 'metadata.json'), 'utf8')) }));
  let payload = '', expectedItems = 0, requests = 0;
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const client = clients.find(value => req.url === `/${value.label}.js`);
    if (client) { res.setHeader('Content-Type', 'text/javascript'); res.end(client.bundle); }
    else if (req.url === '/api/notifications' && req.headers.authorization === 'Bearer benchmark-only') {
      requests++;
      res.setHeader('Content-Type', 'application/json'); res.end(payload);
    } else if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>HTTP client benchmark</title>'); }
    else { res.writeHead(404).end(); }
  });
  let browser;
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => localStorage.setItem('token', 'benchmark-only'));
    const results = [];
    const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))];
    for (const count of [1, 100]) {
      expectedItems = count;
      payload = JSON.stringify({ now: 1700000000000, unread: count, items: Array.from({ length: count }, (_, i) => ({
        id: i + 1, kind: 'message', actor: { id: 2, username: '日本語の相手', avatar_url: '' },
        conversation_id: 0, message_id: i + 1, read: false, created_at: '2026-09-23T00:00:00Z',
      })) });
      for (const concurrency of [1, 6]) {
        const samples = new Map(args.map(label => [label, { latencies: [], elapsed: 0 }]));
        for (let round = -1; round < 8; round++) {
          // Alternate which client runs first; the first pair is warm-up only.
          const order = round % 2 === 0 ? args : [...args].reverse();
          for (const label of order) {
            const receivedBefore = requests;
            const measured = await page.evaluate(async ({ label, count, concurrency }) => {
              const { fetchInbox } = await import(`/${label}.js`);
              const latencies = [], start = performance.now();
              for (let batch = 0; batch < 20; batch++) {
                await Promise.all(Array.from({ length: concurrency }, async () => {
                  const began = performance.now();
                  const value = await fetchInbox();
                  if (value.items.length !== count || value.unread !== count) throw new Error('Incorrect decoded response');
                  latencies.push(performance.now() - began);
                }));
              }
              return { latencies, elapsed: performance.now() - start };
            }, { label, count: expectedItems, concurrency });
            if (requests - receivedBefore !== 20 * concurrency) throw new Error('Requests were cached or duplicated');
            if (round >= 0) {
              const target = samples.get(label);
              target.latencies.push(...measured.latencies); target.elapsed += measured.elapsed;
            }
          }
        }
        for (const [label, sample] of samples) results.push({ label, items: count, payload_bytes: Buffer.byteLength(payload), concurrency,
          requests: sample.latencies.length, median_ms: quantile(sample.latencies, 0.5), p95_ms: quantile(sample.latencies, 0.95),
          requests_per_second: sample.latencies.length * 1000 / sample.elapsed });
      }
    }
    const report = { measured_at: new Date().toISOString(), node: process.version, chromium: browser.version(),
      platform: platform(), cpu: cpus()[0].model, clients: clients.map(value => value.metadata), results,
      scope: 'Headless Chromium, loopback HTTP/1.1, no cache, no DB/TLS/WAN; actual fetchInbox plus shared MoonBit decoder; alternating batches, eight measured rounds after warm-up.' };
    const file = join(artifacts, `${args.join('-vs-')}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2)); console.log(`Saved ${file}`);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
} else throw new Error('Expected capture or compare');
