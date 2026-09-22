import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

for (const kind of ['direct', 'event']) test(`${kind} conversations share real audio, reconnect, completion and private reflection`, async ({ browser, request }) => {
  const contexts = [];
  const errors = [];
  const tokens = [];
  const api = async (path, user = 0, data) => {
    const result = await request.fetch(`http://127.0.0.1:8081${path}`, {
      method: data === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${tokens[user]}` }, data,
    });
    expect(result.ok()).toBeTruthy(); return result.json();
  };
  try {
    for (const email of ['alice@example.test', 'bob@example.test']) {
      const login = await request.post('http://127.0.0.1:8081/signin', { data: { email, password: 'speakup-local-only' } });
      expect(login.ok()).toBeTruthy();
      const { token } = await login.json();
      tokens.push(token);
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
    }
    const alice = contexts[0].pages()[0], bob = contexts[1].pages()[0];
    let id;
    const theme = `Browser event ${randomUUID()}`;
    if (kind === 'direct') {
      await alice.goto('/sessionlist');
      await alice.getByLabel('ユーザー名を検索').fill('Bob');
      await alice.getByRole('button', { name: '検索', exact: true }).click();
      const created = alice.waitForResponse(r => r.url().endsWith('/api/conversations/direct') && r.request().method() === 'POST');
      await alice.getByRole('button', { name: 'Bob と通話する', exact: true }).click();
      const response = await created;
      expect(response.ok()).toBeTruthy(); id = (await response.json()).id;
    } else {
      const event = await api('/events', 0, { event_start: new Date().toISOString(), theme, topics: ['音声と型'] });
      for (const user of [0, 1]) await api(`/events/${event.id}/register`, user, { participates_bit: 1 });
      const matches = await api(`/events/${event.id}/match`, 0, {});
      expect(matches).toHaveLength(1); id = matches[0].id;
      await alice.goto('/sessionlist');
      await alice.getByRole('article').filter({ hasText: theme }).getByRole('button', { name: '参加する', exact: true }).click();
    }
    await expect(alice).toHaveURL(new RegExp(`/session\\?conversation=${id}$`));
    await expect(alice.getByRole('status')).toHaveText('相手の接続を待っています');
    expect((await api(`/conversations/${id}`)).started_at).toBe(0);
    // The recipient explicitly chooses to join; an invitation cannot open their microphone.
    await bob.goto('/sessionlist');
    const invitation = kind === 'direct'
      ? bob.getByRole('article').filter({ hasText: '随時通話' }).first()
      : bob.getByRole('article').filter({ hasText: theme });
    await expect(invitation).toContainText('相手：Alice');
    await invitation.getByRole('button', { name: '参加する', exact: true }).click();
    await expect(bob).toHaveURL(new RegExp(`/session\\?conversation=${id}$`));
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
      await expect(page.getByRole('status')).toHaveText(kind === 'direct' ? '通話中' : /通話中：残り \d+ 秒/);
    }
    const started = await api(`/conversations/${id}`);
    expect(started.started_at).toBeGreaterThan(0); expect(started.revision).toBe(1);
    // Replacing the UI primitives must not interrupt media or lose keyboard access.
    const mute = alice.getByRole('button', { name: 'マイクをミュート', exact: true });
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => alice.evaluate(() => globalThis.__testPeers
      .filter(peer => peer.connectionState === 'connected')
      .every(peer => peer.getSenders().every(sender => !sender.track || !sender.track.enabled)))).toBe(true);
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await alice.getByRole('button', { name: 'メモ', exact: true }).click();
    const memo = alice.getByRole('dialog', { name: 'メモ', exact: true });
    await expect(memo).toBeVisible();
    await memo.getByRole('radio', { name: '持ち込みメモ', exact: true }).focus();
    await alice.keyboard.press('ArrowRight');
    await expect(memo.getByRole('radio', { name: 'ワードリスト' })).toBeChecked();
    await alice.keyboard.press('Escape');
    await expect(memo).toBeHidden();
    await expect(alice.getByRole('button', { name: 'メモ', exact: true })).toBeFocused();
    await alice.getByRole('button', { name: 'トピック', exact: true }).click();
    await expect(alice.getByRole('dialog')).toBeVisible();
    await alice.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();
    await bob.getByRole('button', { name: '通話一覧へ戻る' }).click();
    await expect(alice.getByRole('alert')).toContainText('相手が通話から退出しました');
    await expect.poll(() => alice.evaluate(() => globalThis.__testPeers.every(p => p.connectionState === 'closed'))).toBe(true);
    const disconnected = await api(`/conversations/${id}`);
    expect(disconnected.started_at).toBe(started.started_at); expect(disconnected.ended_at).toBe(0);
    await alice.getByRole('button', { name: '再接続', exact: true }).click();
    const resume = kind === 'direct'
      ? bob.getByRole('article').filter({ hasText: '随時通話' }).first()
      : bob.getByRole('article').filter({ hasText: theme });
    await resume.getByRole('button', { name: '再参加する', exact: true }).click();
    for (const page of [alice, bob]) {
      await expect.poll(() => page.evaluate(() => globalThis.__testPeers.some(p => p.connectionState === 'connected')), { timeout: 25_000 }).toBe(true);
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    expect((await api(`/conversations/${id}`)).started_at).toBe(started.started_at);
    await alice.getByRole('button', { name: '通話を終了して記録する' }).click();
    for (const page of [alice, bob]) {
      await expect(page).toHaveURL(new RegExp(`/sessionrecord\\?conversation=${id}$`));
      await expect(page.getByRole('heading', { name: '会話の振り返り' })).toBeVisible();
      await expect.poll(() => page.evaluate(() => globalThis.__testPeers.every(p => p.connectionState === 'closed'))).toBe(true);
    }
    await alice.getByLabel('満足度 (%)').fill('85');
    await alice.getByLabel('感想', { exact: true }).fill('再接続後も同じ会話');
    await alice.getByLabel('学んだ表現').fill('Nice to meet you.');
    await alice.getByRole('button', { name: '保存', exact: true }).click();
    await expect(alice.getByRole('alert')).toContainText('保存済み');
    await alice.reload();
    await expect(alice.getByLabel('感想', { exact: true })).toHaveValue('再接続後も同じ会話');
    await expect(alice.getByLabel('満足度 (%)')).toHaveValue('85');
    await bob.reload();
    await expect(bob.getByLabel('感想', { exact: true })).toBeEnabled();
    await expect(bob.getByLabel('感想', { exact: true })).toHaveValue('');
    await alice.getByRole('button', { name: '会話の記録へ' }).click();
    const history = kind === 'direct'
      ? alice.getByRole('article').filter({ hasText: '随時通話' }).first()
      : alice.getByRole('article').filter({ hasText: theme });
    await history.getByRole('button', { name: '振り返りを開く' }).click();
    await expect(alice).toHaveURL(new RegExp(`/sessionrecord\\?conversation=${id}$`));
    await expect(alice.getByLabel('学んだ表現')).toHaveValue('Nice to meet you.');
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
