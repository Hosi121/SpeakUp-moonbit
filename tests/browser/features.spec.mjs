import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
async function login(browser, request, email) {
  const result = await request.post('http://127.0.0.1:8081/signin', { data: { email, password: 'speakup-local-only' } });
  expect(result.ok()).toBeTruthy();
  const { token } = await result.json();
  const context = await browser.newContext();
  await context.addInitScript(token => localStorage.setItem('token', token), token);
  return { context, page: await context.newPage(), headers: { Authorization: `Bearer ${token}` } };
}

test('friend consent, live private messages and durable unread notifications across pages', async ({ browser, request }) => {
  const db = await mysql.createConnection(process.env.TEST_DATABASE_URL ?? 'mysql://speakup:speakup-local-only@127.0.0.1:3308/speakup_moonbit');
  await db.execute('DELETE FROM friendships WHERE low_user_id=1 AND high_user_id=2');
  const a = await login(browser, request, 'alice@example.test');
  const b = await login(browser, request, 'bob@example.test');
  const errors = [];
  for (const user of [a, b]) user.page.on('pageerror', e => errors.push(e.message));
  try {
    await b.page.goto('/friendrequest');
    await a.page.goto('/friendrequest');
    await a.page.getByLabel('ユーザー名で検索').fill('Bob');
    await a.page.getByRole('button', { name: '検索', exact: true }).click();
    const candidate = a.page.getByRole('article').filter({ has: a.page.getByText('Bob', { exact: true }) });
    await candidate.getByRole('button', { name: 'フレンド申請', exact: true }).click();
    const received = b.page.getByRole('region', { name: '届いた申請' }).getByRole('article').filter({ hasText: 'Alice' });
    await expect(received).toBeVisible(); // No page refresh: activity WebSocket drives the query.
    await expect(a.page.getByRole('region', { name: '送った申請' })).toContainText('Bob');
    await received.getByRole('button', { name: '承認', exact: true }).click();
    await expect(a.page.getByRole('link', { name: 'メッセージ', exact: true })).toBeVisible();
    await a.page.getByRole('link', { name: 'メッセージ', exact: true }).click();
    await b.page.goto('/message/1');
    const content = `保存と配信 ${randomUUID()} <b>文字列</b>`;
    await a.page.getByLabel('メッセージを入力').fill(content);
    await a.page.getByLabel('メッセージを入力').press('Enter');
    for (const user of [a, b]) await expect(user.page.getByRole('log')).toContainText(content);
    await b.page.reload();
    await expect(b.page.getByRole('log')).toContainText(content);
    // Read the existing fixture notifications before mounting the home page.
    // Only the next message can then make its unread button appear.
    const baseline = await request.put('http://127.0.0.1:8081/notifications/read', { headers: b.headers, data: { through_id: 2147483647 } });
    expect(baseline.ok()).toBeTruthy();
    expect((await baseline.json()).unread).toBe(0);
    await b.page.goto('/home');
    await b.page.getByRole('button', { name: '通知', exact: true }).click();
    const dialog = b.page.getByRole('dialog', { name: '通知', exact: true });
    const markRead = dialog.getByRole('button', { name: '表示した通知まで既読にする' });
    await expect(markRead).toHaveCount(0);
    const second = `通知 ${randomUUID()}`;
    await a.page.getByLabel('メッセージを入力').fill(second);
    await a.page.getByRole('button', { name: '送信', exact: true }).click();
    await expect(a.page.getByRole('log')).toContainText(second);
    await expect(markRead).toBeVisible();
    await expect(dialog).toContainText('新しいメッセージがあります');
    await markRead.click();
    await expect(markRead).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await a.context.close(); await b.context.close(); await db.end(); }
});

test('event participation and admin matching show actual roster and assigned rounds', async ({ browser, request }) => {
  const a = await login(browser, request, 'alice@example.test');
  const b = await login(browser, request, 'bob@example.test');
  const theme = `画面でマッチング ${randomUUID()}`;
  try {
    const created = await request.post('http://127.0.0.1:8081/events', { headers: a.headers, data: { event_start: new Date(Date.now() + 3600000).toISOString(), theme, topics: ['参加するラウンド'] } });
    expect(created.ok()).toBeTruthy();
    for (const user of [a, b]) {
      await user.page.goto('/events');
      const card = user.page.getByRole('article', { name: theme, exact: true });
      await card.getByRole('checkbox', { name: 'ラウンド 1', exact: true }).check();
      await card.getByRole('button', { name: '参加予定を保存', exact: true }).click();
      await expect(card.getByRole('status')).toHaveText('参加予定を保存しました。');
    }
    await a.page.goto('/admin');
    const admin = a.page.getByRole('article', { name: theme, exact: true });
    await admin.getByRole('button', { name: '参加者を確認', exact: true }).click();
    await expect(admin).toContainText('Alice'); await expect(admin).toContainText('Bob');
    await admin.getByRole('button', { name: 'マッチングする', exact: true }).click();
    await admin.getByRole('button', { name: '確定して公開', exact: true }).click();
    await expect(admin).toContainText('相手を公開済み');
    await expect(admin.getByRole('listitem')).toHaveText(['Alice：R1 相手決定', 'Bob：R1 相手決定']);
    await b.page.goto('/events');
    await expect(b.page.getByRole('article', { name: theme, exact: true }).getByRole('checkbox').first()).toBeDisabled();
    await b.page.goto('/sessionlist');
    await expect(b.page.getByRole('article').filter({ hasText: theme })).toContainText('相手：Alice');
  } finally { await a.context.close(); await b.context.close(); }
});

test('survey reloads privately and statistics reflect completed conversations', async ({ browser, request }) => {
  const a = await login(browser, request, 'alice@example.test');
  const b = await login(browser, request, 'bob@example.test');
  const db = await mysql.createConnection(process.env.TEST_DATABASE_URL ?? 'mysql://speakup:speakup-local-only@127.0.0.1:3308/speakup_moonbit');
  try {
    const created = await request.post('http://127.0.0.1:8081/conversations/direct', { headers: a.headers, data: { target_user_id: 2, request_id: randomUUID() } });
    const { id } = await created.json();
    const start = Date.now() - 120000;
    await db.execute('UPDATE conversations SET started_at=?,ended_at=?,revision=2 WHERE id=?', [start, start + 60000, id]);
    await a.page.goto(`/sessionfeedback?conversation=${id}`);
    await a.page.getByRole('radio', { name: 'すごく楽しかった', exact: true }).check();
    await a.page.getByRole('button', { name: '回答を保存', exact: true }).click();
    await expect(a.page.getByRole('status')).toHaveText('保存済みです。');
    await a.page.reload();
    await expect(a.page.getByRole('radio', { name: 'すごく楽しかった', exact: true })).toBeChecked();
    const other = await request.get(`http://127.0.0.1:8081/conversations/${id}/learning`, { headers: b.headers });
    expect((await other.json()).answers).toEqual([]);
    await a.page.goto(`/sessionrecord?conversation=${id}`);
    await a.page.getByLabel('感想', { exact: true }).fill('保存してからアドバイスを依頼します');
    await a.page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(a.page.getByRole('button', { name: '保存した内容を送ってアドバイスを作る' })).toBeEnabled();
    const stats = await (await request.get('http://127.0.0.1:8081/stats', { headers: a.headers })).json();
    await a.page.goto('/stats');
    await expect(a.page.locator('dl').getByText(String(stats.total_calls), { exact: true }).first()).toBeVisible();
    await expect(a.page.getByRole('listitem').filter({ hasText: 'はじめての会話' })).toContainText('達成済み');
  } finally { await db.end(); await a.context.close(); await b.context.close(); }
});
