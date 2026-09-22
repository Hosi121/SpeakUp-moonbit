import { createServer } from 'node:http';
import { once } from 'node:events';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { cpus } from 'node:os';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..'), artifacts = join(root, '_build/navigation-bench');
const [mode, ...args] = process.argv.slice(2);
const valid = label => /^[a-z0-9-]+$/.test(label ?? '');
mkdirSync(artifacts, { recursive: true });

if (mode === 'capture') {
  const [label, source = root] = args;
  if (!valid(label)) throw new Error('Expected capture <label> [source checkout]');
  const checkout = resolve(source), dir = join(artifacts, label);
  if (existsSync(dir)) throw new Error('Use a new capture label to preserve the previous build');
  mkdirSync(dir);
  cpSync(join(checkout, 'frontend/dist'), join(dir, 'dist'), { recursive: true });
  const assets = readdirSync(join(dir, 'dist/assets')).map(file => {
    const data = readFileSync(join(dir, 'dist/assets', file));
    return { file, bytes: data.length, gzip_bytes: gzipSync(data).length };
  });
  const lock = JSON.parse(readFileSync(join(checkout, 'frontend/package-lock.json'), 'utf8'));
  const packages = Object.entries(lock.packages).filter(([name]) => name !== '');
  const metadata = { label, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: checkout, encoding: 'utf8' }).trim(),
    assets, packages: packages.length, runtime_packages: packages.filter(([, pkg]) => !pkg.dev).length,
    direct_runtime_dependencies: Object.keys(lock.packages[''].dependencies ?? {}) };
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(JSON.stringify(metadata, null, 2));
} else if (mode === 'compare' || mode === 'compare-auth') {
  if (args.length !== 2 || !args.every(valid)) throw new Error('Expected compare <before label> <after label>');
  const clients = [], results = [];
  let browser;
  try {
    for (const label of args) {
      const dir = join(artifacts, label), files = new Map();
      const html = readFileSync(join(dir, 'dist/index.html'));
      for (const file of readdirSync(join(dir, 'dist/assets'))) {
        const data = readFileSync(join(dir, 'dist/assets', file));
        const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
        files.set(`/assets/${file}`, { body: gzipSync(data), type });
      }
      const server = createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        const file = files.get(req.url);
        if (file) {
          res.setHeader('Content-Type', file.type); res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Content-Length', file.body.length); res.end(file.body);
        } else if (req.url === '/login' || req.url === '/signup' || req.url === '/home') {
          res.setHeader('Content-Type', 'text/html'); res.end(html);
        } else if (req.url === '/api/events/overview') {
          res.setHeader('Content-Type', 'application/json'); res.end('[]');
        } else if (mode === 'compare-auth' && req.url === '/api/signin' && req.method === 'POST') {
          req.resume();
          res.setHeader('Content-Type', 'application/json'); res.end('{"token":"benchmark-fixture"}');
        } else if (mode === 'compare-auth' && req.url === '/api/notifications') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ items: [], unread: 0, now: Date.now() }));
        } else res.writeHead(404).end();
      });
      // This fixture measures frontend loading, not notification transport.
      server.on('upgrade', (_request, socket) => socket.destroy());
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      clients.push({ label, server, url: `http://127.0.0.1:${server.address().port}`,
        metadata: JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')) });
    }
    browser = await chromium.launch();
    const profiles = [
      { name: 'loopback', latency: 0, downloadThroughput: -1, uploadThroughput: -1, cpu: 1 },
      { name: 'emulated-mobile', latency: 40, downloadThroughput: 200000, uploadThroughput: 93750, cpu: 4 },
    ];
    const scenarios = mode === 'compare-auth'
      ? [{ path: '/login', input: 'immediate-fill' }, { path: '/login', input: 'typing-30ms' }]
      : [{ path: '/login' }, { path: '/home' }];
    for (const profile of profiles) {
      for (const { path, input } of scenarios) {
        const samples = new Map(args.map(label => [label, []]));
        for (let round = -1; round < 7; round++) {
          for (const client of round % 2 === 0 ? clients : [...clients].reverse()) {
            const context = await browser.newContext();
            try {
              const page = await context.newPage(), errors = [];
              page.on('pageerror', error => errors.push(error.message));
              const session = await context.newCDPSession(page);
              await session.send('Network.enable');
              await session.send('Network.setCacheDisabled', { cacheDisabled: true });
              await session.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency,
                downloadThroughput: profile.downloadThroughput, uploadThroughput: profile.uploadThroughput });
              await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
              // Measure rendering from inside the page, excluding locator round trips.
              await page.addInitScript(({ heading }) => {
                const measureHeading = () => {
                  const text = document.querySelector('h1')?.textContent;
                  if (text === heading && !performance.getEntriesByName('initial-visible').length)
                    requestAnimationFrame(() => requestAnimationFrame(() => performance.mark('initial-visible')));
                  if (text === 'サインアップ' && !performance.getEntriesByName('signup-visible').length)
                    requestAnimationFrame(() => requestAnimationFrame(() => performance.mark('signup-visible')));
                  if (text === '直近の参加予定' && !performance.getEntriesByName('home-visible').length)
                    requestAnimationFrame(() => requestAnimationFrame(() => performance.mark('home-visible')));
                };
                new MutationObserver(measureHeading).observe(document, { childList: true, subtree: true });
                document.addEventListener('click', event => {
                  if (event.target instanceof Element && event.target.closest('a')?.getAttribute('href') === '/signup')
                    performance.mark('signup-click');
                }, true);
                document.addEventListener('submit', () => performance.mark('auth-submit'), true);
              }, { heading: path === '/login' ? 'サインイン' : '直近の参加予定' });
              await page.goto(`${client.url}${path}`);
              await page.waitForFunction(() => performance.getEntriesByName('initial-visible').length > 0);
              const initial = await page.evaluate(() => ({
                initial_ms: performance.getEntriesByName('initial-visible')[0].startTime,
                scripts: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.endsWith('.js'))
                  .map(entry => ({ file: new URL(entry.name).pathname, encoded_bytes: entry.encodedBodySize, decoded_bytes: entry.decodedBodySize })),
                assets: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.startsWith('/assets/'))
                  .map(entry => ({ file: new URL(entry.name).pathname, encoded_bytes: entry.encodedBodySize, decoded_bytes: entry.decodedBodySize })),
              }));
              let signup_ms = null, auth = {};
              if (input) {
                await page.evaluate(() => performance.mark('input-start'));
                const email = page.getByLabel('Email', { exact: true });
                const password = page.getByLabel('パスワード', { exact: true });
                if (input === 'typing-30ms') {
                  // Controlled keystroke pacing, not a wait for page readiness.
                  await email.pressSequentially('alice@example.test', { delay: 30 });
                  await password.pressSequentially('fixture-password', { delay: 30 });
                } else {
                  await email.fill('alice@example.test'); await password.fill('fixture-password');
                }
                await page.getByRole('button', { name: 'サインイン', exact: true }).click();
                await page.waitForFunction(() => performance.getEntriesByName('home-visible').length > 0);
                auth = await page.evaluate(() => {
                  const at = name => performance.getEntriesByName(name)[0].startTime;
                  const scripts = performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.endsWith('.js'));
                  return { submit_to_home_ms: at('home-visible') - at('auth-submit'),
                    input_to_home_ms: at('home-visible') - at('input-start'), total_to_home_ms: at('home-visible'),
                    total_js_requests: scripts.length, total_js_gzip_bytes: scripts.reduce((n, entry) => n + entry.encodedBodySize, 0) };
                });
              } else if (path === '/login') {
                await page.getByRole('link', { name: 'サインアップ', exact: true }).click();
                await page.waitForFunction(() => performance.getEntriesByName('signup-visible').length > 0);
                signup_ms = await page.evaluate(() => performance.getEntriesByName('signup-visible')[0].startTime - performance.getEntriesByName('signup-click')[0].startTime);
              }
              if (errors.length) throw new Error(errors.join('\n'));
              if (round >= 0) samples.get(client.label).push({ ...initial, signup_ms, ...auth });
            } finally { await context.close(); }
          }
        }
        for (const [label, runs] of samples) {
          const median = key => [...runs].map(run => run[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
          results.push({ profile, path, label, initial_median_ms: median('initial_ms'), signup_median_ms: median('signup_ms'),
            ...(input ? { input, submit_to_home_median_ms: median('submit_to_home_ms'),
              input_to_home_median_ms: median('input_to_home_ms'), total_to_home_median_ms: median('total_to_home_ms') } : {}),
            initial_scripts: runs[0].scripts,
            initial_assets: runs[0].assets,
            runs: runs.map(({ scripts, assets, ...run }) => ({ ...run,
              asset_requests: assets.length, asset_gzip_bytes: assets.reduce((n, asset) => n + asset.encoded_bytes, 0),
              js_requests: scripts.length, js_gzip_bytes: scripts.reduce((n, script) => n + script.encoded_bytes, 0) })) });
        }
      }
    }
    const report = { measured_at: new Date().toISOString(), node: process.version, chromium: browser.version(), cpu: cpus()[0].model,
      clients: clients.map(client => client.metadata), results,
      scope: 'Production builds over gzip HTTP/1.1 on loopback; fresh browser contexts and disabled cache; one warm-up and seven measured rounds with alternating client order per route/profile. Headings plus two animation frames; no backend or real mobile device.',
      scenario: mode === 'compare-auth'
        ? 'Login to home with an immediate fill and with 30 ms between keystrokes (34 characters total); same successful signin, empty events/inbox fixtures. Includes first-use code download before sending signin. Input and submit times are in-page marks; no websocket transport.'
        : 'Initial login/home, then first signup navigation from login. Home events use an empty HTTP fixture.' };
    const file = join(artifacts, `${args.join('-vs-')}${mode === 'compare-auth' ? '-auth' : ''}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(results.map(({ runs, ...result }) => ({ ...result, runs: runs.length })), null, 2));
    console.log(`Saved ${file}`);
  } finally {
    await browser?.close();
    for (const client of clients) { client.server.closeAllConnections(); await new Promise(resolve => client.server.close(resolve)); }
  }
} else throw new Error('Expected capture, compare or compare-auth');
