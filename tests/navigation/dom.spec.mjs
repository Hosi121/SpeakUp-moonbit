import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 401, json: { error: 'ログインが必要です' } }));
});

test('auth snapshots and a cached page restore preserve the composing input and its selection', async ({ page }) => {
  await page.goto('/signup');
  const input = page.getByLabel('ユーザー名(セッション時の表示名)');
  await input.fill('入力中のユーザー名');
  await input.focus();
  await input.evaluate(node => { window.draftInput = node; node.setSelectionRange(1, 4); });
  await input.dispatchEvent('compositionstart', { data: '入力' });
  // A sibling field publishes a new MoonBit snapshot without moving focus.
  await page.getByLabel('Email', { exact: true }).evaluate(node => {
    node.value = 'alice@example.test'; node.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(input).toBeFocused();
  expect(await input.evaluate(node => ({ same: node === window.draftInput, start: node.selectionStart, end: node.selectionEnd })))
    .toEqual({ same: true, start: 1, end: 4 });
  await expect(input).toHaveValue('入力中のユーザー名');
  await input.dispatchEvent('compositionend', { data: '入力' });
});

test('keyed event refresh preserves the checkbox, focus and unsaved selection', async ({ page }) => {
  let reads = 0;
  const event = id => ({ event: { id, theme_id: 1, event_start: '2026-10-01T09:00:00Z', event_end: '2026-10-01T10:00:00Z',
    theme: { theme_text: `Event ${id}`, topic1: 'Topic', topic2: '', topic3: '' } }, participates_bit: 1, registered_count: 2, matching_state: 'open' });
  await page.route('**/api/events/overview', route => {
    reads++;
    return route.fulfill({ json: reads === 1 ? [event(1), event(2)] : [{ ...event(2), registered_count: 3 }, event(1)] });
  });
  await page.goto('/events');
  const card = page.getByRole('article', { name: 'Event 1', exact: true });
  const second = card.getByLabel('ラウンド 2');
  await second.check();
  await second.focus();
  await second.evaluate(node => { window.roundInput = node; });
  await page.getByRole('button', { name: 'イベント一覧を更新' }).evaluate(node => node.click());
  await expect(page.getByRole('article').first()).toHaveAccessibleName('Event 2');
  await expect(second).toBeChecked();
  await expect(second).toBeFocused();
  expect(await second.evaluate(node => node === window.roundInput)).toBe(true);
  expect(reads).toBe(2);
});

test('production page code and SVG assets load without React', async ({ page }) => {
  const scripts = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('.js')) scripts.push(response.text());
  });
  await page.route('**/api/events/overview', route => route.fulfill({ json: [] }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'サインイン', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.brand-mark img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.getByRole('link', { name: 'サインアップ', exact: true }).evaluate(node => node.href = '/home');
  await page.getByRole('link', { name: 'サインアップ', exact: true }).click();
  await expect(page.getByRole('heading', { name: '直近の参加予定' })).toBeVisible();
  await expect.poll(() => page.locator('.home-brand img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect((await Promise.all(scripts)).join('\n')).not.toMatch(/react\.element|react-dom\.production|react\.production/);
  expect(errors).toEqual([]);
});
