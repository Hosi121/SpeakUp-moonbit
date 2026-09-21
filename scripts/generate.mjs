import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const r = spawnSync(process.execPath, ['scripts/ts2mbt.mjs', '--input', 'bindings/host.d.ts', '--module-spec', '#speakup/host', '--out', 'core/platform', '--strict'], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
// The generator emits an empty moon.pkg for file inputs; supply build metadata.
writeFileSync('core/platform/moon.pkg', 'options(targets: { "bridge.mbt": ["js"] })\n');
const source = readFileSync('core/platform/bridge.mbt', 'utf8');
const used = source.split('\n').filter(s => /JSValue/.test(s) && !/JSValue::|Array\[JSValue\]|String, JSValue|type JSValue|-> JSValue/.test(s));
if (used.length) throw new Error(`Unexpected dynamic boundary: ${used.join('\n')}`);
