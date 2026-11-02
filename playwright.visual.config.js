// Visual regression tests: npm run test:visual. Screenshots of the main pages in light and dark mode at
// phone, 1080p and 4K sizes are compared with the committed baselines in tests/visual/baselines/.
//
// Baselines are made in the official Playwright Docker image (the same one CI uses), so fonts and
// rendering match exactly. To update them after an intended change, run the "Visual" workflow on your
// branch with "update" ticked (it commits the new screenshots), or locally:
//   docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.64.1-noble \
//     sh -c "npm ci && npm run test:visual -- --update-snapshots"
import { defineConfig, devices } from '@playwright/test';
import site from './site.config.js';

const PORT = 4323;
const base = process.env.BASE_PATH || site.base;

const sizes = {
  phone: { ...devices['Pixel 7'] },
  '1080p': { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  '4k': { viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 },
};

export default defineConfig({
  testDir: 'tests/visual',
  snapshotPathTemplate: 'tests/visual/baselines/{arg}-{projectName}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // a visual difference is never "flaky": it's a real change or a test that needs stabilising
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixelRatio: 0.001, threshold: 0.2 },
  },
  use: {
    baseURL: `http://localhost:${PORT}${base}`,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: Object.entries(sizes).flatMap(([size, use]) => ['light', 'dark'].map((colorScheme) => ({
    name: `${size}-${colorScheme}`,
    use: { ...devices['Desktop Chrome'], ...use, colorScheme },
  }))),
  webServer: {
    command: `npm run build && npx astro preview --port ${PORT} --ignore-lock`,
    env: { CONTENT_DIR: 'tests/fixtures/content', SEARCH_EMBEDDINGS: 'hash' },
    url: `http://localhost:${PORT}${base}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
