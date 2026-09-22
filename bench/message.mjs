import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { cpus } from 'node:os';
import { chromium } from '@playwright/test';

const labels = process.argv.slice(2);
if (labels.length !== 2 || !labels.every(label => /^[a-z0-9-]+$/.test(label))) throw new Error('Expected <before capture> <after capture>');
const root = resolve(import.meta.dirname, '../_build/navigation-bench');
const profiles = [
  { name: 'loopback', latency: 0, down: -1, up: -1, cpu: 1 },
  { name: 'emulated-mobile', latency: 40, down: 200000, up: 93750, cpu: 4 },
];
const servers = [], cases = [], results = [];
let browser;
try {
  for (const [index, label] of labels.entries()) {
    const dir = join(root, label, 'dist');
    const views = join(root, label, 'views');
    const assets = new Map([dir, ...(index ? [views] : [])].flatMap(base =>
      readdirSync(join(base, 'assets')).map(file => [file, readFileSync(join(base, 'assets', file))])));
    const original = Array.from({ length: 50 }, (_, index) => ({ id: index + 1, sender_id: 1, recipient_id: 2,
      body: `日本語のメッセージ ${index + 1}`, created_at: '2026-09-22T10:00:00Z', read_at: '2026-09-22T10:01:00Z' }));
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, 'http://localhost');
      response.setHeader('Cache-Control', 'no-store');
      if (url.pathname.startsWith('/assets/')) {
        const name = url.pathname.slice('/assets/'.length), data = assets.get(name);
        if (!data) return response.writeHead(404).end();
        const body = gzipSync(data);
        response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream');
        response.setHeader('Content-Encoding', 'gzip'); response.setHeader('Content-Length', body.length); response.end(body);
      } else if (url.pathname === '/api/messages/2') {
        const messages = [...original];
        if (request.method === 'POST') {
          let raw = ''; for await (const chunk of request) raw += chunk;
          messages.push({ ...original[0], id: 51, body: JSON.parse(raw).body, read_at: '' });
        }
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ peer: { id: 2, username: 'Bob', avatar_url: '' }, messages, has_older: false }));
      } else if (['/message/2', '/message-dom.html', '/message-react.html'].includes(url.pathname)) {
        response.setHeader('Content-Type', 'text/html');
        response.end(readFileSync(url.pathname === '/message/2' ? join(dir, 'index.html') : join(views, url.pathname.slice(1))));
      } else response.writeHead(404).end();
    });
    server.on('upgrade', (_request, socket) => socket.destroy());
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
    const base = `http://127.0.0.1:${server.address().port}`;
    cases.push({ name: index ? 'app-moonbit' : 'app-before', label, url: base + '/message/2' });
    if (index) for (const renderer of ['react', 'dom']) cases.push({ name: `isolated-${renderer}`, label, url: `${base}/message-${renderer}.html?peer=2` });
  }
  browser = await chromium.launch();
  for (const profile of profiles) {
    const samples = new Map(cases.map(item => [item.name, []]));
    for (let round = -1; round < 7; round++) {
      for (const item of round % 2 ? [...cases].reverse() : cases) {
        const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
        try {
          const page = await context.newPage(), errors = [];
          page.on('pageerror', error => errors.push(error.message));
          const session = await context.newCDPSession(page);
          await session.send('Network.enable'); await session.send('Network.setCacheDisabled', { cacheDisabled: true });
          await session.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.down, uploadThroughput: profile.up });
          await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
          await page.addInitScript(() => {
            const scheduled = new Set();
            const mark = name => {
              if (scheduled.has(name)) return; scheduled.add(name);
              requestAnimationFrame(() => requestAnimationFrame(() => performance.mark(name)));
            };
            new MutationObserver(() => {
              const count = document.querySelectorAll('.chat-bubble').length;
              if (count === 50) mark('messages-visible');
              if (count === 51) mark('sent-visible');
            }).observe(document, { childList: true, subtree: true });
            document.addEventListener('submit', () => performance.mark('message-submit'), true);
          });
          await page.goto(item.url);
          await page.waitForFunction(() => performance.getEntriesByName('messages-visible').length > 0);
          const initial = await page.evaluate(() => ({ initial_ms: performance.getEntriesByName('messages-visible')[0].startTime,
            scripts: performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname.endsWith('.js'))
              .map(r => ({ file: new URL(r.name).pathname, gzip_bytes: r.encodedBodySize, raw_bytes: r.decodedBodySize })) }));
          await page.getByLabel('メッセージを入力').fill('同じ入力で送信を比較 😀');
          if (round === -1 && profile.name === 'loopback') await page.screenshot({ path: resolve(import.meta.dirname, `../_build/message-${item.name}.png`), fullPage: true });
          await page.getByRole('button', { name: '送信', exact: true }).click();
          await page.waitForFunction(() => performance.getEntriesByName('sent-visible').length > 0);
          const send_ms = await page.evaluate(() => performance.getEntriesByName('sent-visible')[0].startTime - performance.getEntriesByName('message-submit')[0].startTime);
          if (errors.length) throw new Error(errors.join('\n'));
          if (round >= 0) samples.get(item.name).push({ ...initial, send_ms });
        } finally { await context.close(); }
      }
    }
    for (const item of cases) {
      const runs = samples.get(item.name), median = key => runs.map(run => run[key]).sort((a, b) => a - b)[3];
      const result = { name: item.name, label: item.label, profile, initial_median_ms: median('initial_ms'), send_median_ms: median('send_ms'),
        js_gzip_bytes: runs[0].scripts.reduce((sum, file) => sum + file.gzip_bytes, 0), js_requests: runs[0].scripts.length, runs };
      results.push(result); console.log(JSON.stringify({ ...result, runs: runs.length }));
    }
  }
  const report = { measured_at: new Date().toISOString(), node: process.version, chromium: browser.version(), cpu: cpus()[0].model,
    builds: labels.map(label => JSON.parse(readFileSync(join(root, label, 'metadata.json')))),
    proof_assets: readdirSync(join(root, labels[1], 'views/assets')).filter(file => file.endsWith('.js')).map(file => {
      const data = readFileSync(join(root, labels[1], 'views/assets', file));
      return { file, bytes: data.length, gzip_bytes: gzipSync(data).length };
    }), results,
    scope: 'Gzip HTTP/1.1 loopback, fresh contexts, cache disabled, one warm-up + seven measured rounds with alternating order. Same 50-message fixture and successful send. In-page DOM mutation plus two animation frames; not LCP/INP. No real backend, notification websocket or IME benchmark.',
    comparison: 'app-before vs app-moonbit preserves the existing app shell. isolated-react vs isolated-dom uses the same minimal HTML host, MoonBit controller and browser ports. Isolated pages are not equivalent to the full app shell.' };
  const output = join(root, `${labels.join('-vs-')}-message.json`);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log(`Saved ${output}`);
} finally {
  await browser?.close();
  for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
