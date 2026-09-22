import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProfile, parseUsers, parseEvent, parseMemo, parseToken, parseSignUp, parseAvatar, parseChatMessage, parseIceServers } from '../dist/shared.js';

const user = { id: 1, username: '日本語', email: 'one@example.test', avatar_url: '/avatar.png', created_at: '2026-09-23', updated_at: '2026-09-23', role: 'USER' };
test('HTTP response decoders return generated view models and reject invalid identifiers before narrowing', () => {
  const profile = parseProfile(JSON.stringify(user));
  assert.equal(profile.avatarUrl, '/avatar.png'); assert.equal(profile.createdAt, user.created_at);
  assert.equal(parseUsers(JSON.stringify([user]))[0].username, user.username);
  const event = { id: 1, theme_id: 2, event_start: '2026-09-23', event_end: '2026-09-24', theme: { theme_text: '旅行', topic1: '', topic2: '', topic3: '' } };
  assert.equal(parseEvent(JSON.stringify(event)).theme.themeText, '旅行');
  for (const id of [0, 1.5, 2147483648, '1']) {
    assert.throws(() => parseProfile(JSON.stringify({ ...user, id })));
    assert.throws(() => parseUsers(JSON.stringify([{ ...user, id }])));
    assert.throws(() => parseEvent(JSON.stringify({ ...event, theme_id: id })));
  }
  assert.throws(() => parseProfile(JSON.stringify({ ...user, username: 1 })));
  assert.throws(() => parseUsers('{}'));
});
test('memo, login, upload and assistant responses are decoded before entering application state', () => {
  assert.equal(parseMemo('{"memo1":"保存","memo2":null}').carryInMemo, '保存');
  assert.equal(parseMemo('{}').wordList, '');
  assert.equal(parseToken('{"token":"fixture"}'), 'fixture');
  assert.equal(parseSignUp('{"success":true,"message":"確認してください"}').message, '確認してください');
  assert.equal(parseAvatar('{"avatar_url":"/upload/image.png"}'), '/upload/image.png');
  assert.equal(parseChatMessage('{"choices":[{"message":{"content":"練習しましょう"}}]}'), '練習しましょう');
  for (const [decode, values] of [
    [parseMemo, ['[]', '{"memo1":1}']], [parseToken, ['{}', '{"token":false}', '{"token":""}']],
    [parseSignUp, ['{"success":false,"message":"no"}', '{"success":"true","message":"ok"}']],
    [parseAvatar, ['{"avatar_url":null}', '{"avatar_url":""}']],
    [parseChatMessage, ['{"choices":[]}', '{"choices":[{"message":{"content":7}}]}']],
  ]) for (const value of values) assert.throws(() => decode(value));
});
test('ICE configuration accepts server string/array URLs and keeps TURN credentials typed', () => {
  const servers = parseIceServers(JSON.stringify({ iceServers: [
    { urls: 'stun:example.test' }, { urls: ['turn:example.test', 'turns:example.test'], username: 'temporary', credential: 'fixture' },
  ] }));
  assert.deepEqual(servers[0].urls, ['stun:example.test']);
  assert.equal(servers[0].username, ''); assert.equal(servers[1].credential, 'fixture');
  for (const config of [{}, { iceServers: [{}] }, { iceServers: [{ urls: [] }] }, { iceServers: [{ urls: [1] }] }, { iceServers: [{ urls: '', credential: 1 }] }]) {
    assert.throws(() => parseIceServers(JSON.stringify(config)));
  }
});
