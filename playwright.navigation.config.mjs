import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/navigation', workers: 1, forbidOnly: !!process.env.CI, retries: 0,
  timeout: 30_000, use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm --prefix frontend run preview -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174/login', timeout: 30_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: [
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ] } } }],
});
