import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 401, json: { error: 'ログインが必要です' } }));
  await page.routeWebSocket('**/activity', socket => {
    socket.onMessage(() => socket.send('{"type":"refresh"}'));
  });
});

for (const signup of [false, true]) {
  test(`${signup ? 'signup' : 'login'} stays editable while auth loads and sends exactly once after its decoder is ready`, async ({ page }) => {
    const requested = Promise.withResolvers(), release = Promise.withResolvers();
    let chunks = 0, calls = 0;
    await page.route('**/assets/authService-*.js', async route => {
      chunks++; requested.resolve(); await release.promise; await route.continue();
    });
    await page.route(`**/api/${signup ? 'signup' : 'signin'}`, async route => {
      calls++;
      expect(route.request().headers().authorization).toBeUndefined();
      expect(route.request().postDataJSON()).toEqual({
        ...(signup ? { username: 'Alice' } : {}), email: 'alice@example.test', password: 'fixture-password',
      });
      await route.fulfill({ json: signup ? { success: true, message: '登録しました' } : { token: 'fixture-token' } });
    });
    await page.route('**/api/events/overview', route => route.fulfill({ json: [] }));
    try {
      await page.goto(signup ? '/signup' : '/login');
      await expect(page.getByRole('heading', { name: signup ? 'サインアップ' : 'サインイン', exact: true })).toBeVisible();
      expect(chunks).toBe(0);
      await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
      await requested.promise;
      if (signup) await page.getByLabel('ユーザー名(セッション時の表示名)').fill('Alice');
      await page.getByLabel('パスワード', { exact: true }).fill('fixture-password');
      await expect(page.getByLabel('Email', { exact: true })).toHaveValue('alice@example.test');
      const submit = page.getByRole('button', { name: signup ? 'メールを送信して仮登録' : 'サインイン', exact: true });
      await submit.click();
      await expect(page.locator('button[type=submit]')).toBeDisabled();
      expect(calls).toBe(0);
      release.resolve();
      await expect(page.getByRole('heading', { name: signup ? 'サインイン' : '直近の参加予定', exact: true })).toBeVisible();
      expect(chunks).toBe(1); expect(calls).toBe(1);
      expect(await page.evaluate(() => localStorage.getItem('token'))).toBe(signup ? null : 'fixture-token');
    } finally { release.resolve(); await page.unrouteAll({ behavior: 'wait' }); }
  });

  test(`leaving ${signup ? 'signup' : 'login'} during code loading does not submit the abandoned form`, async ({ page }) => {
    const requested = Promise.withResolvers(), release = Promise.withResolvers();
    let calls = 0;
    await page.route('**/assets/authService-*.js', async route => {
      requested.resolve(route.request().url()); await release.promise; await route.continue();
    });
    await page.route(`**/api/${signup ? 'signup' : 'signin'}`, route => {
      calls++; return route.fulfill({ status: 500, json: { error: 'Unexpected submission' } });
    });
    try {
      await page.goto(signup ? '/signup' : '/login');
      await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
      const moduleUrl = await requested.promise;
      if (signup) await page.getByLabel('ユーザー名(セッション時の表示名)').fill('Alice');
      await page.getByLabel('パスワード', { exact: true }).fill('fixture-password');
      await page.getByRole('button', { name: signup ? 'メールを送信して仮登録' : 'サインイン', exact: true }).click();
      await page.getByRole('link', { name: signup ? 'ログインページに戻る' : 'サインアップ', exact: true }).click();
      await expect(page.getByRole('heading', { name: signup ? 'サインイン' : 'サインアップ', exact: true })).toBeVisible();
      release.resolve();
      await page.evaluate(async url => {
        await import(url);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }, moduleUrl);
      expect(calls).toBe(0);
      expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
    } finally { release.resolve(); await page.unrouteAll({ behavior: 'wait' }); }
  });
}

test('a failed auth preload is handled and cannot send a registration; reload recovers', async ({ page }) => {
  const errors = [], failed = Promise.withResolvers();
  let calls = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/assets/authService-*.js', async route => { await route.abort('failed'); failed.resolve(); });
  await page.route('**/api/signup', async route => {
    calls++; await route.fulfill({ json: { success: true, message: '登録しました' } });
  });
  const fill = async () => {
    await page.getByLabel('ユーザー名(セッション時の表示名)').fill('Alice');
    await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
    await page.getByLabel('パスワード', { exact: true }).fill('fixture-password');
  };
  await page.goto('/signup');
  await fill(); await failed.promise;
  await page.getByRole('button', { name: 'メールを送信して仮登録' }).click();
  await expect(page.getByRole('alert')).toContainText('ページを再読み込み');
  await expect(page.getByRole('button', { name: 'メールを送信して仮登録' })).toBeEnabled();
  expect(calls).toBe(0); expect(errors).toEqual([]);
  await page.unroute('**/assets/authService-*.js');
  await page.reload(); await fill();
  await page.getByRole('button', { name: 'メールを送信して仮登録' }).click();
  await expect(page.getByRole('heading', { name: 'サインイン', exact: true })).toBeVisible();
  expect(calls).toBe(1); expect(errors).toEqual([]);
});

test('logout during notification code loading cannot start a stale inbox request', async ({ page }) => {
  const requested = Promise.withResolvers(), release = Promise.withResolvers();
  let calls = 0;
  await page.addInitScript(() => localStorage.setItem('token', 'previous-auth'));
  await page.route('**/assets/features-*.js', async route => {
    requested.resolve(route.request().url()); await release.promise; await route.continue();
  });
  await page.route('**/api/notifications', route => {
    calls++; return route.fulfill({ status: 401, json: { error: 'ログインが必要です' } });
  });
  try {
    await page.goto('/login');
    const moduleUrl = await requested.promise;
    await page.evaluate(() => localStorage.removeItem('token'));
    await page.getByRole('link', { name: 'サインアップ', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'サインアップ', exact: true })).toBeVisible();
    release.resolve();
    await page.evaluate(async url => {
      await import(url);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }, moduleUrl);
    expect(calls).toBe(0);
  } finally { release.resolve(); await page.unrouteAll({ behavior: 'wait' }); }
});
