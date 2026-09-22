import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { nativeEnv } from './native-env.mjs';

const moonHome = resolve('.tools/moon');
const env = { ...nativeEnv(), MOON_HOME: moonHome, PATH: `${moonHome}/bin:${process.env.PATH}` };
if (process.argv.includes('--mysql')) {
  env.SERVICEKIT_TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'mysql://speakup:speakup-local-only@127.0.0.1:3308/speakup_moonbit';
}
const modes = process.argv.includes('--mysql') ? ['mysql'] : ['check', 'test', 'consumer'];
for (const mode of modes) {
  const result = spawnSync(process.execPath, ['scripts/verify.mjs', mode], {
    cwd: resolve('vendor/servicekit'), env, stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
