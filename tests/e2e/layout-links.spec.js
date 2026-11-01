import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

test.describe('links to other sites', () => {
  test('markdown links to other sites open in a new tab; links within the site do not', async ({ page }) => {
    await page.goto('blog/hello-world/');
    const ext = page.locator('.prose a[href="https://astro.build"]');
    await expect(ext).toHaveAttribute('target', '_blank');
    await expect(ext).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(ext.locator('svg.icon')).toHaveCount(1);
    await expect(ext).toContainText('(opens in a new tab)'); // for screen readers (visually hidden)
    const internal = page.locator('.prose a.ref-link').first();
    await expect(internal).not.toHaveAttribute('target', /.*/);
  });

  test('clicking a link to another site opens a new tab and keeps this page', async ({ page, context }) => {
    await context.route(/astro\.build/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Astro</title>' }));
    await page.goto('blog/hello-world/');
    const [popup] = await Promise.all([context.waitForEvent('page'), page.locator('.prose a[href="https://astro.build"]').click()]);
    await expect(popup).toHaveURL('https://astro.build/');
    await expect(page).toHaveURL(/blog\/hello-world\/$/);
  });

  test('footer has social buttons that open in a new tab', async ({ page }) => {
    await page.goto('');
    const social = page.getByRole('navigation', { name: 'Social' });
    for (const name of ['GitHub', 'LinkedIn']) {
      const link = social.getByRole('link', { name: new RegExp(name) });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link.locator('svg.icon')).toHaveCount(1);
    }
  });

  test('contact page lists LinkedIn; email opens the mail app, not a new tab', async ({ page }) => {
    await page.goto('contact/');
    await expect(page.locator('.contact-row', { hasText: 'LinkedIn' })).toHaveAttribute('target', '_blank');
    const mail = page.locator('.contact-row[href^="mailto:"]');
    await expect(mail).not.toHaveAttribute('target', /.*/);
  });
});

test.describe('LaTeX preamble', () => {
  test('macros from a post\'s preamble work in every formula of that post', async ({ page }) => {
    await page.goto('blog/hello-world/');
    await expect(page.locator('.prose')).not.toContainText('newcommand');
    await expect(page.locator('.prose .katex').filter({ hasText: 'text in a box' })).toHaveCount(1);
    const errors = await page.locator('.prose .katex-error, .prose .katex [style*="cc0000"]').count();
    expect(errors).toBe(0);
  });

  test('macros do not leak into other posts', async ({ page }) => {
    await page.goto('blog/compiling-rust-to-wasm/');
    await expect(page.locator('.prose .katex [style*="cc0000"]').first()).toBeVisible();
  });

  test('search results use the post\'s macros too', async ({ page }) => {
    await page.goto('search/?q=vector');
    const result = page.locator('.search-result', { hasText: 'Hello, world' });
    await expect(result.locator('.search-match-body .katex').first()).toBeVisible();
    expect(await result.locator('.katex-error, .katex [style*="cc0000"]').count()).toBe(0);
  });
});

test.describe('wide screens', () => {
  for (const [w, h] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
    test(`uses the width of a ${w}×${h} screen without horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const errors = await trackErrors(page);
      for (const path of ['', 'projects/', 'blog/hello-world/', 'projects/tiny-calc/']) {
        await page.goto(path);
        const { scrollW, clientW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
        expect(scrollW, path).toBeLessThanOrEqual(clientW);
      }
      await page.goto('');
      // The page content spans most of the screen instead of a narrow centred column.
      const main = await page.locator('main.container').evaluate((el) => {
        const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        return { width: el.getBoundingClientRect().width * zoom, viewport: window.innerWidth };
      });
      expect(main.width / main.viewport).toBeGreaterThan(0.75);
      errors.assertNone();
    });
  }

  test('posts show details and "On this page" in a side column on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('blog/hello-world/');
    const aside = page.locator('.article-aside');
    const prose = page.locator('.prose');
    await expect(aside.getByRole('navigation', { name: 'On this page' })).toBeVisible();
    const a = await aside.boundingBox();
    const p = await prose.boundingBox();
    expect(a.x).toBeGreaterThan(p.x + p.width);
    // Prose keeps a readable line length.
    expect(p.width).toBeLessThanOrEqual(900);
    await aside.getByRole('link', { name: 'Maths' }).click();
    await expect(page).toHaveURL(/#maths$/);
  });

  test('on a laptop-sized screen the details follow the title and the contents list is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('blog/hello-world/');
    await expect(page.locator('.toc')).toBeHidden();
    const header = await page.locator('.article-header').boundingBox();
    const aside = await page.locator('.article-aside').boundingBox();
    expect(aside.y).toBeGreaterThan(header.y + header.height - 1);
  });
});

test.describe('code blocks', () => {
  test('show the language, file name and highlighted code, including code from a file', async ({ page, request, baseURL }) => {
    await page.goto('blog/hello-world/');
    const blocks = page.locator('.prose .code-block');
    await expect(blocks).toHaveCount(4);
    await expect(blocks.locator('.code-lang')).toHaveText(['Rust', 'JavaScript', 'notalanguage', 'Rust']);
    await expect(blocks.nth(1).locator('.code-title')).toHaveText('greet.js');
    const included = blocks.nth(3);
    await expect(included.locator('.code-title')).toHaveText('main.rs (lines 27–43)');
    await expect(included.locator('pre')).toContainText('fn exec(line: &str');
    await expect(included.locator('pre')).not.toContainText('fn main()');
    // Highlighted: tokens carry colours.
    expect(await blocks.first().locator('pre span[style*="color"]').count()).toBeGreaterThan(3);
    // The file name links to the raw file.
    const href = await included.locator('a.code-title').getAttribute('href');
    expect((await request.get(new URL(href, baseURL).href)).status()).toBe(200);
  });

  test('the copy button copies the code and confirms', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('blog/hello-world/');
    const block = page.locator('.prose .code-block').nth(1);
    await block.getByRole('button', { name: 'Copy code' }).click();
    await expect(block.locator('.code-copy')).toHaveClass(/is-copied/);
    await expect(block.getByRole('status')).toHaveText('Copied to clipboard');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('export const greet = (name) => `Hello, ${name}!`;');
  });

  test('code is readable in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('blog/hello-world/');
    const color = await page.locator('.prose .code-block pre span[style]').first().evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = color.match(/\d+/g).map(Number);
    expect((r + g + b) / 3).toBeGreaterThan(110); // light text on the dark background
  });
});
