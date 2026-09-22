import ts from 'typescript';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// moon's built-in d.ts still widens structs to any. mbt2ts recovers their fields
// from the compiler interface. Project onto the actual link exports, excluding
// trait methods (not JS exports) and trait inheritance (not a JS wire property).
// Every output is reproducible; no handwritten shadow definitions.
mkdirSync('contract/generated', { recursive: true });
for (const pkg of ['shared', 'signaling', 'api', 'matching']) {
  const file = `core/${pkg}/pkg.generated.mbti`;
  const out = `contract/generated/${pkg}.raw.d.ts`;
  const result = spawnSync(process.execPath, ['scripts/mbt2ts.mjs', 'decl', file, out], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const config = readFileSync(`core/${pkg}/moon.pkg`, 'utf8');
  const entries = /"exports"\s*:\s*\[([^\]]+)\]/.exec(config)?.[1].match(/"[^"]+"/g) ?? [];
  const names = new Map(entries.map(e => { const [a, b] = JSON.parse(e).split(':'); return [a, b ?? a]; }));
  const signatures = readFileSync(file, 'utf8').split('\n');
  for (const name of names.keys()) {
    const signature = signatures.find(line => line.startsWith(`pub fn ${name}(`));
    if (!signature || /\braise\b|\basync\b|\bResult\[|\bOption\[/.test(signature)) {
      throw new Error(`JS export needs a plain, synchronous boundary: ${pkg}.${name}`);
    }
  }
  const source = ts.createSourceFile(out, readFileSync(out, 'utf8'), ts.ScriptTarget.Latest, true);
  // Only include types reachable from the JS link exports. The API package also
  // exposes native host injection, which is not part of the browser/Node ABI.
  const required = new Set();
  const collect = node => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) required.add(node.typeName.text);
    ts.forEachChild(node, collect);
  };
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) collect(node);
  }
  for (let previous = -1; previous !== required.size;) {
    previous = required.size;
    for (const node of source.statements) {
      if (ts.isInterfaceDeclaration(node) && required.has(node.name.text)) collect(node);
    }
  }
  const nodes = [];
  for (const node of source.statements) {
    if (ts.isInterfaceDeclaration(node) && required.has(node.name.text) && node.name.text !== 'ToJson') {
      nodes.push(ts.factory.updateInterfaceDeclaration(node, node.modifiers, node.name, node.typeParameters, undefined, node.members));
    } else if (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) {
      nodes.push(ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, ts.factory.createIdentifier(names.get(node.name.text)), node.typeParameters, node.parameters, node.type, undefined));
      names.delete(node.name.text);
    }
  }
  if (names.size) throw new Error(`Missing compiled exports: ${[...names.keys()]}`);
  const printer = ts.createPrinter();
  const code = '// Generated from MoonBit interfaces by mbt2ts; do not edit.\n' + nodes.map(n => printer.printNode(ts.EmitHint.Unspecified, n, source)).join('\n\n') + '\n';
  if (/\bany\b|\bunknown\b|json\./.test(code)) throw new Error(`Untyped declaration in ${pkg}`);
  writeFileSync(`dist/${pkg}.d.ts`, code);
}
