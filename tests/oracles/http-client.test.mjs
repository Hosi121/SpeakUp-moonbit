import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { EventEmitter, once } from 'node:events';
import { createHttpClient } from '../../contract/frontend/httpClient.ts';
import { ApiError, toApiError } from '../../contract/frontend/errorUtils.ts';

const events = new EventEmitter(),
  seen = [];
let url,
  token = 'first';
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  seen.push({ path: req.url, method: req.method, headers: req.headers, body });
  if (req.url === '/api/slow') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{');
    events.emit('body-started');
    return;
  }
  if (req.url === '/api/disconnect') {
    req.socket.destroy();
    return;
  }
  const errors = {
    '/api/unauthorized': [401, '{"error":"ログインが必要です"}'],
    '/api/bad-message': [
      422,
      '{"message":{},"detail":"入力を確認してください"}',
    ],
    '/api/unavailable': [503, 'temporarily unavailable'],
    '/api/empty-error': [500, ''],
  };
  const failure = errors[req.url];
  if (failure) {
    res
      .writeHead(failure[0], { 'Content-Type': 'application/json' })
      .end(failure[1]);
    return;
  }
  if (req.url === '/api/empty') {
    res.writeHead(204).end();
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end('{"text":"日本語"}');
});
before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/api/`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test('HTTP client preserves base paths, encoded queries, fresh auth and public requests', async () => {
  const send = createHttpClient(url, () => token);
  assert.equal(
    await send('GET', '/users?q=%E6%97%A5%26x%3D1'),
    '{"text":"日本語"}',
  );
  assert.equal(seen.at(-1).path, '/api/users?q=%E6%97%A5%26x%3D1');
  assert.equal(seen.at(-1).headers.authorization, 'Bearer first');
  assert.equal(seen.at(-1).headers['content-type'], undefined);
  token = 'second';
  await send('GET', '/user');
  assert.equal(seen.at(-1).headers.authorization, 'Bearer second');
  await send(
    'POST',
    '/signin',
    { email: '日本語@example.test', password: 'fixture' },
    { authenticated: false },
  );
  assert.equal(seen.at(-1).headers.authorization, undefined);
  assert.equal(seen.at(-1).headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(seen.at(-1).body), {
    email: '日本語@example.test',
    password: 'fixture',
  });
  token = '';
  await send('GET', '/user');
  assert.equal(seen.at(-1).headers.authorization, undefined);
  for (const path of [
    'https://other.test/path',
    '//other.test/path',
    '/\\other.test/path',
  ]) {
    await assert.rejects(send('GET', path), { code: 'ERR_INVALID_URL' });
  }
});

test('multipart bodies keep the browser boundary and empty successes need no JSON parse', async () => {
  const send = createHttpClient(url, () => 'avatar-token');
  const data = new FormData();
  data.append(
    'avatar',
    new File(['image-bytes'], 'avatar.png', { type: 'image/png' }),
  );
  await send('PUT', '/avatar', data);
  const request = seen.at(-1);
  const boundary = request.headers['content-type'].match(
    /^multipart\/form-data; boundary=(.+)$/,
  )?.[1];
  assert.ok(boundary);
  assert.ok(request.body.includes(`--${boundary}`));
  assert.match(request.body, /name="avatar"; filename="avatar.png"/);
  assert.match(request.body, /image-bytes/);
  assert.equal(request.headers.authorization, 'Bearer avatar-token');
  assert.equal(await send('PUT', '/empty', {}), '');
});

test('HTTP failures preserve status, typed messages and payload without retrying writes', async () => {
  const send = createHttpClient(url, () => null);
  for (const [path, status, message] of [
    ['/unauthorized', 401, 'ログインが必要です'],
    ['/bad-message', 422, '入力を確認してください'],
    ['/unavailable', 503, 'temporarily unavailable'],
    ['/empty-error', 500, '通信に失敗しました（500）'],
  ]) {
    const count = seen.length;
    await assert.rejects(send('POST', path, { write: true }), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.equal(error.message, message);
      assert.equal(toApiError(error, 'fallback'), error);
      return true;
    });
    assert.equal(seen.length, count + 1);
  }
});

test('cancellation aborts the response body as well as pending headers', async () => {
  const send = createHttpClient(url, () => null),
    controller = new AbortController();
  const started = once(events, 'body-started');
  const canceled = assert.rejects(
    send('GET', '/slow', undefined, { signal: controller.signal }),
    { code: 'ERR_CANCELED' },
  );
  await started;
  controller.abort();
  await canceled;
  const count = seen.length;
  await assert.rejects(
    send('GET', '/user', undefined, { signal: controller.signal }),
    { code: 'ERR_CANCELED' },
  );
  assert.equal(seen.length, count);
  assert.equal(await send('GET', '/user'), '{"text":"日本語"}');
});

test('network failures retain their cause and never retry a mutation', async () => {
  const send = createHttpClient(url, () => null),
    count = seen.length;
  await assert.rejects(
    send('POST', '/disconnect', { write: true }),
    (error) => {
      assert.equal(error.code, 'ERR_NETWORK');
      assert.ok(error.cause instanceof Error);
      return true;
    },
  );
  assert.equal(seen.length, count + 1);
});
