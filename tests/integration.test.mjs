import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import mysql from 'mysql2/promise';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';
const testKeys = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
import { nativeEnv, nativeExecutable } from '../scripts/native-env.mjs';
const native = process.env.SERVER_RUNTIME === 'native';
const serverExecutable = process.env.TEST_NATIVE_EXECUTABLE ?? nativeExecutable;

// Only the disposable, seeded port database. No source application secrets.
const base = 'http://127.0.0.1:18081';
const origin = 'http://localhost:5173';
let child, logs = '', alice, bob, outsiderId, database;
async function request(path, token, method = 'GET', payload) {
  const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}
async function login(email) {
  const r = await request('/signin', undefined, 'POST', { email, password: 'speakup-local-only' });
  assert.equal(r.status, 200, JSON.stringify(r)); return r.body.token;
}
before(async () => {
  database = await mysql.createConnection(process.env.TEST_DATABASE_URL ?? 'mysql://speakup:speakup-local-only@127.0.0.1:3308/speakup_moonbit');
  const [user] = await database.execute("INSERT INTO users(username,email) VALUES('Outside',?)", [`outside-${randomUUID()}@example.test`]);
  outsiderId = user.insertId;
  child = spawn(native ? serverExecutable : process.execPath, native ? [] : ['server/main.ts'], { env: { ...(native ? nativeEnv() : process.env),
    AUTH_MODE: 'development', JWT_PRIVATE_KEY: testKeys.privateKey, JWT_PUBLIC_KEY: testKeys.publicKey, DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://speakup:speakup-local-only@127.0.0.1:3308/speakup_moonbit', PORT: '18081', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
  await Promise.race([
    (async () => { for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/health'); if (r.ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); } throw new Error(logs); })(),
    once(child, 'exit').then(([code]) => { throw new Error(`server exited ${code}: ${logs}`); }),
  ]);
  alice = await login('alice@example.test'); bob = await login('bob@example.test');
});
after(async () => { child?.kill('SIGTERM'); if (child && child.exitCode === null) await once(child, 'exit'); await database?.end(); assert.doesNotMatch(logs, /ERROR: AddressSanitizer|runtime error:/); });

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
  assert.equal((await request('/friends/1/accept', bob, 'POST', {})).status, 200);
  assert.ok((await request('/friend/me', alice)).body.friends.some(f => f.id === 2));
  assert.equal((await request('/friend/register', alice, 'POST', { target_user_id: 1 })).status, 400);
  assert.equal((await request('/users/search?q=Bob', alice)).body[0].username, 'Bob');
  assert.equal((await request('/users/search/id/nope', alice)).status, 400);
  for (const id of ['1.5', '1e0', '01', '2147483648']) assert.equal((await request(`/conversations/${id}`, alice)).status, 400);
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
  const empty = await request('/events', alice, 'POST', { event_start: '2026-09-22T01:00:00Z', theme: 'Empty', topics: [] });
  const attempts = await Promise.all(Array.from({ length: 4 }, () => request(`/events/${empty.body.id}/match`, alice, 'POST', {})));
  assert.deepEqual(attempts.map(result => result.status).sort(), [200, 409, 409, 409]);
  assert.deepEqual(attempts.find(result => result.status === 200).body, []);
  const [members] = await database.execute('SELECT conversation_id,seat FROM conversation_members WHERE event_id=? AND round_no=1 ORDER BY seat', [id]);
  const [another] = await database.execute('INSERT INTO conversations(event_id,round_no) VALUES(?,1)', [id]);
  try {
    // A participant cannot occupy seat 1 elsewhere after being put in seat 0.
    await assert.rejects(database.execute('INSERT INTO conversation_members(conversation_id,event_id,round_no,user_id,seat) VALUES(?,?,1,1,1)', [another.insertId, id]), { code: 'ER_DUP_ENTRY' });
    assert.equal(members.length, 2);
  } finally { await database.execute('DELETE FROM conversations WHERE id=?', [another.insertId]); }
});
function connect() {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws', { origin });
  const queue = []; const waiters = []; const seen = [];
  ws.on('message', raw => { const v = JSON.parse(raw.toString()); seen.push([v.type, v.value?.revision, v.error]); if (waiters.length) waiters.shift()(v); else queue.push(v); });
  const nextRaw = () => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`message timeout (socket ${ws.readyState}, seen ${JSON.stringify(seen)}): ${logs}`)), 3000);
    waiters.push(value => { clearTimeout(timer); resolve(value); });
  });
  return { ws, next: async (predicate = value => value.type !== 'conversation') => {
    for (;;) { const value = await nextRaw(); if (predicate(value)) return value; }
  } };
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

async function direct(token = alice, target = 2, key = randomUUID()) {
  const result = await request('/conversations/direct', token, 'POST', { target_user_id: target, request_id: key });
  assert.equal(result.status, 200, JSON.stringify(result));
  return result.body;
}
async function negotiate(id) {
  const a = connect(), b = connect();
  try {
    await Promise.all([once(a.ws, 'open'), once(b.ws, 'open')]);
    a.ws.send(JSON.stringify({ type: 'Authorization', token: `Bearer ${alice}`, room: id }));
    assert.equal((await a.next()).type, 'waiting');
    b.ws.send(JSON.stringify({ type: 'Authorization', token: `Bearer ${bob}`, room: id }));
    assert.equal((await a.next()).type, 'callType'); assert.equal((await b.next()).type, 'callType');
    b.ws.send(JSON.stringify({ type: 'offer', offer: { type: 'offer', sdp: 'v=0\r\n' } })); await a.next();
    a.ws.send(JSON.stringify({ type: 'answer', answer: { type: 'answer', sdp: 'v=0\r\n' } })); await b.next();
    return [a, b];
  } catch (error) { a.ws.terminate(); b.ws.terminate(); throw error; }
}

test('direct invitations retry atomically and cannot expose another pair', async () => {
  const key = randomUUID();
  const attempts = await Promise.all(Array.from({ length: 8 }, () => direct(alice, 2, key)));
  assert.equal(new Set(attempts.map(value => value.id)).size, 1);
  assert.equal(attempts[0].event_id, 0); assert.equal(attempts[0].round, 0);
  assert.deepEqual(attempts[0].participants.map(user => user.id), [1, 2]);
  assert.equal((await request('/conversations/direct', alice, 'POST', { target_user_id: outsiderId, request_id: key })).status, 409);
  assert.equal((await request('/conversations/direct', alice, 'POST', { target_user_id: 1, request_id: randomUUID() })).status, 400);
  const other = await direct(bob, outsiderId);
  for (const [path, verb] of [[`/conversations/${other.id}`, 'GET'], [`/conversations/${other.id}/finish`, 'POST'], [`/conversations/${other.id}/reflection`, 'GET']]) {
    assert.equal((await request(path, alice, verb, verb === 'POST' ? {} : undefined)).status, 404);
  }
  assert.ok(!(await request('/conversations', alice)).body.some(value => value.id === other.id));
  const stranger = connect();
  try {
    await once(stranger.ws, 'open');
    const closed = once(stranger.ws, 'close');
    stranger.ws.send(JSON.stringify({ type: 'Authorization', token: `Bearer ${alice}`, room: other.id }));
    assert.equal((await closed)[0], 1008);
  } finally { stranger.ws.terminate(); }
});

test('both media acknowledgements begin once; concurrent finish is stable and reflections remain private', async () => {
  const call = await direct();
  assert.equal((await request(`/conversations/${call.id}/finish`, alice, 'POST', {})).status, 409);
  assert.equal((await request(`/conversations/${call.id}/start`, alice, 'POST', {})).status, 405);
  assert.equal((await request(`/conversations/%31/start`, alice, 'POST', {})).status, 405);
  assert.equal((await request(`/conversations/${call.id}/reflection`, alice, 'PUT', { satisfaction: 50 })).status, 409);
  const [a, b] = await negotiate(call.id);
  try {
    a.ws.send('{ "type" : "media-ready" }');
    // A relay behind the acknowledgement forms a deterministic processing barrier.
    a.ws.send(JSON.stringify({ type: 'ice-candidate', candidate: { candidate: 'barrier' } }));
    await b.next();
    assert.equal((await request(`/conversations/${call.id}`, alice)).body.started_at, 0);
    b.ws.send('{"type":"media-ready"}');
    const started = (await a.next(value => value.type === 'conversation' && value.value.started_at > 0)).value;
    const other = (await b.next(value => value.type === 'conversation' && value.value.started_at > 0)).value;
    assert.deepEqual(started, other); // The snapshot has no viewer-specific partner field.
    assert.equal(started.revision, 1);
    a.ws.send('{"type":"media-ready"}'); b.ws.send('{"type":"media-ready"}');
    assert.equal((await request(`/conversations/${call.id}/cancel`, alice, 'POST', {})).status, 409);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => request(`/conversations/${call.id}/finish`, i % 2 ? alice : bob, 'POST', {})));
    assert.ok(results.every(value => value.status === 200), JSON.stringify(results));
    assert.equal(new Set(results.map(value => value.body.ended_at)).size, 1);
    const ended = results[0].body;
    assert.equal(ended.started_at, started.started_at); assert.equal(ended.revision, 2);
    assert.equal((await a.next(value => value.type === 'conversation' && value.value.ended_at > 0)).value.ended_at, ended.ended_at);
    const note = { satisfaction: 82, comment: '本人の記録', learned_expressions: '日本語と English' };
    const writes = await Promise.all(Array.from({ length: 6 }, () => request(`/conversations/${call.id}/reflection`, alice, 'PUT', note)));
    assert.ok(writes.every(value => value.status === 200));
    assert.equal((await request(`/conversations/${call.id}/reflection`, alice)).body.comment, note.comment);
    assert.equal((await request(`/conversations/${call.id}/reflection`, bob)).body.saved, false);
    assert.equal((await request(`/conversations/${call.id}/reflection`, alice, 'PUT', { ...note, satisfaction: 101 })).status, 400);
    assert.ok((await request('/conversations/history', alice)).body.some(value => value.id === call.id));
    assert.ok(!(await request('/conversations', alice)).body.some(value => value.id === call.id));
    const [count] = await database.execute('SELECT COUNT(*) AS count FROM conversation_reflections WHERE conversation_id=? AND user_id=1', [call.id]);
    assert.equal(count[0].count, 1);
    const returning = connect();
    try {
      await once(returning.ws, 'open'); const closed = once(returning.ws, 'close');
      returning.ws.send(JSON.stringify({ type: 'Authorization', token: `Bearer ${alice}`, room: call.id }));
      assert.equal((await closed)[0], 1008);
    } finally { returning.ws.terminate(); }
  } finally { a.ws.terminate(); b.ws.terminate(); }
});

test('cancelling a pending invitation is idempotent and creates no learning history', async () => {
  const call = await direct();
  const first = await request(`/conversations/${call.id}/cancel`, bob, 'POST', {});
  const second = await request(`/conversations/${call.id}/cancel`, alice, 'POST', {});
  assert.equal(first.status, 200); assert.equal(first.body.cancelled_at, second.body.cancelled_at);
  assert.equal(second.body.started_at, 0); assert.equal(second.body.ended_at, 0);
  assert.ok(!(await request('/conversations/history', alice)).body.some(value => value.id === call.id));
  assert.ok(!(await request('/conversations', alice)).body.some(value => value.id === call.id));
});

test('RS256 interoperates with jose and rejects altered claims or signatures', async () => {
  const publicKey = await importSPKI(testKeys.publicKey, 'RS256');
  assert.equal((await jwtVerify(alice, publicKey, { issuer: 'speakup', audience: 'speakup' })).payload.user_id, '1');
  const privateKey = await importPKCS8(testKeys.privateKey, 'RS256');
  const seconds = Math.floor(Date.now() / 1000);
  const claims = { user_id: '1', iss: 'speakup', aud: 'speakup', iat: seconds, exp: seconds + 300 };
  const sign = overrides => new SignJWT({ ...claims, ...overrides }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
  assert.equal((await request('/user/info', await sign({}))).body.id, 1);
  assert.equal((await request('/user/info', await sign({ aud: ['other', 'speakup'] }))).body.id, 1);
  for (const invalid of [{ iss: 'wrong' }, { aud: 'wrong' }, { exp: seconds - 1 }, { nbf: seconds + 60 }, { user_id: '0' }, { user_id: '1.5' }, { user_id: '01' }, { user_id: '1e0' }, { user_id: 1 }, { exp: undefined }, { nbf: null }, { nbf: 'yesterday' }, { iat: null }, { iat: 'today' }]) {
    assert.equal((await request('/user/info', await sign(invalid))).status, 401);
  }
  const parts = alice.split('.');
  const tampered = [parts[0], Buffer.from(JSON.stringify({ ...claims, user_id: '2' })).toString('base64url'), parts[2]].join('.');
  assert.equal((await request('/user/info', tampered)).status, 401);
});

test('avatar multipart parsing preserves image bytes and rejects invalid content', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
  const send = async bytes => {
    const form = new FormData(); form.set('description', 'first field'); form.set('avatar', new Blob([bytes]), 'untrusted.png');
    return fetch(base + '/user/avatar', { method: 'PUT', headers: { Authorization: `Bearer ${alice}` }, body: form });
  };
  const wrongField = new FormData(); wrongField.set('wrong', new Blob([png]), 'avatar');
  assert.equal((await fetch(base + '/user/avatar', { method: 'PUT', headers: { Authorization: `Bearer ${alice}` }, body: wrongField })).status, 400);
  const response = await send(png);
  assert.equal(response.status, 200);
  const profile = (await request('/user/info', alice)).body;
  const path = new URL(profile.avatar_url).pathname;
  const image = await fetch(base + path);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await send(png)).status, 200, 'an existing upload directory must be reusable');
  assert.equal((await send(Buffer.from('not an image'))).status, 400);
  assert.equal((await send(Buffer.alloc(2 * 1024 * 1024 + 1))).status, 413);
  // Do not change later browser snapshots or leave a fake avatar on the seed.
  await database.execute("UPDATE users SET avatar_url='' WHERE id=1");
});

test('signaling progresses while every database worker waits on a row lock', { timeout: 15000 }, async () => {
  const call = await direct();
  const a = connect(), b = connect();
  let pending = [];
  try {
    await Promise.all([once(a.ws, 'open'), once(b.ws, 'open')]);
    a.ws.send(JSON.stringify({ type: 'Authorization', token: `Bearer ${alice}`, room: call.id }));
    await a.next();
    b.ws.send(JSON.stringify({ type: 'Authorization', token: `Bearer ${bob}`, room: call.id }));
    await Promise.all([a.next(), b.next()]);
    b.ws.send(JSON.stringify({ type: 'offer', offer: { type: 'offer', sdp: 'v=0\r\n' } })); await a.next();
    a.ws.send(JSON.stringify({ type: 'answer', answer: { type: 'answer', sdp: 'v=0\r\n' } })); await b.next();
    await database.beginTransaction();
    await database.execute('SELECT user_id FROM memos WHERE user_id=1 FOR UPDATE');
    pending = Array.from({ length: 10 }, () => request('/memo', alice, 'PUT', { memo1: 'DB locked', memo2: '' }));
    let blocked = false;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const [processes] = await database.query('SHOW FULL PROCESSLIST');
      if (processes.filter(p => p.Info?.startsWith('INSERT INTO memos')).length === 10) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(blocked, 'all 10 database slots must be waiting before measuring relay progress');
    for (let i = 0; i < 10; i++) {
      const ice = { type: 'ice-candidate', candidate: { candidate: `candidate:${i} 1 udp 1 127.0.0.1 9999 typ host`, sdpMid: '0', sdpMLineIndex: 0 } };
      b.ws.send(JSON.stringify(ice)); assert.deepEqual(await a.next(), ice);
    }
  } finally {
    await database.rollback();
    const results = await Promise.all(pending);
    a.ws.terminate(); b.ws.terminate();
    assert.ok(results.every(r => r.status === 200));
  }
});
