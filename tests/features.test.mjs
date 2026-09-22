import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import mysql from 'mysql2/promise';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { nativeEnv, nativeExecutable } from '../scripts/native-env.mjs';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const native = process.env.SERVER_RUNTIME === 'native';
const base = 'http://127.0.0.1:18082';
let db, child, logs = '', provider, users, providerRequests = [], gate;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, user, method = 'GET', payload) {
  const response = await fetch(base + path, { method, headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}
async function person(name, role = 'USER') {
  const [row] = await db.execute('INSERT INTO users(username,email,role) VALUES (?,?,?)', [name, `${randomUUID()}@example.test`, role]);
  const token = await new SignJWT({ user_id: String(row.insertId) }).setProtectedHeader({ alg: 'RS256' }).setIssuer('speakup').setAudience('speakup').setIssuedAt().setExpirationTime('1h').sign(await importPKCS8(keys.privateKey, 'RS256'));
  return { id: row.insertId, token };
}
async function eventually(work) {
  let last;
  for (let i = 0; i < 80; i++) { try { return await work(); } catch (e) { last = e; await sleep(50); } }
  throw last;
}
function activity(user) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/activity', { origin: 'http://localhost:5173' });
  const seen = [];
  ws.on('message', data => seen.push(JSON.parse(data.toString())));
  return { ws, seen, async ready() { await once(ws, 'open'); ws.send(JSON.stringify({ token: `Bearer ${user.token}` })); await eventually(() => assert.deepEqual(seen, [{ type: 'refresh' }])); } };
}
before(async () => {
  db = await mysql.createConnection(process.env.TEST_DATABASE_URL ?? 'mysql://speakup:speakup-local-only@127.0.0.1:3308/speakup_moonbit');
  users = [await person('Feature Alice', 'ADMIN'), await person('Feature Bob'), await person('Unrelated')];
  provider = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const input = JSON.parse(text); providerRequests.push(input);
    if (gate) await gate;
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: input.messages[1].content.includes('invalid-provider') ? '' : '練習例: I enjoyed learning together.' } }] }));
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const env = { ...(native ? nativeEnv() : process.env), DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://speakup:speakup-local-only@127.0.0.1:3308/speakup_moonbit', HOST: '127.0.0.1', PORT: '18082', AUTH_MODE: 'development', JWT_PRIVATE_KEY: keys.privateKey, JWT_PUBLIC_KEY: keys.publicKey, OPENAI_API_KEY: 'local-fixture-only', OPENAI_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1` };
  child = spawn(native ? nativeExecutable : process.execPath, native ? [] : ['server/main.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
  await eventually(async () => assert.equal((await request('/health')).status, 200));
});
after(async () => {
  child?.kill('SIGTERM'); if (child && child.exitCode === null) await once(child, 'exit');
  await db?.end(); await new Promise(resolve => provider?.close(resolve));
  assert.doesNotMatch(logs, /ERROR: AddressSanitizer|runtime error:/);
});

test('friendship requires recipient consent, concurrent retries deduplicate, activity hints remain private', async () => {
  const [a, b, c] = users;
  const sa = activity(a), sb = activity(b), sc = activity(c);
  try {
    await Promise.all([sa.ready(), sb.ready(), sc.ready()]);
    assert.equal((await request(`/messages/${b.id}`, a, 'POST', { body: 'premature', request_id: randomUUID() })).status, 404);
    const attempts = await Promise.all(Array.from({ length: 8 }, () => request(`/friends/${b.id}/request`, a, 'POST', {})));
    assert.ok(attempts.every(r => r.status === 200), JSON.stringify(attempts));
    assert.deepEqual((await request('/friends', a)).body.friends, []);
    assert.equal((await request(`/friends/${b.id}/accept`, a, 'POST', {})).status, 409);
    assert.equal((await request(`/friends/${a.id}/cancel`, b, 'POST', {})).status, 409);
    assert.equal((await request(`/friends/${a.id}/request`, b, 'POST', {})).status, 409);
    assert.equal((await request(`/friends/${a.id}/accept`, c, 'POST', {})).status, 409);
    const received = await request('/notifications', b);
    assert.equal(received.body.items.filter(n => n.kind === 'friend_request').length, 1);
    assert.equal(received.body.items[0].actor.id, a.id);
    assert.equal(received.body.unread, 1);
    await eventually(() => assert.ok(sb.seen.length > 1));
    assert.deepEqual(sc.seen, [{ type: 'refresh' }]);
    assert.deepEqual((await request('/notifications', c)).body.items, []);
    const accepted = await Promise.all(Array.from({ length: 6 }, () => request(`/friends/${a.id}/accept`, b, 'POST', {})));
    assert.ok(accepted.every(r => r.status === 200), JSON.stringify(accepted));
    for (const [user, other] of [[a, b], [b, a]]) assert.equal((await request('/friends', user)).body.friends[0].id, other.id);
    assert.equal((await request('/notifications', a)).body.items.filter(n => n.kind === 'friend_accepted').length, 1);
    for (const hint of [...sa.seen, ...sb.seen, ...sc.seen]) assert.deepEqual(hint, { type: 'refresh' });
    const unauth = new WebSocket(base.replace('http', 'ws') + '/activity', { origin: 'http://localhost:5173' });
    await once(unauth, 'open'); const closed = once(unauth, 'close'); unauth.send('{"token":"Bearer invalid"}'); assert.equal((await closed)[0], 1008);
  } finally { sa.ws.terminate(); sb.ws.terminate(); sc.ws.terminate(); }
});

test('request cancellation and rejection allow explicit new consent without resurrecting acceptance', async () => {
  const [a, , c] = users;
  assert.equal((await request(`/friends/${c.id}/request`, a, 'POST', {})).status, 200);
  assert.equal((await request(`/friends/${c.id}/cancel`, a, 'POST', {})).status, 200);
  assert.equal((await request(`/friends/${a.id}/accept`, c, 'POST', {})).status, 409);
  assert.equal((await request(`/friends/${a.id}/request`, c, 'POST', {})).status, 200);
  assert.equal((await request(`/friends/${c.id}/reject`, a, 'POST', {})).status, 200);
  assert.equal((await request(`/friends/${c.id}/accept`, a, 'POST', {})).status, 409);
  const self = await request(`/friends/${a.id}/request`, a, 'POST', {}); assert.equal(self.status, 400);
});

test('private messages persist, retry once, paginate by ID and mark only received messages read', async () => {
  const [a, b, c] = users;
  const key = randomUUID(), body = '<script>plain text</script> 日本語';
  const attempts = await Promise.all(Array.from({ length: 8 }, () => request(`/messages/${b.id}`, a, 'POST', { body, request_id: key })));
  assert.ok(attempts.every(r => r.status === 200), JSON.stringify(attempts));
  assert.equal((await request(`/messages/${a.id}`, b)).body.messages.length, 1);
  assert.equal((await request(`/messages/${b.id}`, a, 'POST', { body: 'different', request_id: key })).status, 409);
  for (const invalid of ['', '  ', 'x'.repeat(2001)]) assert.equal((await request(`/messages/${b.id}`, a, 'POST', { body: invalid, request_id: randomUUID() })).status, 400);
  assert.equal((await request(`/messages/${a.id}`, c)).status, 404);
  assert.equal((await request(`/messages/${a.id}/read`, c, 'PUT', { through_id: 2147483647 })).status, 404);
  for (let i = 0; i < 51; i++) assert.equal((await request(`/messages/${b.id}`, a, 'POST', { body: `page ${i}`, request_id: randomUUID() })).status, 200);
  const latest = (await request(`/messages/${a.id}`, b)).body;
  assert.equal(latest.messages.length, 50); assert.equal(latest.has_older, true);
  const older = (await request(`/messages/${a.id}/before/${latest.messages[0].id}`, b)).body;
  assert.equal(older.messages.length, 2); assert.equal(older.has_older, false); assert.equal(older.messages[0].body, body);
  assert.equal(new Set([...older.messages, ...latest.messages].map(m => m.id)).size, 52);
  const read = await request(`/messages/${a.id}/read`, b, 'PUT', { through_id: latest.messages.at(-2).id });
  assert.equal(read.status, 200); assert.equal(read.body.messages.at(-1).read_at, ''); assert.ok(read.body.messages.at(-2).read_at);
  const inbox = (await request('/notifications', b)).body;
  assert.equal(inbox.items.filter(n => n.kind === 'message' && !n.read).length, 1);
  const originalUnread = (await request('/notifications', a)).body.unread;
  assert.equal((await request('/notifications/read', b, 'PUT', { through_id: inbox.items[0].id })).body.unread, 0);
  assert.equal((await request('/notifications', a)).body.unread, originalUnread);
});

async function completedCall(a, b) {
  const created = await request('/conversations/direct', a, 'POST', { target_user_id: b.id, request_id: randomUUID() });
  assert.equal(created.status, 200, JSON.stringify(created));
  const id = created.body.id, start = Date.now() - 180000;
  await db.execute('UPDATE conversations SET started_at=?,ended_at=?,revision=2 WHERE id=?', [start, start + 120000, id]);
  return id;
}
test('stats derive only from completed calls and private saved reflections; surveys and advice are owner scoped', async () => {
  const [a, b, c] = users;
  assert.equal((await request('/stats', a)).body.total_calls, 0);
  const id = await completedCall(a, b);
  const reflection = { satisfaction: 77, comment: 'my written reflection', learned_expressions: 'I enjoyed it.' };
  assert.equal((await request(`/conversations/${id}/reflection`, a, 'PUT', reflection)).status, 200);
  const stats = await request('/stats', a); assert.equal(stats.status, 200, JSON.stringify(stats));
  assert.deepEqual(Object.fromEntries(['total_calls', 'direct_calls', 'event_calls', 'partners', 'minutes', 'reflections'].map(k => [k, stats.body[k]])), { total_calls: 1, direct_calls: 1, event_calls: 0, partners: 1, minutes: 2, reflections: 1 });
  assert.ok(stats.body.achievements.find(a => a.code === 'first_call').earned);
  assert.equal((await request('/stats', b)).body.reflections, 0);
  assert.equal((await request(`/conversations/${id}/survey`, a, 'PUT', { answers: [0, 1, 2, 0, 1, 2] })).status, 200);
  for (const answers of [[1], [0.5, 1, 1, 1, 1, 1], [3, 1, 1, 1, 1, 1]]) assert.equal((await request(`/conversations/${id}/survey`, a, 'PUT', { answers })).status, 400);
  assert.deepEqual((await request(`/conversations/${id}/learning`, b)).body.answers, []);
  assert.equal((await request(`/conversations/${id}/learning`, c)).status, 404);
  const before = providerRequests.length;
  const generated = await request(`/conversations/${id}/feedback`, a, 'POST', {});
  assert.equal(generated.status, 200, JSON.stringify(generated)); assert.ok(generated.body.feedback_current); assert.match(generated.body.feedback, /I enjoyed/);
  assert.equal((await request(`/conversations/${id}/feedback`, a, 'POST', {})).status, 200);
  assert.equal(providerRequests.length, before + 1);
  assert.deepEqual(providerRequests.at(-1).messages[1], { role: 'user', content: '感想:\nmy written reflection\n学んだ表現:\nI enjoyed it.' });
  assert.equal((await request(`/conversations/${id}/learning`, b)).body.feedback, '');
  assert.equal((await request(`/conversations/${id}/feedback`, c, 'POST', {})).status, 404);
  await request(`/conversations/${id}/reflection`, a, 'PUT', { ...reflection, comment: 'edited' });
  assert.equal((await request(`/conversations/${id}/learning`, a)).body.feedback_current, false);
  let release;
  gate = new Promise(resolve => { release = resolve; });
  const concurrent = request(`/conversations/${id}/feedback`, a, 'POST', {});
  await eventually(() => assert.equal(providerRequests.length, before + 2));
  await request(`/conversations/${id}/reflection`, a, 'PUT', { ...reflection, comment: 'newer edit' });
  release(); gate = undefined;
  assert.equal((await concurrent).status, 409);
  assert.equal((await request(`/conversations/${id}/learning`, a)).body.feedback_current, false);
  await request(`/conversations/${id}/reflection`, a, 'PUT', { ...reflection, comment: 'invalid-provider' });
  assert.equal((await request(`/conversations/${id}/feedback`, a, 'POST', {})).status, 500);
});

test('event roster respects participation bits, publishes private invitations and recovers expired calls without browsers', async () => {
  const [a, b, c] = users;
  const event = await request('/events', a, 'POST', { event_start: '2026-10-01T12:00:00Z', theme: 'Feature event', topics: [] });
  assert.equal(event.status, 200); const id = event.body.id;
  for (const [user, bit] of [[a, 7], [b, 3], [c, 4]]) assert.equal((await request(`/events/${id}/register`, user, 'POST', { participates_bit: bit })).status, 200);
  const overview = (await request('/events/overview', b)).body.find(e => e.event.id === id);
  assert.equal(overview.participates_bit, 3); assert.equal(overview.registered_count, 3);
  assert.equal((await request(`/events/${id}/roster`, b)).status, 403);
  const published = await request(`/events/${id}/match`, a, 'POST', {}); assert.equal(published.status, 200, JSON.stringify(published));
  const roster = (await request(`/events/${id}/roster`, a)).body;
  assert.equal(roster.members.find(m => m.user.id === b.id).matched_bit, 3);
  assert.equal(roster.members.find(m => m.user.id === c.id).matched_bit, 4);
  assert.equal((await request(`/events/${id}/register`, c, 'POST', { participates_bit: 7 })).status, 409);
  const notices = (await request('/notifications', b)).body.items.filter(n => n.kind === 'event_matched');
  assert.equal(notices.length, 2);
  const call = published.body.find(call => call.round === 1);
  const start = Date.now() - 301000;
  await db.execute('UPDATE conversations SET started_at=?,revision=1 WHERE id=?', [start, call.id]);
  await eventually(async () => {
    const ended = await request(`/conversations/${call.id}`, a);
    assert.equal(ended.body.ended_at, start + 300000); assert.equal(ended.body.revision, 2);
  });
  const finish = await request(`/conversations/${call.id}/finish`, b, 'POST', {});
  assert.equal(finish.body.ended_at, start + 300000);
  assert.equal((await request(`/conversations/${call.id}`, c)).status, 404);
  assert.equal((await request('/stats', a)).body.event_calls, 1);
});
