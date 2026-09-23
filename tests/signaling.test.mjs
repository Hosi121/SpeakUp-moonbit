import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub, destroyHub, join, leave, relay, receive, publish, connectionCount } from '../dist/signaling.js';
import { parseSignal } from '../dist/shared.js';
import { pairRound } from '../dist/matching.js';
// The relay must preserve whitespace and extensions after validating SDP.
const offer = '{ "type": "offer", "offer": { "type": "offer", "sdp": "v=0\\r\\n", "extension": 1 } }';
const answer = JSON.stringify({ type: 'answer', answer: { type: 'answer', sdp: 'v=0\r\n' } });
test('media acknowledgements belong to one negotiation and terminal publication releases peers', () => {
  const h = createHub();
  const ready = connection => receive(h, connection, '{ "type": "media-ready" }').media_ready;
  try {
    join(h, 1, 11, 8); join(h, 2, 12, 8);
    assert.equal(ready(1), false); assert.equal(ready(2), false);
    relay(h, 2, offer); relay(h, 1, answer);
    assert.equal(ready(1), false); assert.equal(ready(1), false);
    leave(h, 2); join(h, 3, 12, 8);
    assert.equal(ready(2), false); assert.equal(ready(3), false);
    relay(h, 3, offer); relay(h, 1, answer);
    assert.equal(ready(3), false); // The surviving peer's old acknowledgement was cleared.
    assert.equal(ready(1), true); assert.equal(ready(3), false);
    assert.deepEqual(publish(h, 8, 'finished', true).map(d => [d.connection, d.close_code]), [[1, 1000], [3, 1000]]);
    assert.equal(connectionCount(h), 0); assert.equal(ready(1), false);
    assert.deepEqual(leave(h, 1), []); assert.deepEqual(publish(h, 8, 'again', true), []);
  } finally { destroyHub(h); }
});
test('two-party readiness, direction and negotiation order', () => {
  const h = createHub();
  try {
    assert.equal(JSON.parse(join(h, 10, 1, 8)[0].payload).type, 'waiting');
    const ready = join(h, 20, 2, 8);
    assert.deepEqual(ready.map(d => [d.connection, JSON.parse(d.payload).isOffer]), [[10, false], [20, true]]);
    assert.equal(relay(h, 10, offer)[0].close_code, 1008);
    assert.equal(relay(h, 10, answer)[0].close_code, 1008);
    assert.deepEqual(relay(h, 20, offer).map(d => ({ ...d })), [{ connection: 10, payload: offer, close_code: 0 }]);
    assert.equal(relay(h, 10, answer)[0].connection, 20);
    assert.equal(relay(h, 20, offer)[0].close_code, 1008);
  } finally { destroyHub(h); }
});
test('isolation, duplicate identity, leave and reconnect do not retain stale connections', () => {
  const h = createHub();
  try {
    join(h, 1, 11, 1); join(h, 2, 12, 1); join(h, 3, 13, 2);
    assert.equal(join(h, 4, 11, 1)[0].close_code, 1008);
    assert.equal(relay(h, 3, offer)[0].close_code, 1008);
    assert.equal(leave(h, 2)[0].connection, 1);
    assert.equal(connectionCount(h), 2);
    assert.equal(join(h, 5, 12, 1).length, 2);
    assert.deepEqual(leave(h, 2), []);
    assert.equal(relay(h, 5, offer)[0].connection, 1);
    leave(h, 1); leave(h, 3); leave(h, 5);
    assert.equal(connectionCount(h), 0);
  } finally { destroyHub(h); }
});
test('malformed and oversized messages never panic or become authorized', () => {
  const invalid = ['', '{', 'null', '[]', '{"type":"Authorization","token":"a","room":1}', '{"type":"Authorization","token":"Bearer x","room":1.5}', '{"type":"Authorization","token":"Bearer x","room":2147483648}', '{"type":"offer","offer":{"type":"answer","sdp":"x"}}', '{"type":"ice-candidate","candidate":{"candidate":"x","sdpMLineIndex":-1}}', 'x'.repeat(65537)];
  for (const raw of invalid) assert.equal(parseSignal(raw).kind, 'error', raw.slice(0, 100));
});
test('matching invariants across roster sizes, rounds, ranks and participation', () => {
  for (let n = 0; n < 100; n++) for (let round = 1; round <= 3; round++) {
    const participants = Array.from({ length: n }, (_, i) => ({ user_id: i + 1, rank: i % 5 + 1, participates_bit: i % 8 }));
    const result = pairRound([...participants, ...participants], round, 1000);
    const used = new Set();
    for (const pair of result) for (const id of [pair.first, pair.second]) {
      assert.ok(!used.has(id)); used.add(id);
      if (id !== 1000) assert.ok(participants[id - 1].participates_bit & (1 << (round - 1)));
    }
    assert.ok(result.every(p => p.first !== p.second));
  }
});
