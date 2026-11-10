import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against the PRODUCTION build (CSP active), Architecture §21.
 * Uses the system Chrome (`channel: 'chrome'`) so no browser download is needed locally;
 * GitHub's ubuntu runners ship Google Chrome too (DEC-038).
 */
export default defineConfig({
  testDir: 'apps/web/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', channel: 'chrome', viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
