import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function authenticate(page, request) {
  const response = await request.post('http://127.0.0.1:8081/signin', {
    data: { email: 'alice@example.test', password: 'speakup-local-only' },
  });
  expect(response.ok()).toBeTruthy();
  const { token } = await response.json();
  await page.addInitScript(token => localStorage.setItem('token', token), token);
  return token;
}

test('background list refresh keeps a selected invitation actionable', async ({ page, request }) => {
  await authenticate(page, request);
  await page.goto('/sessionlist');
  await page.getByLabel('ユーザー名を検索').fill('Bob');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  const invite = page.getByRole('button', { name: 'Bob と通話する', exact: true });
  await expect(invite).toBeEnabled();
  const refreshing = Promise.withResolvers();
  const release = Promise.withResolvers();
  await page.route('**/api/conversations', async route => {
    refreshing.resolve();
    await release.promise;
    await route.continue();
  });
  // Observe the click without creating a call; the list request stays pending.
  await page.route('**/api/conversations/direct', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"Test service unavailable"}',
  }));
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await refreshing.promise;
    await expect(page.getByRole('button', { name: '一覧を更新' })).toBeDisabled();
    await expect(invite).toBeEnabled();
    const sent = page.waitForResponse(response => response.url().endsWith('/api/conversations/direct'));
    await invite.click();
    expect((await sent).status()).toBe(503);
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('native dialog contains keyboard focus, restores it, and submits the event form', async ({ page, request }) => {
  await authenticate(page, request);
  await page.goto('/admin');
  const trigger = page.getByRole('button', { name: 'イベント作成', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'イベント作成', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '閉じる' })).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(dialog).toBeHidden();
  await trigger.click();
  const theme = `UI event ${randomUUID()}`;
  await dialog.getByLabel('予定日時').fill('2026-10-01T09:30');
  await dialog.getByLabel('テーマ', { exact: true }).fill(theme);
  await dialog.getByLabel('トピック 1').fill('CSS と標準 HTML');
  const created = page.waitForResponse(response => response.url().endsWith('/api/events') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: '作成', exact: true }).click();
  expect((await created).ok()).toBeTruthy();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('article', { name: '最後に作成したイベント', exact: true })).toContainText(theme);
  await page.getByRole('radio', { name: 'イベント管理' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'ユーザー情報', exact: true })).toBeChecked();
  await page.getByLabel('ユーザー名で検索').fill('Bob');
  await page.getByLabel('ユーザー名で検索').press('Enter');
  await expect(page.getByRole('listitem').filter({ hasText: 'bob@example.test' })).toContainText('Bob');
});

test('profile fields and avatar save, and logout clears the token', async ({ page, request }) => {
  const token = await authenticate(page, request);
  const headers = { Authorization: `Bearer ${token}` };
  const previous = await (await request.get('http://127.0.0.1:8081/user/info', { headers })).json();
  try {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'ユーザー名を編集' }).click();
    await page.getByLabel('ユーザー名', { exact: true }).fill('Alice UI');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('Alice UI', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Alice UI', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'メールアドレスを編集' }).click();
    await expect(page.getByLabel('メールアドレス', { exact: true })).toHaveValue('alice@example.test');
    await page.getByRole('button', { name: 'キャンセル' }).click();
    const uploaded = page.waitForResponse(response => response.url().endsWith('/api/user/avatar') && response.request().method() === 'PUT');
    await page.getByLabel('プロフィール画像').setInputFiles({
      name: 'avatar.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHdcAAAAASUVORK5CYII=', 'base64'),
    });
    expect((await uploaded).ok()).toBeTruthy();
    const avatar = page.getByRole('img', { name: 'Alice UI', exact: true });
    await expect(avatar).toBeVisible();
    await expect.poll(() => avatar.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  } finally {
    const restored = await request.put('http://127.0.0.1:8081/user/update', { headers, data: { username: previous.username } });
    expect(restored.ok()).toBeTruthy();
  }
});

test('microphone check releases every acquired stream when the screen changes', async ({ page, request }) => {
  await authenticate(page, request);
  await page.context().grantPermissions(['microphone']);
  await page.addInitScript(() => {
    globalThis.__micTracks = [];
    const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await acquire(constraints);
      globalThis.__micTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.goto('/miccheck');
  const ready = page.getByRole('button', { name: '準備OK!' });
  await expect(ready).toBeEnabled();
  await expect.poll(() => page.evaluate(() => globalThis.__micTracks.filter(track => track.readyState === 'live').length)).toBe(1);
  await ready.click();
  await expect(page.getByRole('heading', { name: 'マイクチェック完了！' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__micTracks.every(track => track.readyState === 'ended'))).toBe(true);
});

test('pages fit narrow and desktop viewports and notifications close with Escape', async ({ page, request }, testInfo) => {
  await authenticate(page, request);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const routes = [
    ['/login', 'サインイン'], ['/signup', 'サインアップ'], ['/home', '直近の参加予定'],
    ['/record', '記録'], ['/sessionlist', '通話'], ['/memo', '持ち込みメモ'],
    ['/settings', '設定'], ['/stats', '参加データ'], ['/conversation_history', '会話の記録'],
    ['/session_history_friendlist', '履歴とフレンド'], ['/sessionfeedback', '会話の記録'], ['/events', 'イベント'], ['/friendrequest', 'フレンド申請'],
  ];
  for (const width of [320, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    for (const [route, title] of routes) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      // DOM views retain nodes and hide inactive branches.
      await expect(page.getByText('読み込み中…', { exact: true })).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (['/login', '/home', '/sessionlist'].includes(route)) {
        await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${width}.png`), fullPage: true });
      }
    }
  }
  await page.goto('/home');
  const trigger = page.getByRole('button', { name: '通知', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: '通知', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});
