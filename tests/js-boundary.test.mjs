import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeNote, echo } from '../dist/js-boundary.js';
import { emitDeclaration } from '../scripts/boundaries/js-contract.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a separate MoonBit consumer exports concrete DTO field layouts with strict numbers', () => {
  const note = { id: 42, created_at: 1770000000000, text: '日本語' };
  const decoded = decodeNote(JSON.stringify(note));
  assert.deepEqual({ ...decoded }, note);
  assert.deepEqual(JSON.parse(JSON.stringify(decoded)), note);
  for (const id of [1.9, 0, 2147483648, null, '42']) assert.throws(() => decodeNote(JSON.stringify({ ...note, id })));
  for (const created_at of [-1, 1.5, 9007199254740992, null]) assert.throws(() => decodeNote(JSON.stringify({ ...note, created_at })));
  assert.throws(() => decodeNote('{'));
});

test('TS2Mbt callback bindings resolve once and carry typed failures', async () => {
  for (const input of ['hello', 'fail']) {
    let completions = 0;
    const result = await new Promise(resolve => echo(input, (error, value) => { completions++; resolve({ error, value }); }));
    assert.deepEqual(result, input === 'fail' ? { error: 'example_failure', value: '' } : { error: '', value: 'hello' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completions, 1);
  }
});

test('declaration tool refuses async and runtime-specific public signatures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'servicekit-contract-'));
  try {
    const interfaceFile = join(dir, 'bad.mbti'), packageFile = join(dir, 'moon.pkg');
    writeFileSync(interfaceFile, 'package "example/bad"\npub async fn unsafe() -> String\n');
    writeFileSync(packageFile, 'options(link: { "js": { "exports": ["unsafe"] } })\n');
    assert.throws(() => emitDeclaration({ interfaceFile, packageFile, rawOutput: join(dir, 'raw.d.ts'), output: join(dir, 'index.d.ts'), mbt2ts: 'scripts/mbt2ts.mjs' }), /plain, synchronous boundary/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
