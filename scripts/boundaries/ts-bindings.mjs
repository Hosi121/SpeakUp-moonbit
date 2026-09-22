import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function generateBindings({ input, module, output, ts2mbt }) {
  const result = spawnSync(process.execPath, [ts2mbt, '--input', input, '--module-spec', module, '--out', output, '--strict'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`TS2Mbt failed: ${input}`);
  const diagnostics = readFileSync(join(output, 'SCAFFOLD_DIAGNOSTICS.md'), 'utf8');
  if (!diagnostics.includes('No unsupported exports were detected.')) throw new Error(`Unsupported TS2Mbt exports: ${input}`);
  const source = readFileSync(join(output, 'bridge.mbt'), 'utf8');
  if (/\bAny\b|\bJSValue\b|unsafeCast/.test(source)) throw new Error(`Dynamic TS2Mbt boundary: ${input}`);
  writeFileSync(join(output, 'moon.pkg'), 'options(targets: { "bridge.mbt": ["js"] })\n');
}
