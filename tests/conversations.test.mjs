import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConversation, parseConversations, conversationClock, conversationPartner, parseReflection, parseSignal } from '../dist/shared.js';

const planned = {
  id: 1, event_id: 0, round: 0, started_at: 0, ended_at: 0, cancelled_at: 0, revision: 0,
  theme: '随時通話', topics: [], event_start: '',
  participants: [{ id: 1, username: 'Alice', avatar_url: '' }, { id: 2, username: 'Bob', avatar_url: '' }],
};
test('generated JS contract returns actual DTOs, clocks and partners without internal Result wrappers', () => {
  const call = parseConversation(JSON.stringify(planned));
  assert.equal(call.id, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(call)), planned);
  assert.equal(parseConversations(JSON.stringify([planned]))[0].id, 1);
  assert.equal(conversationPartner(call, 1).username, 'Bob');
  assert.equal(conversationPartner(call, 2).username, 'Alice');
  assert.throws(() => conversationPartner(call, 3));
  const now = 1790045133052;
  const active = parseConversation(JSON.stringify({ ...planned, started_at: now, revision: 1 }));
  assert.equal(conversationClock(active, now + 600000).remaining_seconds, -1);
  const event = parseConversation(JSON.stringify({ ...active, event_id: 3, round: 9 }));
  assert.equal(conversationClock(event, now + 1000).remaining_seconds, 299);
  assert.equal(conversationClock(event, now + 600000).remaining_seconds, 0);
  assert.equal(parseReflection('{"saved":false,"satisfaction":50,"comment":"","learned_expressions":"","updated_at":""}').saved, false);
});
test('invalid JSON and impossible lifecycle values are rejected at the JS boundary', () => {
  for (const raw of ['null', '{', '{}', '[]']) assert.throws(() => parseConversation(raw));
  const invalid = [
    { event_id: 1 }, { round: -1 }, { id: 1.5 }, { id: 2147483648 },
    { participants: [] }, { participants: [planned.participants[0], planned.participants[0]] },
    { ended_at: 1000 }, { started_at: 1000 }, { started_at: 1000, ended_at: 900, revision: 2 },
    { cancelled_at: 1000, started_at: 900, revision: 1 }, { started_at: 1.5, revision: 1 },
    { started_at: 9007199254740992, revision: 1 },
  ];
  for (const patch of invalid) {
    const value = { ...planned, ...patch };
    assert.throws(() => parseConversation(JSON.stringify(value)), JSON.stringify(patch));
    assert.equal(parseSignal(JSON.stringify({ type: 'conversation', value })).kind, 'error');
  }
  assert.equal(parseSignal(JSON.stringify({ type: 'conversation', value: planned })).kind, 'conversation');
});
