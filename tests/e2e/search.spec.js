import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

const bar = (page) => page.getByRole('search').first();

test.describe('search', () => {
  test('shows live results with matching fields highlighted', async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto('');
    const input = bar(page).getByRole('searchbox', { name: 'Search projects and posts' });
    await input.fill('interpreter');
    const results = page.locator('.search-panel .search-result');
    await expect(results.first()).toBeVisible();
    const first = results.first();
    await expect(first.locator('.search-title mark').first()).toHaveText(/interpreter/i);
    await expect(first.locator('dt')).toContainText(['Description']);
    await expect(first.locator('dd mark').first()).toHaveText(/interpreter/i);
    // Regression: result fields reused the search bar's class and were laid out as a broken flex row.
    expect(await first.locator('dd').first().evaluate((e) => getComputedStyle(e).display)).toBe('block');
    errors.assertNone();
  });

  test('highlights matching tags and content', async ({ page }) => {
    await page.goto('');
    await bar(page).getByRole('searchbox').fill('webassembly');
    const tag = page.locator('.search-panel .search-match-tags .tag mark');
    await expect(tag.first()).toHaveText(/webassembly/i);
    await bar(page).getByRole('searchbox').fill('tree-walking');
    await expect(page.locator('.search-panel .search-result').first()).toContainText('Notes on writing an interpreter');
  });

  test('renders LaTeX inside search results', async ({ page }) => {
    await page.goto('search/?q=parser');
    const result = page.locator('.search-result', { hasText: 'Notes on writing an interpreter' });
    await expect(result.locator('.search-match-body .katex').first()).toBeVisible();
    await expect(result.locator('.search-match-body')).not.toContainText('$a_1');
  });

  test('includes meaning-based results once vectors load, and says so', async ({ page }) => {
    await page.goto('search/?q=rust');
    await expect(page.locator('.search-status')).toContainText('similar meaning', { timeout: 15000 });
  });

  test('Enter opens the full results page, which keeps the query in the URL', async ({ page }) => {
    await page.goto('');
    const input = bar(page).getByRole('searchbox');
    await input.fill('calc');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/search\/\?q=calc$/);
    await expect(page.getByRole('searchbox')).toHaveValue('calc');
    await expect(page.locator('.search-result').first()).toContainText('Tiny Calc');
    await page.getByRole('searchbox').fill('rust');
    await expect(page).toHaveURL(/\?q=rust$/);
  });

  test('"/" focuses search and Escape closes the panel', async ({ page }) => {
    await page.goto('');
    await page.keyboard.press('/');
    const input = bar(page).getByRole('searchbox');
    await expect(input).toBeFocused();
    await page.keyboard.type('rust');
    await expect(page.locator('.search-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.search-panel')).toBeHidden();
  });

  test('clear button and no-results message', async ({ page }) => {
    await page.goto('search/');
    const input = page.getByRole('searchbox');
    // Regression: the clear button's display style overrode the hidden attribute, so it showed on an empty field.
    await expect(page.getByRole('button', { name: 'Clear search' })).toBeHidden();
    await input.fill('zzzzqqqq');
    await expect(page.locator('.search-status')).toContainText('No results');
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(input).toHaveValue('');
    await expect(page.locator('.search-result')).toHaveCount(0);
  });

  test('the index and vectors are published, and search is not in the sitemap', async ({ request }) => {
    const index = await (await request.get('search-index.json')).json();
    expect(index.map((d) => d.id)).toEqual(expect.arrayContaining(['projects/tiny-calc', 'blog/hello-world']));
    const hello = index.find((d) => d.id === 'blog/hello-world');
    expect(hello.body).toContain('$e^{i\\pi} + 1 = 0$');
    expect(hello.body).toContain('Tiny Calc'); // [[tiny-calc]] is indexed as its title
    const vectors = await (await request.get('search-vectors.json')).json();
    expect(vectors.chunks.length).toBeGreaterThan(index.length);
    expect(await (await request.get('sitemap-0.xml')).text()).not.toContain('/search/');
  });

  test('real embedding model gives meaning-based matches @real-model', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('search/?q=programming%20language%20implementation');
    await expect(page.locator('.search-status')).toContainText('similar meaning', { timeout: 90_000 });
    await expect(page.locator('.search-result').first()).toContainText(/interpreter/i);
  });
});
