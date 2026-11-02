import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

// Projects and blog posts are all posts in tests/fixtures/content/posts; `tags` in site.config.js decides where they show.
test.describe('tags drive pages and feeds', () => {
  test('the home page shows the feeds from the config, without repeating the featured project', async ({ page }) => {
    await page.goto('');
    const titles = await page.locator('.section .section-header h2').allTextContents();
    expect(titles).toEqual(['Featured', 'Projects', 'Latest writing']);
    const section = (name) => page.locator('.section').filter({ has: page.getByRole('heading', { level: 2, name, exact: true }) });
    await expect(section('Featured').locator('.project-card--large')).toHaveCount(1);
    await expect(section('Featured')).toContainText('My Interpreter');
    await expect(section('Projects')).toContainText('Tiny Calc');
    await expect(section('Projects')).not.toContainText('My Interpreter');
    await expect(section('Projects').getByRole('link', { name: 'See all' })).toHaveAttribute('href', /\/projects\/$/);
    await expect(section('Latest writing').locator('.post-row')).toHaveCount(4);
    await expect(section('Latest writing')).not.toContainText('My desk setup'); // not tagged blog
  });

  test('the Projects page lists posts tagged project as cards, and the Blog page posts tagged blog', async ({ page }) => {
    await page.goto('projects/');
    await expect(page.locator('.project-card h3')).toHaveText(['My Interpreter', 'Tiny Calc']);
    await page.goto('blog/');
    await expect(page.locator('.post-row-title')).toHaveText(['Hello, world', 'Notes on writing an interpreter in Rust', 'Running Rust in the browser with WASI', 'Models and apps']);
  });

  test('tags on a post link to their page', async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto('projects/tiny-calc/');
    const tags = page.locator('.article-aside .tags');
    await expect(tags.getByRole('link', { name: 'project' })).toHaveAttribute('href', /\/projects\/$/);
    await tags.getByRole('link', { name: 'Rust' }).click();
    await expect(page).toHaveURL(/\/tags\/rust\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tagged “Rust”');
    await expect(page.locator('.post-row-title')).toHaveText(['Notes on writing an interpreter in Rust', 'My Interpreter', 'Running Rust in the browser with WASI', 'Tiny Calc']);
    // Projects and posts in one list, each with the icon of its page
    await expect(page.locator('.post-row').filter({ hasText: 'Tiny Calc' }).locator('[data-icon="code"]')).toHaveCount(1);
    await expect(page.locator('.post-row').filter({ hasText: 'Running Rust' }).locator('[data-icon="article"]')).toHaveCount(1);
    errors.assertNone();
  });

  test('/tags/ lists every tag with how many posts use it', async ({ page }) => {
    await page.goto('tags/');
    const rust = page.locator('.tag-cloud a').filter({ hasText: 'Rust' });
    await expect(rust).toHaveText('Rust4');
    await expect(rust).toHaveAttribute('href', /\/tags\/rust\/$/);
    // "Meta" and "meta" are one tag
    await expect(page.locator('.tag-cloud a').filter({ hasText: /^meta/i })).toHaveCount(1);
    await expect(page.locator('.tag-cloud a').filter({ hasText: 'project' })).toHaveAttribute('href', /\/projects\/$/);
  });

  test('a post on no page lives at /posts/<name>/ and is still on its tag pages', async ({ page }) => {
    await page.goto('posts/my-desk-setup/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My desk setup');
    await expect(page.locator('.back-link')).toHaveText('Home');
    await page.goto('tags/tools/');
    await expect(page.locator('.post-row-title')).toHaveText(['My desk setup']);
    await page.goto('blog/');
    await expect(page.locator('.post-row-title')).not.toContainText(['My desk setup']);
  });

  test('a post links back to the page it lives under', async ({ page }) => {
    await page.goto('blog/hello-world/');
    await expect(page.locator('.back-link')).toHaveText('Blog');
    await expect(page.locator('.back-link')).toHaveAttribute('href', /\/blog\/$/);
    await page.goto('projects/tiny-calc/');
    await expect(page.locator('.back-link')).toHaveText('Projects');
  });

  test('RSS and search include projects with their real address', async ({ request }) => {
    const rss = await (await request.get('rss.xml')).text();
    expect(rss).toMatch(/<link>[^<]*\/projects\/tiny-calc\/<\/link>/);
    expect(rss).toMatch(/<link>[^<]*\/posts\/my-desk-setup\/<\/link>/);
    const index = await (await request.get('search-index.json')).json();
    const calc = index.find((d) => d.id === 'posts/tiny-calc');
    expect(calc).toMatchObject({ type: 'Project', icon: 'code' });
    expect(calc.url).toMatch(/\/projects\/tiny-calc\/$/);
    expect(index.find((d) => d.id === 'posts/hello-world').type).toBe('Post');
  });
});
