import { test, expect } from '@playwright/test';

test('two real browsers negotiate and receive WebRTC audio through MoonBit signaling', async ({ browser, request }) => {
  const contexts = [];
  const errors = [];
  try {
    for (const email of ['alice@example.test', 'bob@example.test']) {
      const login = await request.post('http://127.0.0.1:8081/signin', { data: { email, password: 'speakup-local-only' } });
      expect(login.ok()).toBeTruthy();
      const { token } = await login.json();
      const context = await browser.newContext({ permissions: ['microphone'] });
      contexts.push(context);
      await context.addInitScript(token => {
        localStorage.setItem('token', token);
        // Test instrumentation only: observe the actual browser RTP counters.
        globalThis.__testPeers = [];
        const Original = RTCPeerConnection;
        globalThis.RTCPeerConnection = class extends Original {
          constructor(...args) { super(...args); globalThis.__testPeers.push(this); }
        };
      }, token);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://localhost:5173/session');
    }
    for (const context of contexts) {
      const page = context.pages()[0];
      await expect.poll(() => page.evaluate(() => globalThis.__testPeers.some(p => p.connectionState === 'connected')), { timeout: 25_000 }).toBe(true);
      await expect.poll(() => page.evaluate(async () => {
        for (const pc of globalThis.__testPeers) for (const report of (await pc.getStats()).values()) {
          if (report.type === 'inbound-rtp' && report.kind === 'audio' && report.bytesReceived > 0) return true;
        }
        return false;
      }), { timeout: 15_000 }).toBe(true);
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    const alice = contexts[0].pages()[0], bob = contexts[1].pages()[0];
    await bob.goto('http://localhost:5173/home');
    await expect(alice.getByRole('alert')).toContainText('相手が通話から退出しました');
    await expect.poll(() => alice.evaluate(() => globalThis.__testPeers.every(p => p.connectionState === 'closed'))).toBe(true);
    expect(errors).toEqual([]);
  } finally { for (const context of contexts) await context.close(); }
});

test('existing login and memo pages use the migrated API', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('alice@example.test');
  await page.getByLabel(/パスワード/).fill('speakup-local-only');
  await page.getByRole('button', { name: 'サインイン' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto('/memo');
  const memo = page.getByRole('textbox', { name: '持ち込みメモ' });
  await expect(memo).toBeVisible();
  await memo.fill('ブラウザから MoonBit へ');
  const saved = page.waitForResponse(r => r.url().endsWith('/api/memo') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存' }).click();
  expect((await saved).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '持ち込みメモ' })).toHaveValue('ブラウザから MoonBit へ');
});
