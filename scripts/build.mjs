import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
const r = spawnSync(process.execPath, ['scripts/moon.mjs', 'build', '--release'], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
mkdirSync('dist', { recursive: true });
function copy(dir) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) copy(`${dir}/${f.name}`);
    else if (/\.(js|d\.ts)$/.test(f.name)) copyFileSync(`${dir}/${f.name}`, `dist/${f.name}`);
  }
}
copy('_build/js/release/build');
for (const args of [['scripts/moon.mjs', 'info'], ['scripts/emit-types.mjs']]) {
  const step = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (step.status !== 0) process.exit(step.status ?? 1);
}
