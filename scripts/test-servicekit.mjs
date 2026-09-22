import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeEnv } from './native-env.mjs';

function run(args, env = nativeEnv()) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.status !== 0) throw new Error(`Servicekit check failed: ${args.join(' ')}`);
}
if (process.argv.includes('--mysql')) {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'mysql://speakup:speakup-local-only@127.0.0.1:3308/speakup_moonbit');
  run(['scripts/moon.mjs', 'build', '--target', 'native', '--release', 'examples/servicekit/src/check_mysql']);
  const env = { ...nativeEnv(), SERVICEKIT_MYSQL_HOST: url.hostname, SERVICEKIT_MYSQL_PORT: url.port || '3306', SERVICEKIT_MYSQL_USER: decodeURIComponent(url.username), SERVICEKIT_MYSQL_PASSWORD: decodeURIComponent(url.password), SERVICEKIT_MYSQL_DATABASE: decodeURIComponent(url.pathname.slice(1)) };
  const result = spawnSync('_build/native/release/build/hosi121/servicekit_example/check_mysql/check_mysql.exe', [], { stdio: 'inherit', env, timeout: 30000 });
  if (result.status !== 0) throw new Error('Standalone MySQL consumer failed');
} else {
  run(['scripts/moon.mjs', 'test', '--target', 'js', 'packages/servicekit/src/wire']);
  run(['scripts/moon.mjs', 'test', '--target', 'native', 'packages/servicekit/src/wire']);
  run(['scripts/build.mjs']);
  run(['node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--target', 'es2022', '--module', 'nodenext', '--skipLibCheck', 'tests/servicekit/consumer.mts']);
  run(['--test', 'tests/servicekit-contract.test.mjs']);
  run(['scripts/moon.mjs', 'build', '--target', 'native', '--release', 'examples/servicekit/src/server']);
  run(['--test', 'tests/servicekit/native.test.mjs']);
  // Prove module independence: copy only the library and consumer out of this
  // repository, without core/, root moon.mod, or SpeakUp's package imports.
  const dir = mkdtempSync(join(tmpdir(), 'servicekit-independent-'));
  const moonHome = resolve('.tools/moon');
  try {
    cpSync('packages/servicekit', join(dir, 'library'), { recursive: true });
    cpSync('examples/servicekit', join(dir, 'consumer'), { recursive: true });
    writeFileSync(join(dir, 'moon.work'), 'members = ["library", "consumer"]\n');
    for (const target of ['native', 'js']) {
      const result = spawnSync(join(moonHome, 'bin/moon'), ['check', '--target', target], { cwd: dir, env: { ...nativeEnv(), MOON_HOME: moonHome, PATH: `${moonHome}/bin:${process.env.PATH}` }, stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`Independent ${target} consumer failed`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
