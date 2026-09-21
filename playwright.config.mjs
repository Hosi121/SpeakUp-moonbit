import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, forbidOnly: !!process.env.CI, retries: 0,
  timeout: 45_000, use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node --env-file-if-exists=.env server/main.ts', wait: { stdout: /SpeakUp MoonBit listening on/ }, timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      env: { AUTH_MODE: 'development', DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://speakup:speakup-local-only@127.0.0.1:3308/speakup_moonbit', HOST: '127.0.0.1', PORT: '8081' } },
    { command: 'npm --prefix frontend run dev -- --host 127.0.0.1 --strictPort', wait: { stdout: /Local:.*5173/ }, timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 } },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } } }],
});
