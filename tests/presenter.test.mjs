import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemo,
  createHome,
  createHistory,
  createStats,
  createCalls,
  createSocial,
  createEvents,
  createEventCard,
  createAdmin,
  createSettings,
  createReflection,
  createLearning,
  createActivity,
  createVoice,
  createSession,
  createMicrophone,
  createAuthRequest,
} from '../dist/presenter.js';
import { createAuth, createActivityLoader, route } from '../dist/shell.js';

const profile = {
  id: 1,
  username: 'Alice',
  email: 'alice@example.test',
  avatar_url: '',
  role: 'user',
  created_at: '',
  updated_at: '',
};
const alice = { id: 1, username: 'Alice', avatar_url: '' },
  bob = { id: 2, username: 'Bob', avatar_url: '' };
const call = {
  id: 42,
  event_id: 0,
  round: 0,
  started_at: 0,
  ended_at: 0,
  cancelled_at: 0,
  revision: 0,
  theme: 'Call',
  topics: [],
  participants: [alice, bob],
  event_start: '',
};
const social = { friends: [], incoming: [], outgoing: [] };
const learning = {
  answers: [],
  feedback: '',
  feedback_current: false,
  updated_at: '',
};
const event = {
  event: {
    id: 1,
    theme_id: 1,
    event_start: '2026-09-24T00:00:00Z',
    event_end: '2026-09-24T01:00:00Z',
    theme: { theme_text: 'Theme', topic1: 'One', topic2: '', topic3: '' },
  },
  participates_bit: 1,
  registered_count: 2,
  matching_state: 'open',
};
const plain = structuredClone;
function harness() {
  const requests = [],
    timers = [],
    watchers = new Set(),
    sockets = [],
    focus = new Set();
  let token = 'fixture',
    now = 100000,
    navigations = [],
    notices = 0,
    visible = true;
  const ports = {
    request(method, path, body, done) {
      const request = {
        method,
        path,
        body: body ? JSON.parse(body) : undefined,
        done,
        canceled: false,
      };
      requests.push(request);
      return () => {
        request.canceled = true;
      };
    },
    now: () => now,
    number: Number,
    date: (value) => new Date(value).getTime(),
    iso: (value) =>
      Number.isFinite(new Date(value).getTime())
        ? new Date(value).toISOString()
        : '',
    encode: encodeURIComponent,
    random_id: () => 'fixed-key',
    navigate: (path, replace) => navigations.push({ path, replace }),
    token: () => token,
    store_token: (value) => {
      token = value;
    },
    timeout(delay, run) {
      const timer = { delay, run, canceled: false };
      timers.push(timer);
      return () => {
        timer.canceled = true;
      };
    },
    on_activity(listener) {
      watchers.add(listener);
      return () => watchers.delete(listener);
    },
  };
  const realtime = {
    socket(path, receive) {
      const item = { path, receive, sent: [], closed: false };
      sockets.push(item);
      return {
        send: (text) => {
          if (item.closed) return false;
          item.sent.push(JSON.parse(text));
          return true;
        },
        close: () => {
          item.closed = true;
        },
      };
    },
    visible: () => visible,
    on_focus(listener) {
      focus.add(listener);
      return () => focus.delete(listener);
    },
    notify: () => {
      notices++;
      for (const listener of [...watchers]) listener();
    },
  };
  return {
    ports,
    realtime,
    requests,
    timers,
    watchers,
    sockets,
    focus,
    navigations,
    setTime(value) {
      now = value;
    },
    setVisible(value) {
      visible = value;
    },
    get token() {
      return token;
    },
    get notices() {
      return notices;
    },
    request(path, method) {
      const found = requests.findLast(
        (r) => r.path === path && (!method || r.method === method),
      );
      assert.ok(found, `Missing ${method ?? ''} ${path}`);
      return found;
    },
    respond(path, value, status = 200, method) {
      this.request(path, method).done(status, JSON.stringify(value), false);
    },
    hint() {
      for (const listener of [...watchers]) listener();
    },
    tick(delay) {
      const current = timers.find((t) => !t.canceled && t.delay === delay);
      assert.ok(current, `Missing timer ${delay}`);
      current.canceled = true;
      current.run();
    },
  };
}

test('memo cancels every lifecycle, rejects stale and duplicate completions, and saves a captured draft once', () => {
  const h = harness(),
    c = createMemo(h.ports);
  let notifications = 0;
  const unsubscribe = c.subscribe(() => notifications++);
  assert.equal(c.get_snapshot(), c.get_snapshot());
  c.start();
  const stale = h.request('/memo');
  c.stop();
  c.start();
  assert.equal(stale.canceled, true);
  h.respond('/memo', { memo1: 'current', memo2: '' });
  c.set_memo('draft');
  const snapshot = c.get_snapshot();
  stale.done(200, '{"memo1":"old"}', false);
  assert.equal(c.get_snapshot(), snapshot);
  c.save();
  c.save();
  c.set_memo('ignored');
  assert.equal(h.requests.filter((r) => r.method === 'PUT').length, 1);
  assert.deepEqual(h.request('/memo').body, { memo1: 'draft', memo2: '' });
  h.respond('/memo', { memo1: 'draft', memo2: '' });
  assert.equal(c.get_snapshot().saved, true);
  h.respond('/memo', { memo1: 'late', memo2: '' });
  assert.equal(c.get_snapshot().carryInMemo, 'draft');
  assert.equal(snapshot.saved, false);
  const count = notifications;
  unsubscribe();
  c.set_words('x');
  assert.equal(notifications, count);
  c.stop();
});

test('home selects participating upcoming event and malformed responses fail without escaping', () => {
  const h = harness(),
    c = createHome(h.ports);
  h.setTime(new Date(event.event.event_start).getTime() - 1);
  c.start();
  h.respond('/events/overview', [{ ...event, participates_bit: 0 }, event]);
  assert.equal(c.get_snapshot().events.length, 1);
  c.stop();
  c.start();
  h.respond('/events/overview', { invalid: true });
  assert.ok(c.get_snapshot().error);
  assert.equal(c.get_snapshot().loading, false);
  c.stop();
});

test('history and stats dispose activity subscriptions and ignore old result generations', () => {
  const h = harness(),
    history = createHistory(h.ports),
    stats = createStats(h.ports);
  history.start();
  history.set_tab('friends');
  h.respond('/conversations/history', [call]);
  assert.equal(history.get_snapshot().tab, 'friends');
  stats.start();
  const old = h.request('/stats');
  h.hint();
  assert.equal(old.canceled, true);
  h.respond('/stats', {
    total_calls: 0,
    event_calls: 0,
    direct_calls: 0,
    partners: 0,
    minutes: 0,
    reflections: 0,
    achievements: [],
  });
  const snapshot = stats.get_snapshot();
  old.done(500, '{}', false);
  assert.equal(stats.get_snapshot(), snapshot);
  history.stop();
  stats.stop();
  assert.equal(h.watchers.size, 0);
});

test('call list filters self, encodes Unicode queries, keeps retry key, and does not unlock invitation on activity', () => {
  const h = harness(),
    c = createCalls(h.ports);
  c.start();
  h.respond('/user/info', profile);
  h.respond('/conversations', [call]);
  c.set_query('　Bob & 日本　');
  assert.equal(c.get_snapshot().can_search, true);
  c.search();
  h.respond('/users/search?q=Bob%20%26%20%E6%97%A5%E6%9C%AC', [
    { ...profile },
    { ...profile, id: 2, username: 'Bob' },
  ]);
  assert.deepEqual(
    c.get_snapshot().users.map((x) => x.id),
    [2],
  );
  c.invite(2);
  const first = h.request('/conversations/direct');
  h.hint();
  c.invite(2);
  assert.equal(
    h.requests.filter((r) => r.path === '/conversations/direct').length,
    1,
  );
  first.done(503, '{"error":"retry"}', false);
  c.invite(2);
  assert.deepEqual(h.request('/conversations/direct').body, first.body);
  h.respond('/conversations/direct', call);
  assert.equal(h.navigations[0].path, '/session?conversation=42');
  c.stop();
});

test('social search cannot be overwritten by initial history and relationship changes update eligibility', () => {
  const h = harness(),
    c = createSocial(h.ports, true);
  c.start();
  h.respond('/friends', social);
  h.respond('/user/info', profile);
  const history = h.request('/conversations/history');
  c.set_query('Bob');
  c.search();
  h.respond('/user/info', profile);
  h.respond('/users/search?q=Bob', [{ ...profile, id: 2, username: 'Bob' }]);
  history.done(200, '[]', false);
  assert.equal(c.get_snapshot().candidates.length, 1);
  assert.equal(c.get_snapshot().candidates[0].can_request, true);
  c.change(2, 'request');
  c.change(2, 'request');
  h.respond('/friends/2/request', { ...social, outgoing: [bob] });
  assert.equal(c.get_snapshot().candidates[0].can_request, false);
  c.stop();
  assert.equal(h.watchers.size, 0);
});

test('event card keeps unsaved selections on refresh, bounds rounds and requires confirmation before matching', () => {
  const h = harness(),
    owner = createEvents(h.ports),
    c = createEventCard(h.ports, event, true, owner);
  owner.start();
  c.start();
  c.set_round(1, true);
  c.set_round(50, true);
  c.update({ ...event, registered_count: 3 });
  assert.deepEqual(c.get_snapshot().rounds, [true, true, false]);
  c.act('register');
  assert.deepEqual(h.request('/events/1/register').body, {
    participates_bit: 3,
  });
  h.respond('/events/1/register', {});
  c.act('match');
  assert.equal(
    h.requests.some((r) => r.path.endsWith('/match')),
    false,
  );
  c.confirm(true);
  c.act('match');
  c.act('match');
  h.respond('/events/1/match', []);
  h.respond('/events/1/roster', {
    members: [{ user: bob, participates_bit: 3, matched_bit: 1 }],
  });
  assert.equal(c.get_snapshot().roster[0].status, 'R1 相手決定 / R2 待機');
  assert.equal(c.get_snapshot().frozen, true);
  c.set_round(0, false);
  assert.equal(c.get_snapshot().rounds[0], true);
  c.stop();
  owner.stop();
});

test('admin catches invalid date, snapshots topic fields and serializes creation once', () => {
  const h = harness(),
    c = createAdmin(h.ports);
  c.start();
  c.open();
  c.create();
  assert.ok(c.get_snapshot().dialogError);
  assert.equal(h.requests.length, 0);
  c.set_field('dateTime', '2026-09-24T00:00:00Z');
  c.set_field('theme', 'Theme');
  c.set_topic(0, 'One');
  c.create();
  c.create();
  c.set_topic(0, 'ignored');
  assert.deepEqual(h.request('/events').body, {
    event_start: '2026-09-24T00:00:00.000Z',
    theme: 'Theme',
    topics: ['One', '', ''],
  });
  h.respond('/events', event.event);
  assert.equal(c.get_snapshot().open, false);
  assert.equal(c.get_snapshot().created[0].id, 1);
  c.stop();
});

test('settings upload belongs to controller lifetime and logout aborts all in-flight work', () => {
  const h = harness(),
    c = createSettings(h.ports);
  c.start();
  h.respond('/user/info', profile);
  c.edit('username');
  c.set_draft('Updated');
  c.save();
  c.save();
  h.respond('/user/update', {});
  assert.equal(c.get_snapshot().user.username, 'Updated');
  let completion,
    aborted = false;
  c.upload({
    send(method, path, field, done) {
      assert.equal(method, 'PUT');
      assert.equal(path, '/user/avatar');
      assert.equal(field, 'avatar');
      completion = done;
      return () => {
        aborted = true;
      };
    },
  });
  const before = c.get_snapshot();
  c.logout();
  completion(200, '{"avatar_url":"/late"}', false);
  assert.equal(c.get_snapshot(), before);
  assert.equal(aborted, true);
  assert.equal(h.token, '');
  assert.equal(h.navigations[0].replace, true);
});

test('reflection validates URL/rating and permits edits only after completed call loads', () => {
  const h = harness(),
    bad = createReflection(h.ports, '2147483648');
  bad.start();
  assert.equal(bad.get_snapshot().id, 0);
  assert.equal(h.requests.length, 0);
  bad.stop();
  const c = createReflection(h.ports, '42');
  c.start();
  c.set_field('comment', 'too early');
  h.respond('/conversations/42', {
    ...call,
    started_at: 1000,
    ended_at: 2000,
    revision: 2,
  });
  h.respond('/conversations/42/reflection', {
    saved: false,
    satisfaction: 50,
    comment: '',
    learned_expressions: '',
    updated_at: '',
  });
  c.set_field('satisfaction', '　');
  c.save();
  assert.match(c.get_snapshot().error, /0〜100/);
  c.set_field('satisfaction', '85');
  c.set_field('comment', 'draft');
  c.save();
  assert.equal(h.request('/conversations/42/reflection').body.satisfaction, 85);
  c.stop();
});

test('survey has immutable answers, duplicate prevention, and feedback generation is gated by saved revision', () => {
  const h = harness(),
    c = createLearning(h.ports, '42', false);
  c.start();
  h.respond('/conversations/42/learning', learning);
  const before = c.get_snapshot();
  c.answer(2, 0);
  c.answer(9, 1);
  assert.equal(before.answers[2], 1);
  c.save();
  c.save();
  assert.deepEqual(h.request('/conversations/42/survey').body, {
    answers: [1, 1, 0, 1, 1, 1],
  });
  h.respond('/conversations/42/survey', {
    ...learning,
    answers: [1, 1, 0, 1, 1, 1],
  });
  c.generate();
  assert.equal(
    h.requests.some((r) => r.path.endsWith('/feedback')),
    false,
  );
  c.set_saved(true);
  h.respond('/conversations/42/learning', learning);
  c.generate();
  h.respond('/conversations/42/feedback', {
    ...learning,
    feedback: 'Advice',
    feedback_current: true,
  });
  assert.equal(c.get_snapshot().can_generate, false);
  c.stop();
});

test('notification reconnect errors back off, synchronize midpoint time, read immediately, and stop all work', () => {
  const h = harness(),
    c = createActivity(h.ports, h.realtime);
  c.start();
  h.tick(0);
  const socket = h.sockets[0];
  socket.receive('open', '');
  assert.deepEqual(socket.sent[0], { token: 'Bearer fixture' });
  socket.receive('text', '{"type":"refresh"}');
  assert.equal(c.get_snapshot().connected, true);
  h.tick(100);
  h.setTime(100020);
  const item = {
    id: 3,
    kind: 'message',
    actor: bob,
    conversation_id: 0,
    message_id: 4,
    read: false,
    created_at: '',
  };
  h.respond('/notifications', { items: [item], unread: 1, now: 100110 });
  assert.equal(c.get_snapshot().clockOffset, 100);
  assert.equal(c.get_snapshot().items[0].destination, '/message/2');
  c.read();
  c.read();
  h.respond('/notifications/read', {
    items: [{ ...item, read: true }],
    unread: 0,
    now: 100110,
  });
  assert.equal(c.get_snapshot().inbox.unread, 0);
  socket.receive('error', '');
  assert.equal(socket.closed, true);
  h.tick(1000);
  h.sockets[1].receive('close', '');
  h.tick(2000);
  c.stop();
  assert.equal(h.focus.size, 0);
  assert.equal(h.timers.filter((t) => !t.canceled).length, 0);
  assert.equal(
    h.sockets.every((s) => s.closed),
    true,
  );
});

test('notification old refresh cannot publish after a newer response or lifecycle', () => {
  const h = harness(),
    c = createActivity(h.ports, h.realtime);
  c.start();
  h.tick(100);
  const old = h.request('/notifications');
  c.refresh();
  h.tick(100);
  h.respond('/notifications', { items: [], unread: 0, now: 100000 });
  const before = c.get_snapshot();
  old.done(500, '{}', false);
  assert.equal(c.get_snapshot(), before);
  c.stop();
  assert.equal(h.watchers.size, 0);
  old.done(200, '{"items":[],"unread":9,"now":0}', false);
  assert.equal(c.get_snapshot(), before);
});

test('auth keeps fields usable during module loading, blocks abandoned requests, and validates token before storage', () => {
  const h = harness(),
    pending = [];
  const c = createAuth(false, {
    load: (ok, bad) => pending.push({ ok, bad }),
    navigate: h.ports.navigate,
    store_token: h.ports.store_token,
  });
  c.start();
  c.set_field('email', 'old');
  c.submit();
  c.submit();
  c.set_field('email', 'new');
  assert.equal(c.get_snapshot().email, 'new');
  assert.equal(pending.length, 1);
  c.stop();
  pending[0].ok(createAuthRequest(h.ports).submit);
  assert.equal(h.requests.length, 0);
  c.start();
  c.submit();
  pending[1].ok(createAuthRequest(h.ports).submit);
  assert.equal(h.request('/signin').body.email, 'new');
  h.respond('/signin', { token: 123 });
  assert.equal(h.token, 'fixture');
  assert.ok(c.get_snapshot().error);
  c.submit();
  pending[2].ok(createAuthRequest(h.ports).submit);
  h.respond('/signin', { token: 'updated' });
  assert.equal(h.token, 'updated');
  assert.equal(h.navigations[0].path, '/home');
  c.stop();
});

test('activity module loading is generation-scoped and cannot start requests after logout', () => {
  const h = harness(),
    pending = [],
    loader = createActivityLoader({
      enabled: true,
      load: (ready) => pending.push(ready),
    });
  loader.start();
  loader.stop();
  pending[0](createActivity(h.ports, h.realtime));
  assert.equal(h.timers.length, 0);
  loader.start();
  pending[1](createActivity(h.ports, h.realtime));
  h.tick(100);
  loader.stop();
  assert.equal(h.request('/notifications').canceled, true);
});

function mediaHarness() {
  const acquired = [],
    frames = [],
    streams = [],
    peers = [],
    operations = [];
  function stream() {
    const resource = { closed: false, muted: false, meters: [], detached: 0 };
    streams.push(resource);
    const port = {
      close() {
        resource.closed = true;
      },
      mute(value) {
        resource.muted = value;
      },
      meter() {
        const meter = { closed: false };
        resource.meters.push(meter);
        return {
          sample: () => [0, 255, 255],
          close() {
            meter.closed = true;
          },
        };
      },
      play() {
        return () => {
          resource.detached++;
        };
      },
      peer(servers, ice, remote, connection) {
        const peer = {
          closed: false,
          servers,
          ice,
          remote,
          connection,
          pending: [],
        };
        peers.push(peer);
        return {
          describe(offer, done) {
            operations.push(['describe', offer]);
            peer.pending.push({ kind: 'describe', done });
          },
          set_local(kind, sdp, done) {
            operations.push(['local', kind, sdp]);
            peer.pending.push({ kind: 'local', done });
          },
          remote(kind, sdp, done) {
            operations.push(['remote', kind, sdp]);
            peer.pending.push({ kind: 'remote', done });
          },
          ice(candidate, done) {
            operations.push(['ice', plain(candidate)]);
            peer.pending.push({ kind: 'ice', done });
          },
          close() {
            peer.closed = true;
          },
        };
      },
    };
    return { resource, port };
  }
  return {
    acquired,
    frames,
    streams,
    peers,
    operations,
    stream,
    ports: {
      acquire(ready, failed) {
        acquired.push({ ready, failed });
      },
      frame(run) {
        const frame = { canceled: false, run };
        frames.push(frame);
        return () => {
          frame.canceled = true;
        };
      },
    },
  };
}
function voice() {
  const h = harness(),
    m = mediaHarness(),
    events = [];
  const c = createVoice(h.ports, h.realtime, m.ports, 42, {
    conversation: (call) => events.push(['conversation', call.revision]),
    connection: (x) => events.push(['connection', x]),
    error: (x) => events.push(['error', x]),
    speaking() {},
  });
  const setup = () => {
    c.start();
    h.respond('/conversations/42', call);
    h.respond('/rtc-config', { iceServers: [] });
    const s = m.stream();
    m.acquired.at(-1).ready(s.port);
    h.sockets.at(-1).receive('open', '');
    return s;
  };
  return { h, m, c, events, setup };
}

test('voice discards a late microphone completion after stop and aborts configuration', () => {
  const { h, m, c } = voice();
  c.start();
  h.respond('/conversations/42', call);
  const rtc = h.request('/rtc-config');
  c.stop();
  rtc.done(200, '{"iceServers":[]}', false);
  assert.equal(m.acquired.length, 0);
  c.start();
  h.respond('/conversations/42', call);
  h.respond('/rtc-config', { iceServers: [] });
  c.stop();
  const s = m.stream();
  m.acquired[0].ready(s.port);
  assert.equal(s.resource.closed, true);
  assert.equal(m.peers.length, 0);
});

test('voice serializes SDP and buffered ICE, never sends from a stopped generation, and preserves mute on restart', () => {
  const { h, m, c, setup } = voice();
  c.mute(true);
  const s = setup();
  assert.equal(s.resource.muted, true);
  const ws = h.sockets[0],
    peer = m.peers[0];
  ws.receive(
    'text',
    '{"type":"ice-candidate","candidate":{"candidate":"candidate","sdpMid":null,"sdpMLineIndex":0}}',
  );
  assert.equal(m.operations.length, 0);
  ws.receive(
    'text',
    '{"type":"offer","offer":{"type":"offer","sdp":"offer-sdp"}}',
  );
  assert.equal(peer.pending[0].kind, 'remote');
  peer.pending.shift().done('');
  assert.equal(peer.pending[0].kind, 'ice');
  peer.pending.shift().done('');
  assert.equal(peer.pending[0].kind, 'describe');
  peer.pending.shift().done('answer-sdp', '');
  assert.equal(peer.pending[0].kind, 'local');
  const late = peer.pending.shift();
  c.stop();
  late.done('answer-sdp', '');
  assert.equal(
    ws.sent.some((x) => x.type === 'answer'),
    false,
  );
  assert.equal(peer.closed, true);
  assert.equal(s.resource.closed, true);
  assert.equal(
    s.resource.meters.every((m) => m.closed),
    true,
  );
  assert.equal(
    m.frames.every((f) => f.canceled),
    true,
  );
  setup();
  assert.equal(m.streams.at(-1).muted, true);
  c.stop();
});

test('voice offer and media-ready wire payloads remain compatible; duplicate completions are ignored', () => {
  const { h, m, c, setup } = voice();
  setup();
  const ws = h.sockets[0],
    peer = m.peers[0];
  ws.receive('text', '{"type":"callType","isOffer":true}');
  const describe = peer.pending.shift();
  describe.done('offer-sdp', '');
  describe.done('duplicate', '');
  assert.equal(peer.pending.length, 1);
  const local = peer.pending.shift();
  local.done('local-sdp', '');
  local.done('duplicate', '');
  peer.connection('connected');
  assert.deepEqual(ws.sent, [
    { type: 'Authorization', token: 'Bearer fixture', room: 42 },
    { type: 'offer', offer: { type: 'offer', sdp: 'local-sdp' } },
    { type: 'media-ready' },
  ]);
  c.stop();
});

test('voice bounds both pre-description ICE and the queue behind a pending SDP operation', () => {
  for (const blocked of [false, true]) {
    const { h, c, events, setup } = voice();
    setup();
    const ws = h.sockets[0];
    if (blocked) ws.receive('text', '{"type":"callType","isOffer":true}');
    for (let i = 0; i < 260; i++)
      ws.receive(
        'text',
        '{"type":"ice-candidate","candidate":{"candidate":"c"}}',
      );
    assert.equal(ws.closed, true);
    assert.match(events.find((e) => e[0] === 'error')[1], /多すぎ/);
    c.stop();
  }
});

test('voice refuses malformed signal/another conversation and releases remote playback on peer departure', () => {
  for (const input of [
    '{',
    JSON.stringify({ type: 'conversation', value: { ...call, id: 99 } }),
    '{"type":"peer-left"}',
  ]) {
    const { h, m, c, events, setup } = voice();
    setup();
    const remote = m.stream();
    m.peers[0].remote(remote.port);
    h.sockets[0].receive('text', input);
    assert.equal(
      events.some((e) => e[0] === 'error'),
      true,
    );
    assert.equal(remote.resource.closed, true);
    assert.equal(remote.resource.detached, 1);
    c.stop();
  }
});

test('session ignores lower revisions, serializes ending, applies server time, and replaces URL on completion', () => {
  const h = harness(),
    m = mediaHarness(),
    c = createSession(h.ports, h.realtime, m.ports, '42');
  c.start();
  h.respond('/user/info', profile);
  h.respond('/memo', {});
  h.respond('/conversations/42', call);
  h.respond('/rtc-config', { iceServers: [] });
  m.acquired[0].ready(m.stream().port);
  const ws = h.sockets[0];
  ws.receive(
    'text',
    JSON.stringify({
      type: 'conversation',
      value: {
        ...call,
        event_id: 1,
        round: 1,
        started_at: 100000,
        revision: 1,
      },
    }),
  );
  c.set_offset(1000);
  m.peers[0].connection('connected');
  assert.match(c.get_snapshot().status, /299/);
  ws.receive('text', JSON.stringify({ type: 'conversation', value: call }));
  assert.equal(c.get_snapshot().conversation[0].revision, 1);
  c.finish();
  c.finish();
  assert.equal(h.requests.filter((r) => r.path.endsWith('/finish')).length, 1);
  h.respond('/conversations/42/finish', {
    ...call,
    started_at: 100000,
    ended_at: 101000,
    revision: 2,
  });
  assert.deepEqual(h.navigations[0], {
    path: '/sessionrecord?conversation=42',
    replace: true,
  });
  assert.equal(m.peers[0].closed, true);
  c.stop();
});

test('microphone visibility cancels sampling, finishing releases audio, and delayed grants after disposal stop tracks', () => {
  const h = harness(),
    m = mediaHarness(),
    c = createMicrophone(m.ports, h.realtime);
  c.start();
  const first = m.acquired[0];
  c.stop();
  const late = m.stream();
  first.ready(late.port);
  assert.equal(late.resource.closed, true);
  c.start();
  const s = m.stream();
  m.acquired[1].ready(s.port);
  assert.equal(c.get_snapshot().ready, true);
  h.setVisible(false);
  for (const listener of h.focus) listener();
  assert.equal(
    m.frames.every((f) => f.canceled),
    true,
  );
  c.finish();
  assert.equal(c.get_snapshot().checked, true);
  assert.equal(s.resource.closed, true);
  assert.equal(s.resource.meters[0].closed, true);
  c.stop();
});

test('routes retain aliases and distinguish a malformed decoded URI from root', () => {
  assert.equal(route('/').redirect, '/login');
  assert.equal(route('/WAITING/').redirect, '/sessionlist');
  assert.equal(route('').redirect, '');
  assert.equal(route('/message/2/').peer, '2');
});

test('paired reads launch concurrently, cancel together, and cannot mix generations', () => {
  const h = harness(),
    c = createCalls(h.ports);
  c.start();
  assert.deepEqual(h.requests.map((r) => r.path).sort(), [
    '/conversations',
    '/user/info',
  ]);
  const oldProfile = h.request('/user/info'),
    oldCalls = h.request('/conversations');
  c.refresh();
  assert.equal(oldProfile.canceled, true);
  assert.equal(oldCalls.canceled, true);
  h.respond('/conversations', [call]);
  oldProfile.done(200, JSON.stringify(profile), false);
  assert.equal(c.get_snapshot().loaded, false);
  h.respond('/user/info', profile);
  assert.equal(c.get_snapshot().loaded, true);
  c.invite(2);
  c.refresh();
  h.respond('/user/info', {}, 500);
  assert.equal(c.get_snapshot().busy, true);
  assert.equal(h.request('/conversations').canceled, true);
  c.stop();
});

test('late notification acknowledgement cannot discard a newly arrived notification', () => {
  const h = harness(),
    c = createActivity(h.ports, h.realtime);
  c.start();
  h.tick(100);
  const item = {
    id: 3,
    kind: 'message',
    actor: bob,
    conversation_id: 0,
    message_id: 4,
    read: false,
    created_at: '',
  };
  h.respond('/notifications', { items: [item], unread: 1, now: 100000 });
  c.read();
  c.refresh();
  h.tick(100);
  h.respond('/notifications', {
    items: [{ ...item, id: 4 }, item],
    unread: 2,
    now: 100010,
  });
  h.respond('/notifications/read', {
    items: [{ ...item, read: true }],
    unread: 0,
    now: 100005,
  });
  assert.equal(c.get_snapshot().inbox.items[0].id, 4);
  assert.equal(c.get_snapshot().busy, false);
  h.tick(100);
  h.respond('/notifications', {
    items: [
      { ...item, id: 4 },
      { ...item, read: true },
    ],
    unread: 1,
    now: 100020,
  });
  assert.equal(c.get_snapshot().inbox.unread, 1);
  c.stop();
});
