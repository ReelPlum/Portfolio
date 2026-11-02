import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import site from '../../site.config.js';
import { checkSite } from '../../src/lib/link-check.js';

// The site the browser tests run against is built into dist/ first (playwright.config.js).
test('no broken links, images or embeds anywhere in the built site', async () => {
  const { errors, stats } = await checkSite({ dist: resolve('dist'), base: process.env.BASE_PATH || site.base, site: site.url });
  expect(errors, errors.join('\n')).toEqual([]);
  expect(stats.pages).toBeGreaterThan(10);
  expect(stats.internal).toBeGreaterThan(300);
});

// Regression: the 404 page's canonical link pointed at /404/, which doesn't exist.
test('pages that are not indexed have no canonical link', async ({ page }) => {
  await page.goto('this-page-does-not-exist/');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await page.goto('search/');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await page.goto('blog/hello-world/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/blog\/hello-world\/$/);
});
