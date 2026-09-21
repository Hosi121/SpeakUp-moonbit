import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';

// Only the disposable, seeded port database. No source application secrets.
const base = 'http://127.0.0.1:18081';
const origin = 'http://localhost:5173';
let child, logs = '', alice, bob;
async function request(path, token, method = 'GET', payload) {
  const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}
async function login(email) {
  const r = await request('/signin', undefined, 'POST', { email, password: 'speakup-local-only' });
  assert.equal(r.status, 200, JSON.stringify(r)); return r.body.token;
}
before(async () => {
  child = spawn(process.execPath, ['server/main.ts'], { env: { ...process.env,
    AUTH_MODE: 'development', DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://speakup:speakup-local-only@127.0.0.1:3308/speakup_moonbit', PORT: '18081', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
  await Promise.race([
    (async () => { for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/health'); if (r.ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); } throw new Error(logs); })(),
    once(child, 'exit').then(([code]) => { throw new Error(`server exited ${code}: ${logs}`); }),
  ]);
  alice = await login('alice@example.test'); bob = await login('bob@example.test');
});
after(async () => { child?.kill('SIGTERM'); if (child && child.exitCode === null) await once(child, 'exit'); });

test('authentication, memo isolation and concurrent upsert', async () => {
  assert.equal((await request('/memo')).status, 401);
  assert.equal((await request('/memo', 'invalid')).status, 401);
  assert.equal((await request('/signin', undefined, 'POST', { email: 'alice@example.test', password: 'bad' })).status, 401);
  const value = { memo1: 'MoonBit 日本語', memo2: '🌓' };
  const writes = await Promise.all(Array.from({ length: 10 }, () => request('/memo', alice, 'PUT', value)));
  assert.ok(writes.every(r => r.status === 200 && r.body.memo1 === value.memo1));
  assert.deepEqual((await request('/memo', alice)).body, value);
  assert.notDeepEqual((await request('/memo', bob)).body, value);
  assert.equal((await request('/memo', alice, 'PUT', { memo1: 123 })).status, 400);
});
test('event transaction, admin restriction, timezone, profile and persistent friends', async () => {
  const input = { event_start: '2026-09-22T09:00:00+09:00', theme: '旅行', topics: ['東京', '京都'] };
  assert.equal((await request('/events', bob, 'POST', input)).status, 403);
  const event = await request('/events', alice, 'POST', input);
  assert.equal(event.status, 200, JSON.stringify(event));
  assert.equal(event.body.event_start, '2026-09-22T00:00:00Z');
  assert.equal(event.body.event_end, '2026-09-22T00:30:00Z');
  assert.equal(event.body.theme.topic3, '');
  assert.ok((await request('/events', alice)).body.some(e => e.id === event.body.id));
  for (const time of ['2026-02-30T10:00:00', '2026-09-22', '']) assert.equal((await request('/events', alice, 'POST', { ...input, event_start: time })).status, 400);
  assert.equal((await request('/friend/register', alice, 'POST', { target_user_id: 2 })).status, 200);
  assert.ok((await request('/friend/me', alice)).body.friends.some(f => f.id === 2));
  assert.equal((await request('/friend/register', alice, 'POST', { target_user_id: 1 })).status, 400);
  assert.equal((await request('/users/search?q=Bob', alice)).body[0].username, 'Bob');
  assert.equal((await request('/users/search/id/nope', alice)).status, 400);
  assert.equal((await request('/user/info', bob)).body.id, 2);
  assert.equal((await request('/rtc-config', alice)).body.iceServers.length, 1);
  assert.equal((await request('/chat/ask', alice, 'POST', { content: 'hello' })).status, 503);
});
test('HTTP limits and invalid JSON', async () => {
  for (const [body, status] of [['{', 400], ['null', 400], ['x'.repeat(70000), 413]]) {
    const r = await fetch(base + '/memo', { method: 'PUT', headers: { Authorization: `Bearer ${alice}` }, body });
    assert.equal(r.status, status);
  }
});
test('matching snapshots participants, publishes rooms atomically and rejects duplicate runs', async () => {
  const event = await request('/events', alice, 'POST', { event_start: '2026-09-22T01:00:00Z', theme: 'Matching', topics: [] });
  const id = event.body.id;
  assert.equal(event.status, 200);
  for (const token of [alice, bob]) assert.equal((await request(`/events/${id}/register`, token, 'POST', { participates_bit: 7 })).status, 200);
  assert.equal((await request(`/events/${id}/match`, bob, 'POST', {})).status, 403);
  const result = await request(`/events/${id}/match`, alice, 'POST', {});
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.body.length, 3);
  assert.ok(result.body.every(p => p.user_a !== p.user_b));
  assert.equal((await request(`/events/${id}/match`, alice, 'POST', {})).status, 409);
  assert.equal((await request(`/events/${id}/register`, bob, 'POST', { participates_bit: 1 })).status, 409);
});
function connect() {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws', { origin });
  const queue = []; const waiters = [];
  ws.on('message', raw => { const v = JSON.parse(raw.toString()); if (waiters.length) waiters.shift()(v); else queue.push(v); });
  return { ws, next: () => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`message timeout: ${logs}`)), 3000);
    waiters.push(value => { clearTimeout(timer); resolve(value); });
  }) };
}
test('real websocket authorization, relay, room isolation, disconnect and reconnect', async () => {
  const a = connect(), b = connect();
  try {
    await Promise.all([once(a.ws, 'open'), once(b.ws, 'open')]);
    a.ws.send(JSON.stringify({ type: 'Authorization', token: `Bearer ${alice}`, room: 1 }));
    assert.equal((await a.next()).type, 'waiting');
    b.ws.send(JSON.stringify({ type: 'Authorization', token: `Bearer ${bob}`, room: 1 }));
    assert.equal((await a.next()).isOffer, false); assert.equal((await b.next()).isOffer, true);
    const offer = { type: 'offer', offer: { type: 'offer', sdp: 'v=0\r\n' } };
    b.ws.send(JSON.stringify(offer)); assert.deepEqual(await a.next(), offer);
    const answer = { type: 'answer', answer: { type: 'answer', sdp: 'v=0\r\n' } };
    a.ws.send(JSON.stringify(answer)); assert.deepEqual(await b.next(), answer);
    const ice = { type: 'ice-candidate', candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9999 typ host', sdpMid: '0', sdpMLineIndex: 0 } };
    b.ws.send(JSON.stringify(ice)); assert.deepEqual(await a.next(), ice);
    b.ws.close(); await once(b.ws, 'close'); assert.equal((await a.next()).type, 'peer-left');
    const c = connect();
    try { await once(c.ws, 'open'); c.ws.send(JSON.stringify({ type: 'Authorization', token: `Bearer ${bob}`, room: 1 })); assert.equal((await c.next()).isOffer, true); assert.equal((await a.next()).isOffer, false); }
    finally { c.ws.terminate(); }
  } finally { a.ws.terminate(); b.ws.terminate(); }
});
test('unauthorized, oversized and nonexistent-room sockets close without crashing server', async () => {
  for (const message of [ { type: 'offer' }, { type: 'Authorization', token: 'x', room: 1 }, { type: 'Authorization', token: `Bearer ${bob}`, room: 999999 }, 'x'.repeat(65537) ]) {
    const c = connect();
    await once(c.ws, 'open');
    const closed = once(c.ws, 'close');
    c.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    const [code] = await closed;
    assert.ok([1008, 1009].includes(code));
  }
  assert.equal((await request('/health')).status, 200);
});
