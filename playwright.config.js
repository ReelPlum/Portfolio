import { defineConfig, devices } from '@playwright/test';
import site from './site.config.js';

const PORT = 4321;
const base = process.env.BASE_PATH || site.base;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${base}`,
    trace: 'on-first-retry',
    // Set PW_CHROMIUM to use an already-installed Chromium instead of `npx playwright install`.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.js/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.js/ },
  ],
  webServer: {
    command: `npm run build && npx astro preview --port ${PORT} --ignore-lock`,
    env: { CONTENT_DIR: 'tests/fixtures/content' },
    url: `http://localhost:${PORT}${base}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
