import { spawnSync } from 'node:child_process';
import { nativeEnv } from './native-env.mjs';
const result = spawnSync(
  process.execPath,
  [
    'scripts/moon.mjs',
    'test',
    '--target',
    'native',
    'core/shared',
    'core/api',
    'core/signaling',
    'core/matching',
    'core/conversation',
    'core/friendship',
    'core/thread',
    'core/presenter',
    'core/shell',
    'core/wire',
    'core/native_host',
  ],
  { stdio: 'inherit', env: nativeEnv() },
);
process.exit(result.status ?? 1);
