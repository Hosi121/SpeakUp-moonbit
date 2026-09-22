import { spawnSync } from 'node:child_process';
import { nativeEnv } from './native-env.mjs';

for (const args of [
  ['scripts/moon.mjs', 'test', '--target', 'js', 'core/wire'],
  ['scripts/moon.mjs', 'test', '--target', 'native', 'core/wire'],
  ['scripts/build.mjs'],
  ['node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--target', 'es2022', '--module', 'nodenext', '--skipLibCheck', 'tests/js-boundary-consumer.mts'],
  ['--test', 'tests/js-boundary.test.mjs'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: nativeEnv() });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
