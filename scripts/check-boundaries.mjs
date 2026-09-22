import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
let failed = false, count = 0;
function walk(path) {
  for (const f of readdirSync(path, { withFileTypes: true })) {
    const file = `${path}/${f.name}`;
    if (f.isDirectory()) { walk(file); continue; }
    if (/\.tsx?$/.test(f.name)) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = node => {
        if (node.kind === ts.SyntaxKind.AnyKeyword) { console.error(`TypeScript any: ${file}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`); failed = true; }
        ts.forEachChild(node, visit);
      };
      visit(source); count++;
    }
    if (f.name.endsWith('.mbt') && /\bAny\b|\bJSValue\b|unsafeCast/.test(readFileSync(file, 'utf8'))) { console.error(`Dynamic MoonBit boundary: ${file}`); failed = true; }
  }
}
for (const path of ['core', 'vendor/servicekit/sql_session/src', 'vendor/servicekit/mysql/src', 'vendor/servicekit/ws_session/src', 'examples/js-boundary/src', 'server', 'frontend/src', 'dist']) walk(path);
const diagnostics = readFileSync('core/platform/SCAFFOLD_DIAGNOSTICS.md', 'utf8');
if (!diagnostics.includes('No unsupported exports were detected.')) { failed = true; console.error('TS2Mbt reported unsupported exports'); }
if (failed) process.exit(1);
console.log(`Boundary audit passed: ${count} TypeScript files; no any, Any or JSValue.`);
