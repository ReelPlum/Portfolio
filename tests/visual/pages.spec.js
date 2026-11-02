import { test, expect } from '@playwright/test';

// The pages that are compared, by name (the baseline file names) and path.
export const PAGES = {
  home: '',
  blog: 'blog/',
  post: 'blog/hello-world/',
  'writing-features': 'blog/writing-features/',
  'models-and-apps': 'blog/models-and-apps/',
  'guest-post': 'blog/guest-compilers/',
  projects: 'projects/',
  project: 'projects/tiny-calc/',
  cv: 'cv/',
  about: 'about/',
  search: 'search/?q=calculator',
  'not-found': 'this-page-does-not-exist/',
};

/**
 * Makes a page look the same on every run: third-party requests blocked, every lazy image and embed
 * loaded, fonts ready, and nothing that changes between commits or runs on screen.
 */
async function settle(page) {
  // Nothing from other sites: the screenshots must not depend on them being up (or on what they show).
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  // Scroll through once, so everything that waits to be near the screen (images, PDFs, diagrams) loads.
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  });
  // Client-drawn parts must be finished.
  await page.locator('[data-mermaid]:not([data-rendered])').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  for (const pdf of await page.locator('[data-pdf]').all()) await expect(pdf).toHaveAttribute('data-pages', /\d+/, { timeout: 15_000 });
  if (await page.locator('[data-live-vars]').count()) await expect(page.locator('html')).toHaveAttribute('data-live-vars', 'ready');
  expect(await page.evaluate(() => document.fonts.check('16px "Roboto Flex Variable"'))).toBe(true);
}

// Parts that are different on every commit or every run, covered by their own tests elsewhere.
const masks = (page) => [
  page.locator('.history'), // commit list and dates from git
  page.locator('.embed-model'), // WebGL rendering differs from GPU to GPU
  page.locator('.embed-canvas canvas'),
  page.locator('.footer-year'), // changes every January
];

for (const [name, path] of Object.entries(PAGES)) {
  test(name, async ({ page }, testInfo) => {
    await page.goto(path);
    await settle(page);
    // 4K pages are compared above the fold only: full-length 4K screenshots are huge, and the layout below
    // is the same as at 1080p.
    const fullPage = !testInfo.project.name.startsWith('4k');
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage, mask: masks(page), maskColor: '#888888' });
  });
}
