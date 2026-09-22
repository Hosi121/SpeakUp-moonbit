import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createThreadController } from '../dist/thread.js';

const peer = { id: 2, username: 'Bob', avatar_url: '' };
const message = (id, sender_id = 1, read_at = '') => ({ id, sender_id, recipient_id: sender_id === 1 ? 2 : 1,
  body: `message ${id}`, created_at: '2026-09-22T10:00:00Z', read_at });
const thread = (messages = [], has_older = false) => ({ peer, messages, has_older });
function harness(id = 2, visible = true) {
  const requests = [];
  let visibility, activity, keys = 0;
  const controller = createThreadController(id, {
    request(method, path, body, done) {
      const request = { method, path, body: body ? JSON.parse(body) : null, canceled: false,
        respond(value, status = 200) { done(status, JSON.stringify(value), false); },
        raw(text, status = 200) { done(status, text, false); },
        fail() { done(0, '', true); } };
      requests.push(request);
      return () => { request.canceled = true; };
    },
    random_id: () => `request-${++keys}`, format_time: value => value,
    is_visible: () => visible,
    on_visibility: callback => { visibility = callback; return () => { visibility = undefined; }; },
    on_activity: callback => { activity = callback; return () => { activity = undefined; }; },
  });
  return { controller, requests, view: controller.get_snapshot,
    visible(value) { visible = value; visibility?.(value); }, hint() { activity?.(); },
    watchers() { return Number(!!visibility) + Number(!!activity); } };
}

const oracle = JSON.parse(readFileSync(new URL('../contract/message/fixtures.json', import.meta.url)));
for (const scenario of oracle.cases) test(`source reducer parity: ${scenario.name}`, () => {
  const { controller: c, requests, view } = harness();
  c.start();
  if (scenario.previous) {
    requests.at(-1).respond(scenario.previous);
    if (scenario.older) c.load_older(); else c.refresh();
  }
  requests.at(-1).respond(scenario.next);
  assert.deepEqual(structuredClone(view().messages), scenario.expected.messages.map(m => ({
    id: m.id, body: m.body, time: m.created_at, own: m.sender_id !== 2, read: !!m.read_at,
  })));
  assert.equal(view().has_older, scenario.expected.has_older);
  assert.equal(view().peer_name, scenario.expected.peer.username);
});

test('snapshots are cached, previous snapshots are unchanged and draft edits reuse message arrays', () => {
  const { controller: c, requests, view } = harness();
  const initial = view(); assert.equal(view(), initial);
  let notifications = 0;
  const off = c.subscribe(() => notifications++);
  c.start(); requests[0].respond(thread([message(1)]));
  const loaded = view(); c.set_draft('draft');
  assert.equal(loaded.draft, ''); assert.equal(initial.loaded, false);
  assert.equal(view().messages, loaded.messages);
  const edited = view(), before = notifications;
  c.set_draft('draft'); assert.equal(view(), edited); assert.equal(notifications, before);
  off(); c.set_draft('changed'); assert.equal(notifications, before);
});

test('superseded fetches are canceled and cannot change state or initiate a read', () => {
  const { controller: c, requests, view } = harness();
  c.start(); const first = requests[0]; c.refresh();
  assert.equal(first.canceled, true);
  requests[1].respond(thread([message(2)]));
  const before = view(); first.respond(thread([message(1, 2)]));
  assert.equal(view(), before); assert.equal(requests.length, 2);
  first.raw('error', 500); assert.equal(view(), before);
});

test('stop aborts every operation, removes subscriptions and ignores stale completions across restart', () => {
  const h = harness(), c = h.controller;
  c.start(); c.start(); assert.equal(h.requests.length, 1); assert.equal(h.watchers(), 2);
  h.requests[0].respond(thread([message(5, 2)], true)); // Starts read acknowledgement.
  c.set_draft('pending'); c.send(); c.load_older(); c.refresh();
  const pending = h.requests.slice(1);
  c.stop(); assert.equal(h.watchers(), 0); assert.ok(pending.every(r => r.canceled));
  const stopped = h.view();
  for (const request of pending) request.respond(thread([message(100, 2)]));
  h.hint(); c.send(); c.load_older(); c.refresh();
  assert.equal(h.view(), stopped); assert.equal(h.requests.length, 5);
  c.start(); const restarted = h.requests.at(-1);
  for (const request of pending) request.fail();
  restarted.respond(thread([message(6)]));
  assert.deepEqual(h.view().messages.map(m => m.id), [5, 6]);
  assert.equal(h.view().draft, 'pending');
});

test('only visible incoming messages are acknowledged, and in-flight reads coalesce to the highest ID', () => {
  const h = harness(2, false), c = h.controller;
  c.start(); h.requests[0].respond(thread([message(1, 2), message(2)]));
  assert.equal(h.requests.length, 1);
  h.visible(true); assert.deepEqual(h.requests[1].body, { through_id: 1 });
  h.visible(true); assert.equal(h.requests.length, 2);
  c.refresh(); h.requests[2].respond(thread([message(3, 2), message(4, 2)]));
  assert.equal(h.requests.length, 3);
  h.requests[1].respond(thread([message(1, 2, 'read'), message(2)]));
  assert.deepEqual(h.requests[3].body, { through_id: 4 });
  h.requests[3].respond(thread([message(3, 2, 'read'), message(4, 2, 'read')]));
  c.refresh(); h.requests[4].respond(thread([message(1, 2), message(3, 2), message(4, 2)]));
  assert.equal(h.requests.length, 5);
  assert.ok(h.view().messages.filter(m => !m.own).every(m => m.read));
});

test('read failure does not spin and can recover on a later activity hint', () => {
  const h = harness(); h.controller.start(); h.requests[0].respond(thread([message(1, 2)]));
  h.requests[1].fail(); assert.equal(h.requests.length, 2);
  h.hint(); h.requests[2].respond(thread([message(1, 2)]));
  assert.deepEqual(h.requests[3].body, { through_id: 1 });
});

test('older paging has one request, preserves new messages and updates availability', () => {
  const h = harness(), c = h.controller;
  c.start(); h.requests[0].respond(thread([message(3)], true));
  c.load_older(); const older = h.requests[1]; c.load_older(); assert.equal(h.requests.length, 2);
  assert.equal(older.path, '/messages/2/before/3');
  c.refresh(); h.requests[2].respond(thread([message(3), message(4)], true));
  older.respond(thread([message(1), message(2)]));
  assert.deepEqual(h.view().messages.map(m => m.id), [1, 2, 3, 4]);
  assert.equal(h.view().has_older, false); assert.equal(h.view().loading_older, false);
  c.load_older(); assert.equal(h.requests.length, 3);
  c.refresh(); h.requests[3].respond(thread([message(4)], true));
  assert.equal(h.view().has_older, false);
});

test('newly loaded unread older messages are acknowledged while visible', () => {
  const h = harness(), c = h.controller;
  c.start(); h.requests[0].respond(thread([message(3)], true));
  c.load_older(); h.requests[1].respond(thread([message(1, 2)]));
  assert.deepEqual(h.requests[2].body, { through_id: 1 });
});

test('send serializes once, blocks duplicate dispatch and keeps one key for an unchanged retry', () => {
  const h = harness(), c = h.controller;
  c.start(); h.requests[0].respond(thread());
  c.set_draft('日本語 😀 <b>text</b>'); const draft = h.view().draft; c.send(); c.send();
  assert.equal(h.requests.length, 2); assert.equal(h.view().sending, true);
  c.set_draft('ignored while sending'); assert.equal(h.view().draft, draft);
  h.requests[1].fail(); assert.equal(h.view().sending, false); assert.equal(h.view().draft, draft);
  c.send(); assert.deepEqual(h.requests[2].body, h.requests[1].body);
  h.requests[2].respond(thread([message(1)]));
  assert.equal(h.view().draft, ''); assert.equal(h.view().sending, false);
  c.set_draft(draft); c.send(); assert.notEqual(h.requests[3].body.request_id, h.requests[2].body.request_id);
});

test('changing the draft after failure creates a new request key', () => {
  const h = harness(), c = h.controller;
  c.start(); h.requests[0].respond(thread()); c.set_draft('first'); c.send(); h.requests[1].fail();
  c.set_draft('second'); c.send(); assert.notEqual(h.requests[1].body.request_id, h.requests[2].body.request_id);
});

test('draft validation matches JS trim and the UTF-16 input limit', () => {
  const h = harness(), c = h.controller; c.start(); h.requests[0].respond(thread());
  for (const draft of ['', ' ', '\t\r\n', '\u00a0', '\ufeff', '\u3000', '😀'.repeat(1000), '😀'.repeat(1001)]) {
    c.set_draft(draft); assert.equal(h.view().can_send, !!draft.trim() && draft.length <= 2000, JSON.stringify(draft));
  }
});

test('errors and mismatched peers never install a partial snapshot', () => {
  const h = harness(), c = h.controller; c.start(); h.requests[0].respond(thread());
  for (const value of ['{', '{}', JSON.stringify({ ...thread(), peer: { ...peer, id: 3 } }),
    JSON.stringify(thread([{ ...message(1), id: 1.5 }])), JSON.stringify(thread([{ ...message(1), sender_id: 3, recipient_id: 4 }]))]) {
    c.refresh(); h.requests.at(-1).raw(value); assert.ok(h.view().error); assert.equal(h.view().messages.length, 0);
  }
  c.refresh(); h.requests.at(-1).raw('', 500); assert.match(h.view().error, /500/);
});

test('older metadata cannot overwrite a later successful response', () => {
  const h = harness(), c = h.controller; c.start(); h.requests[0].respond(thread([message(2)], true));
  c.load_older(); c.refresh();
  h.requests[2].respond({ ...thread([message(2)]), peer: { ...peer, username: 'New name' } });
  h.requests[1].respond(thread([message(1)])); assert.equal(h.view().peer_name, 'New name');
});

test('duplicate completion is ignored even if it contains unread messages', () => {
  const h = harness(); h.controller.start(); h.requests[0].respond(thread());
  const before = h.view(); h.requests[0].respond(thread([message(1, 2)]));
  assert.equal(h.view(), before); assert.equal(h.requests.length, 1);
});

test('invalid peer IDs perform no I/O; signed 32-bit bounds are accepted', () => {
  for (const peer of [NaN, Infinity, -Infinity, 0, -1, 0.5, 2147483648]) {
    const h = harness(peer); h.controller.start(); assert.equal(h.view().valid, false); assert.equal(h.requests.length, 0);
  }
  for (const peer of [1, 2147483647]) {
    const h = harness(peer); h.controller.start(); assert.equal(h.view().valid, true); assert.equal(h.requests[0].path, `/messages/${peer}`);
  }
});

test('synchronous ports obey the same read protocol without leaking pending operations', () => {
  const calls = [];
  const c = createThreadController(2, { request(method, path, body, done) {
    calls.push({ method, path, body }); done(200, JSON.stringify(thread([message(1, 2, method === 'PUT' ? 'read' : '')])), false);
    return () => calls.push('cancel');
  }, random_id: () => 'key', format_time: value => value, is_visible: () => true,
  on_visibility: () => () => {}, on_activity: () => () => {} });
  c.start(); assert.deepEqual(calls.map(c => c.method), ['GET', 'PUT']);
  assert.equal(c.get_snapshot().messages[0].read, true); c.stop(); assert.equal(calls.length, 2);
});
