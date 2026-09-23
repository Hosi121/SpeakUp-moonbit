import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once, EventEmitter } from 'node:events';
import { createTextTransport } from '../frontend/src/services/transport.ts';
import { httpErrorMessage } from '../dist/presenter.js';
const requests = [],
  events = new EventEmitter();
let base;
const server = createServer(async (req, res) => {
  let body = '';
  for await (const part of req) body += part;
  requests.push({
    url: req.url,
    headers: req.headers,
    body,
    method: req.method,
  });
  if (req.url.endsWith('/slow')) {
    res.writeHead(200);
    res.write('{');
    events.emit('body');
    return;
  }
  if (req.url.endsWith('/disconnect')) {
    req.socket.destroy();
    return;
  }
  const failure = {
    '/api/error': [422, '{"error":"入力を確認してください"}'],
    '/api/unauthorized': [401, '{"error":"ログインが必要です"}'],
    '/api/bad-message': [422, '{"message":{},"detail":"入力を確認してください"}'],
    '/api/unavailable': [503, 'temporarily unavailable'],
    '/api/empty-error': [500, ''],
  }[req.url];
  if (failure) {
    res.writeHead(failure[0]).end(failure[1]);
    return;
  }
  if (req.url.endsWith('/empty')) {
    res.writeHead(204).end();
    return;
  }
  res.end('{"value":"日本語"}');
});
before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
function request(send, method, path, body, auth = true) {
  const done = Promise.withResolvers();
  const abort = send(method, path, body, auth, (status, text, failed) =>
    done.resolve({ status, text, failed }),
  );
  return { result: done.promise, abort };
}
test('new browser transport preserves encoded URLs, fresh authorization, public requests and one body read', async () => {
  let token = 'first';
  const send = createTextTransport(base, () => token);
  const first = await request(send, 'GET', '/users?q=%E6%97%A5%26x%3D1').result;
  assert.deepEqual(first, {
    status: 200,
    text: '{"value":"日本語"}',
    failed: false,
  });
  assert.equal(requests.at(-1).url, '/api/users?q=%E6%97%A5%26x%3D1');
  assert.equal(requests.at(-1).headers.authorization, 'Bearer first');
  assert.equal(requests.at(-1).headers['content-type'], undefined);
  token = 'second';
  await request(send, 'GET', '/user').result;
  assert.equal(requests.at(-1).headers.authorization, 'Bearer second');
  const body = '{"email":"日本語@example.test"}';
  await request(send, 'POST', '/signin', body, false).result;
  assert.equal(requests.at(-1).headers.authorization, undefined);
  assert.equal(requests.at(-1).body, body);
  assert.equal(requests.at(-1).headers['content-type'], 'application/json');
  token = '';
  await request(send, 'GET', '/user').result;
  assert.equal(requests.at(-1).headers.authorization, undefined);
  const count = requests.length;
  for (const path of ['https://other.test/', '//other.test/', '/\\other.test/'])
    assert.equal((await request(send, 'GET', path).result).failed, true);
  assert.equal(requests.length, count);
});
test('new multipart transport lets the browser provide boundary and accepts empty responses', async () => {
  const send = createTextTransport(base, () => 'avatar'),
    body = new FormData();
  body.append(
    'avatar',
    new File(['bytes'], 'avatar.png', { type: 'image/png' }),
  );
  await request(send, 'PUT', '/avatar', body).result;
  const received = requests.at(-1);
  const boundary = received.headers['content-type'].match(/boundary=(.+)$/)[1];
  assert.ok(received.body.includes(`--${boundary}`));
  assert.match(received.body, /filename="avatar.png"/);
  assert.equal(received.headers.authorization, 'Bearer avatar');
  assert.deepEqual(await request(send, 'PUT', '/empty', '{}').result, {
    status: 204,
    text: '',
    failed: false,
  });
});
test('new transport returns status and unchanged error text for MoonBit without retrying writes', async () => {
  const send = createTextTransport(base, () => null);
  for (const [path, status, message] of [
    ['/error', 422, '入力を確認してください'],
    ['/unauthorized', 401, 'ログインが必要です'],
    ['/bad-message', 422, '入力を確認してください'],
    ['/unavailable', 503, 'temporarily unavailable'],
    ['/empty-error', 500, '通信に失敗しました（500）'],
  ]) {
    const before = requests.length;
    const response = await request(send, 'POST', path, '{}').result;
    assert.equal(response.status, status);
    assert.equal(response.failed, false);
    assert.equal(httpErrorMessage(response.status, response.text), message);
    assert.equal(requests.length, before + 1);
  }
});
test('new cancellation covers pending headers and body consumption', async () => {
  const send = createTextTransport(base, () => null),
    started = once(events, 'body');
  const pending = request(send, 'GET', '/slow');
  await started;
  pending.abort();
  assert.equal((await pending.result).failed, true);
  const immediate = request(send, 'GET', '/user');
  immediate.abort();
  assert.equal((await immediate.result).failed, true);
});
test('new transport reports a disconnect once without retrying mutations', async () => {
  const send = createTextTransport(base, () => null),
    count = requests.filter((r) => r.url.endsWith('/disconnect')).length;
  assert.deepEqual(await request(send, 'POST', '/disconnect', '{}').result, {
    status: 0,
    text: '',
    failed: true,
  });
  assert.equal(
    requests.filter((r) => r.url.endsWith('/disconnect')).length,
    count + 1,
  );
});
