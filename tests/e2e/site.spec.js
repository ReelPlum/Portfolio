import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

test.describe('pages', () => {
  for (const path of ['', 'projects/', 'blog/', 'about/', 'contact/', 'search/', 'blog/hello-world/', 'projects/tiny-calc/', 'projects/interpreter/']) {
    test(`/${path} renders without errors`, async ({ page }) => {
      const errors = await trackErrors(page);
      const res = await page.goto(path);
      expect(res.status()).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      errors.assertNone();
    });
  }

  test('navigation links work and mark the current page', async ({ page }) => {
    await page.goto('');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Blog' }).click();
    await expect(page).toHaveURL(/\/blog\/$/);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Blog' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Hello, world' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, world');
  });

  test('unknown pages show the 404 page', async ({ page }) => {
    const res = await page.goto('does-not-exist/');
    expect(res.status()).toBe(404);
    await expect(page.getByText('This page wandered off.')).toBeVisible();
  });

  test('every internal link resolves', async ({ page, request, baseURL }) => {
    const seen = new Set();
    for (const path of ['', 'projects/', 'blog/', 'contact/', 'blog/hello-world/']) {
      await page.goto(path);
      const hrefs = await page.$$eval('a[href^="/"], link[href^="/"]', (els) => els.map((a) => a.getAttribute('href')));
      for (const h of hrefs) seen.add(h);
    }
    const origin = new URL(baseURL).origin;
    for (const href of seen) {
      const res = await request.get(origin + href);
      expect(res.status(), href).toBe(200);
    }
  });
});

test.describe('blog content', () => {
  test('YouTube, Vimeo and images render inside posts', async ({ page }) => {
    await page.goto('blog/hello-world/');
    await expect(page.locator('figure.embed-youtube iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/aqz-KE-bpKQ/);
    await expect(page.locator('figure.embed-vimeo iframe')).toHaveAttribute('src', 'https://player.vimeo.com/video/76979871');
    const img = page.locator('.prose img[alt="Mountains at dusk"]');
    await expect(img).toBeVisible();
    expect(await img.evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  });
});

test.describe('theme follows the system', () => {
  for (const scheme of ['light', 'dark']) {
    test(`uses ${scheme} colours when the system is ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('');
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe(scheme === 'dark' ? 'rgb(19, 19, 20)' : 'rgb(255, 255, 255)');
    });
  }

  test('switches live when the system setting changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(19, 19, 20)');
  });

  test('there is no theme toggle and no avatar next to the name', async ({ page }) => {
    await page.goto('');
    await expect(page.getByRole('button', { name: /dark mode|light mode/i })).toHaveCount(0);
    await expect(page.locator('.brand')).toHaveText('Frederik');
  });
});

test.describe('animated icons, and nothing else moves', () => {
  test('icons fill in and animate when their button is hovered', async ({ page }) => {
    await page.goto('');
    const btn = page.locator('.hero-actions .btn', { hasText: 'Get in touch' });
    const icon = btn.locator('.icon');
    const fill = icon.locator('.icon-fill');
    expect(await icon.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await fill.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    await btn.hover();
    await expect.poll(() => icon.evaluate((el) => getComputedStyle(el).animationName)).toBe('icon-wiggle');
    await expect.poll(() => fill.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  });

  test('every icon on the site has an animation', async ({ page }) => {
    for (const path of ['', 'projects/tiny-calc/', 'contact/', 'search/?q=rust']) {
      await page.goto(path);
      const missing = await page.$$eval('svg.icon', (els) => els.filter((e) => !e.dataset.anim).map((e) => e.dataset.icon));
      expect(missing).toEqual([]);
    }
  });

  test('only icons animate: no transitions, scroll effects or transforms elsewhere', async ({ page }) => {
    for (const path of ['', 'blog/hello-world/', 'projects/tiny-calc/']) {
      await page.goto(path);
      await page.mouse.wheel(0, 2000);
      const moving = await page.$$eval('body *', (els) => els
        .filter((el) => !el.closest('svg.icon'))
        .filter((el) => {
          const cs = getComputedStyle(el);
          const anyTransition = cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
          return anyTransition || cs.animationName !== 'none' || (cs.transform !== 'none' && !el.closest('.katex'));
        })
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`));
      expect(moving, path).toEqual([]);
    }
  });
});

test.describe('LaTeX, references and PDFs', () => {
  test('maths renders with KaTeX', async ({ page }) => {
    await page.goto('blog/hello-world/');
    await expect(page.locator('.prose .katex').first()).toBeVisible();
    await expect(page.locator('.prose .katex-display')).toHaveCount(1);
    await expect(page.locator('.prose')).not.toContainText('$e^{i');
  });

  test('[[references]] link to posts and projects, which list what references them', async ({ page }) => {
    await page.goto('blog/hello-world/');
    await page.getByRole('link', { name: 'Tiny Calc' }).first().click();
    await expect(page).toHaveURL(/projects\/tiny-calc\/$/);
    const backlinks = page.getByRole('region', { name: 'Referenced by' });
    await expect(backlinks.getByRole('link', { name: /Hello, world/ })).toBeVisible();
  });

  test('a PDF link on its own line renders every page', async ({ page }) => {
    await page.goto('blog/hello-world/');
    const pdf = page.locator('[data-pdf]');
    await expect(pdf).toHaveAttribute('data-pages', '2', { timeout: 15000 });
    await expect(pdf.locator('canvas.pdf-page')).toHaveCount(2);
    await expect(pdf.getByRole('link', { name: 'lecture-notes.pdf' })).toHaveAttribute('href', /\/files\/lecture-notes\.pdf$/);
  });
});

test.describe('search engines', () => {
  test('pages have title, description, canonical, Open Graph and JSON-LD', async ({ page }) => {
    await page.goto('blog/hello-world/');
    await expect(page).toHaveTitle(/Hello, world/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https:\/\/.+\/blog\/hello-world\/$/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
    expect(ld['@type']).toBe('BlogPosting');
    expect(ld.headline).toBe('Hello, world');
  });

  test('content is in the HTML without JavaScript', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(test.info().project.use.baseURL);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.project-card').first()).toBeVisible();
    await expect(page.locator('.prose .katex, .project-card').first()).toBeVisible();
    await ctx.close();
  });

  test('sitemap, robots.txt and RSS are published', async ({ request }) => {
    const sitemap = await request.get('sitemap-0.xml');
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain('/blog/hello-world/');
    expect(xml).toContain('/projects/tiny-calc/');
    expect(await (await request.get('robots.txt')).text()).toMatch(/Sitemap: https:\/\/.+sitemap-index\.xml/);
    expect(await (await request.get('rss.xml')).text()).toContain('<title>Hello, world</title>');
  });
});

test.describe('contact', () => {
  test('email opens the mail program and links come from the config', async ({ page }) => {
    await page.goto('contact/');
    await expect(page.locator('.contact-row[href^="mailto:"]')).toHaveCount(1);
    await expect(page.locator('.contact-row[href="https://github.com/ReelPlum"]')).toBeVisible();
  });

  test('footer links to the site source', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('footer').getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://github.com/ReelPlum/Portfolio');
  });
});
