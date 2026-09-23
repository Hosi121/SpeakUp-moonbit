import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSocial, parseInbox, parseThread, parseStats, parseEvents, parseRoster, parseLearning, parseActivityToken } from '../dist/shared.js';
const person = { id: 1, username: 'Typed', avatar_url: '' };
const now = 1790045133052;
const valid = [
  [parseSocial, { friends: [person], incoming: [], outgoing: [] }],
  [parseInbox, { items: [{ id: 1, kind: 'message', actor: person, conversation_id: 0, message_id: 1, read: false, created_at: '2026-09-22T00:00:00Z' }], unread: 1, now }],
  [parseThread, { peer: person, messages: [{ id: 2, sender_id: 2, recipient_id: 1, body: 'hello', created_at: '', read_at: '' }], has_older: false }],
  [parseStats, { total_calls: 1, event_calls: 1, direct_calls: 0, partners: 1, minutes: 5, reflections: 1, achievements: [{ code: 'first_call', title: 'First', progress: 1, target: 1, earned: true }] }],
  [parseEvents, [{ event: { id: 1, event_start: '', event_end: '', theme_id: 1, theme: { theme_text: 'Topic', topic1: '', topic2: '', topic3: '' } }, participates_bit: 7, registered_count: 2, matching_state: 'published' }]],
  [parseRoster, { members: [{ user: person, participates_bit: 7, matched_bit: 3 }] }],
  [parseLearning, { answers: [0, 1, 2, 0, 1, 2], feedback: '', feedback_current: false, updated_at: '' }],
];
test('feature DTOs cross the actual generated JS boundary without internal ABI values', () => {
  for (const [decode, dto] of valid) assert.deepEqual(JSON.parse(JSON.stringify(decode(JSON.stringify(dto)))), dto);
  assert.equal(parseActivityToken('{"token":"Bearer example"}'), 'Bearer example');
});
test('new ingress decoders reject missing fields, fractional identifiers, out-of-range bits and invalid protocol kinds', () => {
  for (const [decode] of valid) for (const invalid of ['null', '{}', '42', '{']) assert.throws(() => decode(invalid));
  const corrupt = [
    [parseSocial, { friends: [{ ...person, id: 1.5 }], incoming: [], outgoing: [] }],
    [parseInbox, { ...valid[1][1], now: now + 0.5 }],
    [parseInbox, { ...valid[1][1], items: [{ ...valid[1][1].items[0], kind: 'anything' }] }],
    [parseInbox, { ...valid[1][1], items: [{ ...valid[1][1].items[0], message_id: 0 }] }],
    [parseInbox, { ...valid[1][1], items: [{ ...valid[1][1].items[0], kind: 'call_invitation', conversation_id: 0 }] }],
    [parseThread, { ...valid[2][1], messages: [{ ...valid[2][1].messages[0], recipient_id: 2 }] }],
    [parseStats, { ...valid[3][1], minutes: -1 }],
    [parseEvents, [{ ...valid[4][1][0], participates_bit: 8 }]],
    [parseEvents, [{ ...valid[4][1][0], matching_state: 'unknown' }]],
    [parseRoster, { members: [{ user: person, participates_bit: 1, matched_bit: 0.5 }] }],
    [parseLearning, { ...valid[6][1], answers: [0, 1, 2, 0, 1, 2.5] }],
  ];
  for (const [decode, value] of corrupt) assert.throws(() => decode(JSON.stringify(value)));
  for (const raw of ['{}', 'null', '{"token":5}', '{"token":"wrong"}', JSON.stringify({ token: `Bearer ${'x'.repeat(8192)}` })]) assert.throws(() => parseActivityToken(raw));
});
