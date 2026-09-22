import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 401, json: { error: 'ログインが必要です' } }));
});

test('links, browser back/forward and direct reload preserve real URLs without reloading the document', async ({ page }) => {
  await page.goto('/login?from=%2Fsession%3Fconversation%3D42');
  await expect(page.getByRole('heading', { name: 'サインイン', exact: true })).toBeVisible();
  const length = await page.evaluate(() => { window.documentMarker = 'same-document'; return history.length; });
  await page.getByRole('link', { name: 'サインアップ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'サインアップ', exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(length + 1);
  await page.goBack();
  await expect(page).toHaveURL(/\/login\?from=%2Fsession%3Fconversation%3D42$/);
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'サインアップ', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.documentMarker)).toBe('same-document');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'サインアップ', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.documentMarker)).toBeUndefined();
});

test('modified clicks, target and download keep native anchor behavior', async ({ page, context }) => {
  await page.goto('/login');
  const signup = page.getByRole('link', { name: 'サインアップ', exact: true });
  const newTab = context.waitForEvent('page');
  await signup.click({ modifiers: ['Control'] });
  const tab = await newTab;
  await expect(tab.getByRole('heading', { name: 'サインアップ', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/); await tab.close();
  await signup.evaluate(link => link.target = '_blank');
  const popup = page.waitForEvent('popup'); await signup.click();
  const child = await popup;
  await expect(child.getByRole('heading', { name: 'サインアップ', exact: true })).toBeVisible();
  await child.close();
  await signup.evaluate(link => { link.removeAttribute('target'); link.download = 'signup.html'; });
  const downloaded = page.waitForEvent('download'); await signup.click();
  expect((await downloaded).suggestedFilename()).toBe('signup.html');
  await expect(page).toHaveURL(/\/login$/);
});

test('fragment navigation keeps form state and browser back updates the URL', async ({ page }) => {
  await page.goto('/login?keep=1');
  const input = page.getByLabel('Email', { exact: true });
  await input.fill('draft@example.test');
  const link = page.getByRole('link', { name: 'サインアップ', exact: true });
  await link.evaluate(node => {
    node.href = '#email';
    const target = document.createElement('span'); target.id = 'email'; node.after(target);
  });
  await link.click();
  await expect(page).toHaveURL(/\/login\?keep=1#email$/);
  await expect(input).toHaveValue('draft@example.test');
  await page.goBack();
  await expect(page).toHaveURL(/\/login\?keep=1$/);
  await expect(input).toHaveValue('draft@example.test');
});

test('redirects replace history, encoded routes work, and unknown paths have a recoverable page', async ({ page }) => {
  await page.route('**/api/conversations', route => route.fulfill({ json: [] }));
  await page.goto('/login');
  await page.goto('/waiting');
  await expect(page).toHaveURL(/\/sessionlist$/);
  await expect(page.getByRole('heading', { name: '通話', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/%6Cogin/');
  await expect(page.getByRole('heading', { name: 'サインイン', exact: true })).toBeVisible();
  await page.goto('/not-a-screen');
  await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
  await page.getByRole('link', { name: 'サインインへ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'サインイン', exact: true })).toBeVisible();
  // The static server can reject malformed escapes before serving the SPA.
  // Exercise an in-app URL change to check the application's decoder too.
  await page.getByRole('link', { name: 'サインアップ', exact: true }).evaluate(link => link.href = '/%E0%A4%A');
  await page.getByRole('link', { name: 'サインアップ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
});

test('query-only navigation and back use the current conversation ID', async ({ page }) => {
  await page.route('**/api/conversations/**', route => route.fulfill({ status: 404, json: {
    error: `Missing ${new URL(route.request().url()).pathname.split('/')[3]}`,
  } }));
  await page.goto('/sessionrecord?conversation=41');
  await expect(page.getByRole('alert')).toHaveText('Missing 41');
  await page.getByRole('link', { name: 'SpeakUp ホーム' }).evaluate(link => link.href = '?conversation=42');
  await page.getByRole('link', { name: 'SpeakUp ホーム' }).click();
  await expect(page.getByRole('alert')).toHaveText('Missing 42');
  await page.goBack();
  await expect(page.getByRole('alert')).toHaveText('Missing 41');
});

test('leaving a microphone screen releases media while the next chunk is pending, and back wins the race', async ({ page }) => {
  await page.context().grantPermissions(['microphone']);
  await page.addInitScript(() => {
    window.acquiredTracks = [];
    const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await acquire(constraints); window.acquiredTracks.push(...stream.getTracks()); return stream;
    };
  });
  await page.route('**/api/events/overview', route => route.fulfill({ json: [] }));
  const requested = Promise.withResolvers(), release = Promise.withResolvers();
  await page.route('**/assets/Home-*.js', async route => {
    requested.resolve(); await release.promise; await route.continue();
  });
  try {
    await page.goto('/miccheck');
    await expect(page.getByRole('button', { name: '準備OK!', exact: true })).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.acquiredTracks.filter(track => track.readyState === 'live').length)).toBe(1);
    await page.getByRole('link', { name: 'SpeakUp ホーム' }).click();
    await requested.promise;
    await expect(page.getByRole('status')).toHaveText('画面を読み込み中…');
    await expect.poll(() => page.evaluate(() => window.acquiredTracks.every(track => track.readyState === 'ended'))).toBe(true);
    await page.goBack();
    await expect(page).toHaveURL(/\/miccheck$/);
    await expect(page.getByRole('button', { name: '準備OK!', exact: true })).toBeEnabled();
    const loaded = page.waitForResponse(response => /\/assets\/Home-.*\.js$/.test(response.url()));
    release.resolve(); await loaded;
    await page.unroute('**/assets/Home-*.js');
    await expect(page.getByRole('heading', { name: 'セッション前にマイクチェックをするよ！' })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { name: '直近の参加予定' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.acquiredTracks.every(track => track.readyState === 'ended'))).toBe(true);
  } finally { release.resolve(); await page.unrouteAll({ behavior: 'wait' }); }
});

test('a failed lazy chunk presents recovery and succeeds after reload', async ({ page }) => {
  await page.route('**/api/memo', route => route.fulfill({ json: { memo1: '保存済み', memo2: '' } }));
  await page.route('**/assets/Memo-*.js', route => route.abort('failed'));
  await page.goto('/memo');
  await expect(page.getByRole('heading', { name: '画面を読み込めませんでした' })).toBeVisible();
  await page.unroute('**/assets/Memo-*.js');
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await expect(page.getByRole('heading', { name: '画面を読み込めませんでした' })).toHaveCount(0);
  await expect(page.getByLabel('持ち込みメモ', { exact: true })).toHaveValue('保存済み');
});
