import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { partitionClient } from '../scripts/split-client.mjs';

test('linked module partition preserves prototypes, shared object identity, recursion, aliases and local shadowing', async () => {
  const code = `
    function Box(value) { this.value = value; }
    Box.prototype.$tag = 4;
    const shared = new Box(7);
    function sum(n) { return n === 0 ? 0 : n + sum(n - 1); }
    function left() { return shared; }
    function right() { return { box: shared, n: sum(4) }; }
    function separate(shared) { return shared + 1; }
    export { left as a, right as b, separate as c };
  `;
  const { output, facade } = partitionClient(code, {
    a: 'left',
    b: 'right',
    c: 'separate',
  });
  assert.ok(!output.get('separate').includes("from './runtime.js'"));
  const dir = mkdtempSync(join(tmpdir(), 'speakup-link-'));
  try {
    mkdirSync(join(dir, 'client'));
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    writeFileSync(join(dir, 'entry.js'), facade);
    for (const [name, text] of output)
      writeFileSync(join(dir, 'client', `${name}.js`), text);
    const linked = await import(pathToFileURL(join(dir, 'entry.js')).href);
    assert.equal(linked.a(), linked.b().box);
    assert.equal(linked.a().$tag, 4);
    assert.equal(linked.b().n, 10);
    assert.equal(linked.c(2), 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unexpected compiler effects, unassigned exports and mutable globals fail closed', () => {
  for (const code of [
    'let state = 0; function f() { return state++; } export { f };',
    'const state = performIO(); function f() { return state; } export { f };',
    'function f() {} initialize(); export { f };',
    'function other() {} export { other };',
  ])
    assert.throws(() => partitionClient(code, { f: 'f' }));
});
