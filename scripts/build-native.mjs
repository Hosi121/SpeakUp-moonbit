import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { nativeEnv, nativeExecutable } from './native-env.mjs';
const result = spawnSync(process.execPath, ['scripts/moon.mjs', 'build', '--target', 'native', '--release', 'core/native_server'], { stdio: 'inherit', env: nativeEnv() });
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync('dist/native', { recursive: true });
copyFileSync('_build/native/release/build/hosi121/speakup/native_server/native_server.exe', nativeExecutable);
chmodSync(nativeExecutable, 0o755);
