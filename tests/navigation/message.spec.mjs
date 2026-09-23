import { test, expect } from '@playwright/test';

const peer = { id: 2, username: 'Bob', avatar_url: '' };
const message = (id, body, sender_id = 1, read_at = '') => ({ id, body, sender_id,
  recipient_id: sender_id === 1 ? 2 : 1, created_at: '2026-09-22T10:00:00Z', read_at });
const thread = (messages = [], has_older = false) => ({ peer, messages, has_older });
// Both entries mount the same renderer/controller. Exercise its scenarios once.
test.describe('message app', () => {
  const enter = page => page.goto('/message/2');
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ json: { items: [], unread: 0, now: Date.now() } }));
    await page.routeWebSocket('**/activity', socket => socket.onMessage(() => socket.send('{"type":"refresh"}')));
  });

  test('initial load, older page and send preserve safe text, order and read receipts', async ({ page }) => {
    const requests = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const old = message(1, '古いメッセージ'), recent = message(2, '届いたメッセージ', 2);
    await page.route('**/api/messages/2**', async route => {
      const request = route.request(), method = request.method(), path = new URL(request.url()).pathname;
      requests.push({ method, path, body: request.postDataJSON() });
      if (path.endsWith('/before/2')) return route.fulfill({ json: thread([old]) });
      if (method === 'PUT') return route.fulfill({ json: thread([{ ...recent, read_at: '2026-09-22T10:01:00Z' }], true) });
      if (method === 'POST') return route.fulfill({ json: thread([recent, message(3, request.postDataJSON().body, 1, '2026-09-22T10:02:00Z')], true) });
      return route.fulfill({ json: thread([recent], true) });
    });
    await enter(page);
    await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible();
    await expect.poll(() => requests.filter(r => r.method === 'PUT').length).toBe(1);
    await page.getByRole('button', { name: '以前のメッセージ' }).click();
    await expect(page.getByRole('log').locator('.chat-bubble > p')).toHaveText(['古いメッセージ', '届いたメッセージ']);
    await expect(page.getByRole('button', { name: '以前のメッセージ' })).toBeHidden();
    const input = page.getByLabel('メッセージを入力');
    await input.fill('  '); await expect(page.getByRole('button', { name: '送信', exact: true })).toBeDisabled();
    const body = '<img src=x onerror="window.injected=true"> 日本語 😀';
    await input.fill(body); await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(page.getByRole('log').locator('.chat-bubble > p')).toHaveText(['古いメッセージ', '届いたメッセージ', body]);
    await expect(page.getByRole('log').locator('.chat-bubble').last()).toContainText('既読');
    expect(await page.getByRole('log').locator('img').count()).toBe(0);
    expect(await page.evaluate(() => window.injected)).toBeUndefined();
    expect(requests.find(r => r.method === 'PUT').body).toEqual({ through_id: 2 });
    const sent = requests.filter(r => r.method === 'POST');
    expect(sent).toHaveLength(1); expect(sent[0].body.body).toBe(body);
    expect(sent[0].body.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(errors).toEqual([]);
  });

  test('failed send retains the draft and reuses the idempotency key', async ({ page }) => {
    const sent = [];
    await page.route('**/api/messages/2', route => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: thread() });
      sent.push(route.request().postDataJSON());
      return sent.length === 1
        ? route.fulfill({ status: 503, json: { error: '一時的な送信エラー' } })
        : route.fulfill({ json: thread([message(1, sent.at(-1).body)]) });
    });
    await enter(page);
    const input = page.getByLabel('メッセージを入力');
    await input.fill('もう一度送る'); await input.press('Enter');
    await expect(page.getByRole('alert')).toContainText('一時的な送信エラー');
    await expect(input).toHaveValue('もう一度送る');
    await page.getByRole('button', { name: '送信', exact: true }).click();
    await expect(page.getByRole('log')).toContainText('もう一度送る');
    await expect(input).toHaveValue('');
    expect(sent).toHaveLength(2); expect(sent[0]).toEqual(sent[1]);
  });

  test('pending send locks the input and prevents duplicate submissions', async ({ page }) => {
    const gate = Promise.withResolvers(), started = Promise.withResolvers();
    let calls = 0;
    await page.route('**/api/messages/2', async route => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: thread() });
      calls++; started.resolve(); await gate.promise;
      await route.fulfill({ json: thread([message(1, '一度だけ')]) });
    });
    try {
      await enter(page);
      const input = page.getByLabel('メッセージを入力');
      await input.fill('一度だけ'); await input.press('Enter'); await started.promise;
      await expect(input).toBeDisabled();
      await page.locator('form.search-form').evaluate(form => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      gate.resolve();
      await expect(input).toBeEnabled(); await expect(input).toHaveValue('');
      expect(calls).toBe(1);
    } finally { gate.resolve(); await page.unrouteAll({ behavior: 'wait' }); }
  });

  test('malformed responses show a recoverable error', async ({ page }) => {
    await page.route('**/api/messages/2', route => route.fulfill({ json: { peer, messages: 'invalid', has_older: false } }));
    await enter(page);
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expect(page.getByLabel('メッセージを入力')).toBeHidden();
  });

  if (process.env.MESSAGE_VIEW !== 'legacy') {
    test('background updates preserve the composing input, selection and existing message elements', async ({ page }) => {
      let messages = [message(1, '既存のメッセージ')];
      await page.route('**/api/messages/2', route => route.fulfill({ json: thread(messages) }));
      await enter(page);
      const input = page.getByLabel('メッセージを入力');
      await input.fill('日本語を入力中');
      await input.evaluate(element => {
        window.composingInput = element;
        window.firstMessage = document.querySelector('.chat-bubble');
        element.setSelectionRange(2, 5);
        element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '入力' }));
      });
      messages = [...messages, message(2, 'バックグラウンド更新')];
      await page.evaluate(() => window.dispatchEvent(new Event('speakup:activity')));
      await expect(page.getByRole('log')).toContainText('バックグラウンド更新');
      await expect(input).toHaveValue('日本語を入力中'); await expect(input).toBeFocused();
      expect(await input.evaluate(element => ({ same: element === window.composingInput,
        sameRow: document.querySelector('.chat-bubble') === window.firstMessage,
        start: element.selectionStart, end: element.selectionEnd }))).toEqual({ same: true, sameRow: true, start: 2, end: 5 });
      await input.dispatchEvent('compositionend', { data: '入力' });
    });

    test('hidden messages are acknowledged only after the visibility event', async ({ page }) => {
      let reads = 0;
      await page.addInitScript(() => {
        window.fixtureVisible = false;
        Object.defineProperty(document, 'visibilityState', { get: () => window.fixtureVisible ? 'visible' : 'hidden' });
      });
      await page.route('**/api/messages/2**', route => {
        if (route.request().method() === 'PUT') reads++;
        return route.fulfill({ json: thread([message(1, '受信', 2, reads ? 'read' : '')]) });
      });
      await enter(page); await expect(page.getByRole('log')).toContainText('受信');
      expect(reads).toBe(0);
      await page.evaluate(() => { window.fixtureVisible = true; document.dispatchEvent(new Event('visibilitychange')); });
      await expect.poll(() => reads).toBe(1);
    });
  }
});

if (process.env.MESSAGE_VIEW !== 'legacy') test('standalone DOM page loads without React and resumes its controller after a cached page restore', async ({ page }) => {
  const scripts = [], requests = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('.js')) scripts.push(response.text());
  });
  await page.route('**/api/messages/2', route => {
    requests.push(route.request()); return route.fulfill({ json: thread([message(requests.length, 'saved')]) });
  });
  await page.goto('http://127.0.0.1:5175/message-dom.html?peer=2'); await expect(page.getByRole('log')).toContainText('saved');
  await page.getByLabel('メッセージを入力').fill('保存する下書き');
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new Event('speakup:activity'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.getByRole('log').locator('.chat-bubble')).toHaveCount(2);
  await expect(page.getByLabel('メッセージを入力')).toHaveValue('保存する下書き');
  expect(requests).toHaveLength(2);
  expect((await Promise.all(scripts)).join('\n')).not.toMatch(/react\.element|react-dom\.production|react\.production/);
});
