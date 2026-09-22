// Capture the actual React reducer before migration, not a reimplementation.
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const commit = '018634fda4bb1b006c0c6ca1d7f3cdcbaa9bba39';
const file = 'frontend/src/components/pages/Message.tsx';
mkdirSync('contract/message', { recursive: true });
if (process.argv.includes('--capture-source')) {
  const source = execFileSync('git', ['show', `${commit}:${file}`], { encoding: 'utf8' });
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let reducer;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'setThread') reducer = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!reducer) throw new Error('Source reducer not found');
  writeFileSync('contract/message/reducer.js', `// Extracted verbatim from ${file} at ${commit}.\n(${reducer})\n`);
  writeFileSync('contract/message/source.d.ts', ts.transpileDeclaration(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX }, fileName: file }).outputText);
}
const reducer = readFileSync('contract/message/reducer.js', 'utf8');
const peer = { id: 2, username: 'Bob', avatar_url: '' };
const message = (id, read_at = '') => ({ id, sender_id: 1, recipient_id: 2, body: `message ${id}`, created_at: '2026-09-22T10:00:00Z', read_at });
const thread = (messages, has_older = false) => ({ peer, messages, has_older });
const cases = [
  { name: 'first page', previous: null, next: thread([message(2), message(3)], true), older: false },
  { name: 'empty thread', previous: null, next: thread([]), older: false },
  { name: 'refresh merges and preserves paging cursor', previous: thread([message(1), message(2)]), next: thread([message(2), message(3)], true), older: false },
  { name: 'older page extends the front without losing new messages', previous: thread([message(3)], true), next: thread([message(1), message(2)]), older: true },
  { name: 'late unread snapshot cannot undo read receipt', previous: thread([message(2, '2026-09-22T10:01:00Z')]), next: thread([message(2), message(3)]), older: false },
  { name: 'out of order page deduplicates and sorts', previous: thread([message(3)], true), next: thread([message(2), message(1), message(3)]), older: true },
];
for (const scenario of cases) scenario.expected = runInNewContext(reducer, structuredClone(scenario))(scenario.previous);
writeFileSync('contract/message/fixtures.json', JSON.stringify({ commit, file, node: process.version, cases }, null, 2) + '\n');
console.log(`Captured ${cases.length} source reducer cases at ${commit}`);
