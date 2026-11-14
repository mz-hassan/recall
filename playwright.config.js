import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/lecture/e2e', testMatch: '**/*.spec.js',
  fullyParallel: false, workers: 1, retries: process.env.CI ? 1 : 0, timeout: 30_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 800 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node src/lecture/e2e/start-server.mjs', url: 'http://127.0.0.1:4175',
    reuseExistingServer: false, timeout: 30_000,
  },
});
