import { spawnSync } from 'node:child_process';
import { copyFileSync, chmodSync } from 'node:fs';
const result = spawnSync(process.execPath, ['scripts/moon.mjs', 'build', '--target', 'native', '--release', 'core/native_bench'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
copyFileSync('_build/native/release/build/native_bench/native_bench.exe', '.tools/native-bench');
chmodSync('.tools/native-bench', 0o755);
