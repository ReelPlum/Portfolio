import { test, expect } from '@playwright/test';

test('navigation is reachable on a phone', async ({ page }) => {
  await page.goto('');
  const menu = page.getByRole('button', { name: 'Open menu' });
  await menu.click();
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Blog' }).click();
  await expect(page).toHaveURL(/\/blog\/$/);
});

test('no horizontal scrolling', async ({ page }) => {
  for (const path of ['', 'projects/tiny-calc/', 'blog/hello-world/']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
