import { test, expect } from '@playwright/test';

test('a stale initial memo response cannot overwrite an editable draft', async ({
  page,
}) => {
  await page.route('**/api/memo', (route) =>
    route.fulfill({ json: { memo1: '最新のメモ', memo2: '' } }),
  );
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    let first = true;
    const stale = Promise.withResolvers(),
      read = Promise.withResolvers();
    // StrictMode disposes its first effect. Model a response whose completion
    // was already queued at cleanup, so abort alone cannot discard the value.
    window.fetch = (input, options) => {
      if (
        first &&
        typeof input === 'string' &&
        input.endsWith('/api/memo') &&
        options?.method === 'GET'
      ) {
        first = false;
        return stale.promise;
      }
      return originalFetch(input, options);
    };
    window.finishStaleMemo = async () => {
      const response = new Response('{"memo1":"古いメモ","memo2":""}');
      const readText = response.text.bind(response);
      response.text = async () => {
        const text = await readText();
        read.resolve();
        return text;
      };
      stale.resolve(response);
      await read.promise;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    };
  });
  await page.goto('/memo');
  const input = page.getByRole('textbox', {
    name: '持ち込みメモ',
    exact: true,
  });
  await expect(input).toHaveValue('最新のメモ');
  await expect(input).toBeEnabled();
  await input.fill('編集中のメモ');
  await page.evaluate(() => window.finishStaleMemo());
  await expect(input).toHaveValue('編集中のメモ');
});

test('public login reports HTTP errors and refuses an invalid token without replacing stored auth', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/signin', async (route) => {
    calls++;
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({
      status: calls === 1 ? 401 : 200,
      contentType: 'application/json',
      body:
        calls === 1
          ? '{"error":"メールアドレスまたはパスワードを確認してください"}'
          : '{"token":123}',
    });
  });
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('token', 'previous-auth'));
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('パスワード', { exact: true }).fill('fixture');
  await page.getByRole('button', { name: 'サインイン', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'メールアドレスまたはパスワードを確認してください',
  );
  await page.getByRole('button', { name: 'サインイン', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'サインイン', exact: true }),
  ).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe(
    'previous-auth',
  );
  expect(calls).toBe(2);
});

test('leaving during ICE configuration cancels HTTP setup before the microphone is acquired', async ({
  page,
}) => {
  const entered = Promise.withResolvers(),
    release = Promise.withResolvers();
  const canceled = page.waitForEvent('requestfailed', (request) =>
    request.url().endsWith('/api/rtc-config'),
  );
  await page.route('**/api/conversations/42', (route) =>
    route.fulfill({
      json: {
        id: 42,
        event_id: 0,
        round: 0,
        started_at: 0,
        ended_at: 0,
        cancelled_at: 0,
        revision: 0,
        theme: '1 対 1 通話',
        topics: [],
        event_start: '',
        participants: [
          { id: 1, username: 'Alice', avatar_url: '' },
          { id: 2, username: 'Bob', avatar_url: '' },
        ],
      },
    }),
  );
  await page.route('**/api/rtc-config', async (route) => {
    entered.resolve();
    await release.promise;
    await route.fulfill({ json: { iceServers: [] } });
  });
  try {
    await page.goto('/login');
    await page.evaluate(async () => {
      const { startVoiceCall } = await import('/src/services/voiceCall.ts');
      window.setupEvents = [];
      navigator.mediaDevices.getUserMedia = async () => {
        window.setupEvents.push('microphone');
        throw new Error('Unexpected microphone acquisition');
      };
      window.pendingCall = startVoiceCall({
        conversationId: 42,
        audio: document.createElement('audio'),
        onLocal() {},
        onRemote() {},
        onState() {},
        onConnection() {},
        onError() {
          window.setupEvents.push('error');
        },
      });
    });
    await entered.promise;
    await page.evaluate(() => window.pendingCall.stop());
    await canceled;
    expect(await page.evaluate(() => window.setupEvents)).toEqual([]);
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

for (const stage of ['constructor', 'source'])
  test(`audio ${stage} exceptions release all granted resources without an unhandled rejection`, async ({
    page,
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/conversations/42', (route) =>
      route.fulfill({
        json: {
          id: 42,
          event_id: 0,
          round: 0,
          started_at: 0,
          ended_at: 0,
          cancelled_at: 0,
          revision: 0,
          theme: 'Audio cleanup',
          topics: [],
          event_start: '',
          participants: [
            { id: 1, username: 'Alice', avatar_url: '' },
            { id: 2, username: 'Bob', avatar_url: '' },
          ],
        },
      }),
    );
    await page.route('**/api/rtc-config', (route) =>
      route.fulfill({ json: { iceServers: [] } }),
    );
    await page.route('**/api/user/info', (route) =>
      route.fulfill({
        json: {
          id: 1,
          username: 'Alice',
          email: '',
          avatar_url: '',
          role: 'user',
          created_at: '',
          updated_at: '',
        },
      }),
    );
    await page.route('**/api/memo', (route) => route.fulfill({ json: {} }));
    await page.addInitScript((stage) => {
      window.acquiredTracks = [];
      window.closedContexts = 0;
      const acquire = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (options) => {
        const stream = await acquire(options);
        window.acquiredTracks.push(...stream.getTracks());
        return stream;
      };
      const NativeContext = window.AudioContext;
      window.AudioContext =
        stage === 'constructor'
          ? class {
              constructor() {
                throw new Error('audio context fixture failure');
              }
            }
          : class extends NativeContext {
              createMediaStreamSource() {
                throw new Error('audio context fixture failure');
              }
              close() {
                window.closedContexts++;
                return super.close();
              }
            };
    }, stage);
    await page.goto('/session?conversation=42');
    await expect(page.getByRole('alert')).toContainText(
      'audio context fixture failure',
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.acquiredTracks.length > 0 &&
            window.acquiredTracks.every(
              (track) => track.readyState === 'ended',
            ),
        ),
      )
      .toBe(true);
    expect(await page.evaluate(() => window.closedContexts)).toBe(
      stage === 'source' ? 1 : 0,
    );
    expect(errors).toEqual([]);
  });
