import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
test('renderers do not regain application state, decoding or network orchestration', () => {
  const forbidden = new Set([
    'useState',
    'useReducer',
    'fetch',
    'setTimeout',
    'setInterval',
  ]);
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(path)) continue;
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node) => {
        if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression))
            assert.ok(
              !forbidden.has(node.expression.text),
              `${path}: ${node.expression.text} belongs in a controller/port`,
            );
          if (
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression)
          )
            assert.notEqual(
              node.expression.expression.text,
              'JSON',
              `${path}: decode at MoonBit ingress`,
            );
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  walk('frontend/src/dom');
  walk('frontend/src/message');
});

test('frontend has no runtime npm dependency or React renderer', () => {
  const pkg = JSON.parse(readFileSync('frontend/package.json', 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { walk(path); continue; }
      assert.ok(!path.endsWith('.tsx'), `${path}: keep markup in DOM adapters`);
      if (!path.endsWith('.ts')) continue;
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = node => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
          assert.ok(!/^react(?:-dom)?(?:\/|$)/.test(node.moduleSpecifier.text), `${path}: retired React import`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  walk('frontend/src');
});
