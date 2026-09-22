import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { generateClient, emitClientFacades } from './client-bundle.mjs';
import { splitClient } from './split-client.mjs';
generateClient();
const r = spawnSync(
  process.execPath,
  ['scripts/moon.mjs', 'build', '--target', 'js', '--release'],
  { stdio: 'inherit' },
);
if (r.status !== 0) process.exit(r.status ?? 1);
mkdirSync('dist', { recursive: true });
function copy(dir) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) copy(`${dir}/${f.name}`);
    else if (/\.(js|d\.ts)$/.test(f.name))
      copyFileSync(`${dir}/${f.name}`, `dist/${f.name}`);
  }
}
copy('_build/js/release/build/hosi121/speakup');
splitClient();
emitClientFacades();
copyFileSync(
  '_build/js/release/build/hosi121/js_boundary_fixture/contract/contract.js',
  'dist/js-boundary.js',
);
for (const args of [['scripts/moon.mjs', 'info'], ['scripts/emit-types.mjs']]) {
  const step = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (step.status !== 0) process.exit(step.status ?? 1);
}
