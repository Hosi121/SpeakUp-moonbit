import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as shared from '../dist/shared.js';
const fixtures = JSON.parse(readFileSync(new URL('../contract/fixtures.json', import.meta.url)));
for (const f of fixtures.typescript) test(`source parity: ${f.fn} ${JSON.stringify(f.input)}`, () => {
  // Optional legacy memo fields normalize once at the JS boundary.
  const input = f.target === 'fromMemo' ? { memo1: f.input.memo1 ?? '', memo2: f.input.memo2 ?? '' } : f.input;
  // The captured contract is JSON structural: MoonBit structs have prototypes.
  assert.deepEqual(JSON.parse(JSON.stringify(shared[f.target](input))), f.expected);
});
test('Go avatar serialization oracle', () => {
  assert.deepEqual(fixtures.go.input.Avatars.map(a => shared.normalizeAvatar(a, 'http://localhost:8081')), fixtures.go.expected.avatars);
});
test('Go signaling serialization is accepted, including omitted isOffer=false', () => {
  for (const message of fixtures.go.expected.messages) {
    const parsed = shared.parseSignal(JSON.stringify(message));
    assert.equal(parsed.kind, message.type);
    assert.equal(parsed.error, '');
    if (message.type === 'callType') assert.equal(parsed.isOffer, message.isOffer ?? false);
  }
});
