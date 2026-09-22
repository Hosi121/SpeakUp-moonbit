import { test, expect } from '@playwright/test';

test('public login reports HTTP errors and refuses an invalid token without replacing stored auth', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/signin', async route => {
    calls++;
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({ status: calls === 1 ? 401 : 200, contentType: 'application/json',
      body: calls === 1 ? '{"error":"メールアドレスまたはパスワードを確認してください"}' : '{"token":123}' });
  });
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('token', 'previous-auth'));
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('パスワード', { exact: true }).fill('fixture');
  await page.getByRole('button', { name: 'サインイン', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('メールアドレスまたはパスワードを確認してください');
  await page.getByRole('button', { name: 'サインイン', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'サインイン', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe('previous-auth');
  expect(calls).toBe(2);
});

test('leaving during ICE configuration cancels HTTP setup before the microphone is acquired', async ({ page }) => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const canceled = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/rtc-config'));
  await page.route('**/api/conversations/42', route => route.fulfill({ json: {
    id: 42, event_id: 0, round: 0, started_at: 0, ended_at: 0, cancelled_at: 0, revision: 0,
    theme: '1 対 1 通話', topics: [], event_start: '',
    participants: [{ id: 1, username: 'Alice', avatar_url: '' }, { id: 2, username: 'Bob', avatar_url: '' }],
  } }));
  await page.route('**/api/rtc-config', async route => {
    entered.resolve(); await release.promise;
    await route.fulfill({ json: { iceServers: [] } });
  });
  try {
    await page.goto('/login');
    await page.evaluate(async () => {
      const { startVoiceCall } = await import('/src/services/voiceCall.ts');
      window.setupEvents = [];
      navigator.mediaDevices.getUserMedia = async () => {
        window.setupEvents.push('microphone'); throw new Error('Unexpected microphone acquisition');
      };
      window.pendingCall = startVoiceCall({ conversationId: 42, audio: document.createElement('audio'),
        onLocal() {}, onRemote() {}, onState() {}, onConnection() {}, onError() { window.setupEvents.push('error'); } });
    });
    await entered.promise;
    await page.evaluate(() => window.pendingCall.stop());
    await canceled;
    expect(await page.evaluate(() => window.setupEvents)).toEqual([]);
  } finally {
    release.resolve(); await page.unrouteAll({ behavior: 'wait' });
  }
});
