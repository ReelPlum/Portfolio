import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

test.describe('sharing', () => {
  test('share buttons copy the link and use plain share URLs', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await trackErrors(page);
    await page.goto('blog/hello-world/');
    const share = page.locator('[data-share]');
    await share.getByRole('button', { name: 'Copy link' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/blog\/hello-world\/$/);
    await expect(share.getByRole('status')).toHaveText('Link copied');
    await expect(share.getByRole('link', { name: /LinkedIn/ })).toHaveAttribute('href', /^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=https%3A%2F%2F.+hello-world/);
    await expect(share.getByRole('link', { name: /on X/ })).toHaveAttribute('href', /^https:\/\/x\.com\/intent\/post\?text=Hello%2C%20world/);
    await expect(share.getByRole('link', { name: /Bluesky/ })).toHaveAttribute('target', '_blank');
    errors.assertNone();
  });

  test('the system share sheet button only shows when the browser has one', async ({ page }) => {
    await page.goto('blog/hello-world/');
    const hasShare = await page.evaluate(() => Boolean(navigator.share));
    await expect(page.getByRole('button', { name: 'Share…' })).toBeVisible({ visible: hasShare });
  });

  test('the system share sheet is used when available', async ({ page }) => {
    await page.addInitScript(() => {
      window.__shared = null;
      navigator.share = async (data) => { window.__shared = data; };
    });
    await page.goto('projects/tiny-calc/');
    await page.getByRole('button', { name: 'Share…' }).click();
    expect(await page.evaluate(() => window.__shared)).toMatchObject({ title: 'Tiny Calc', url: expect.stringMatching(/projects\/tiny-calc\/$/) });
  });

  test('no third-party scripts load on posts', async ({ page }) => {
    const scripts = [];
    page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
    await page.goto('blog/hello-world/');
    await page.waitForLoadState('networkidle');
    const origin = new URL(page.url()).origin;
    expect(scripts.filter((u) => !u.startsWith(origin))).toEqual([]);
  });
});

test.describe('project status', () => {
  test('shows on the project card and page', async ({ page }) => {
    await page.goto('projects/');
    await expect(page.locator('.project-card', { hasText: 'Tiny Calc' }).locator('[data-status="active"]')).toContainText('Active');
    await page.goto('projects/tiny-calc/');
    await expect(page.locator('.article-aside [data-status="active"]')).toHaveText('Status: Active');
    await page.goto('projects/interpreter/');
    await expect(page.locator('[data-status]')).toHaveCount(0);
  });
});

test.describe('404', () => {
  test('searches for the words of the missing address', async ({ page }) => {
    const res = await page.goto('blog/tiny-calk/');
    expect(res.status()).toBe(404);
    const box = page.locator('.notfound-search');
    await expect(box.getByRole('searchbox')).toHaveValue('tiny calk');
    await expect(box.locator('.search-result').first()).toContainText('Tiny Calc');
    await expect(page.getByRole('heading', { name: 'Recent posts' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('authors', () => {
  test('posts have a byline; guest posts are labelled', async ({ page }) => {
    await page.goto('blog/hello-world/');
    await expect(page.locator('.byline')).toContainText('Frederik');
    await expect(page.locator('.guest-badge')).toHaveCount(0);
    await page.goto('blog/guest-compilers/');
    await expect(page.locator('.guest-badge')).toHaveText('Guest post');
    await page.locator('.byline').getByRole('link', { name: 'Ada Example' }).click();
    await expect(page).toHaveURL(/\/authors\/ada\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ada Example');
    await expect(page.locator('.post-list')).toContainText('A guest post about compilers');
    await expect(page.locator('.post-list')).toContainText('Writing features'); // co-written
    await expect(page.locator('.post-list')).not.toContainText('Hello, world');
  });

  test('co-written posts list every author and are not guest posts', async ({ page }) => {
    await page.goto('blog/writing-features/');
    await expect(page.locator('.byline-author')).toHaveText([/Frederik/, /Ada Example/]);
    await expect(page.locator('.guest-badge')).toHaveCount(0);
  });

  test('the authors page lists everyone who has written something', async ({ page }) => {
    await page.goto('authors/');
    await expect(page.locator('.author-row')).toHaveCount(2);
    await expect(page.locator('.author-row', { hasText: 'Ada Example' })).toContainText('2 pieces');
  });
});

test.describe('version history', () => {
  test('lists the commits that changed the post, linked to GitHub', async ({ page }) => {
    await page.goto('blog/hello-world/');
    const history = page.locator('details.history');
    await expect(history).toBeVisible();
    await expect(history.locator('.history-list')).toBeHidden();
    await history.locator('summary').click();
    const first = history.locator('.history-list li').first();
    await expect(first.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);
    await expect(first.getByRole('link', { name: /^Changes in [0-9a-f]{7}/ })).toHaveAttribute('href', /^https:\/\/github\.com\/ReelPlum\/Portfolio\/commit\/[0-9a-f]{40}#diff-[0-9a-f]{64}$/);
    await expect(first.getByRole('link', { name: 'This version' })).toHaveAttribute('href', /\/blob\/[0-9a-f]{40}\/tests\/fixtures\/content\/posts\/hello-world\.md$/);
  });
});

test.describe('CV', () => {
  test('the CV page shows the data file and offers the PDF', async ({ page, request }) => {
    const errors = await trackErrors(page);
    await page.goto('cv/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Frederik Example');
    await expect(page.getByRole('heading', { name: 'Experience' })).toBeVisible();
    await expect(page.locator('.cv-item').first()).toContainText('Compiler engineer');
    await expect(page.locator('.cv-item').first()).toContainText('Present');
    const pdf = page.getByRole('link', { name: 'Download PDF' });
    await expect(pdf).toHaveAttribute('download', '');
    const res = await request.get(await pdf.getAttribute('href'));
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('pdf');
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
    errors.assertNone();
  });

  test('the CV is in the menu', async ({ page }) => {
    await page.goto('');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'CV' }).click();
    await expect(page).toHaveURL(/\/cv\/$/);
  });

  test('printing shows only the CV', async ({ page }) => {
    await page.goto('cv/');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('.cv-download')).toBeHidden();
    await expect(page.locator('.cv h1')).toBeVisible();
  });
});

test.describe('social previews and feeds', () => {
  test('every post has its own preview image', async ({ page, request }) => {
    await page.goto('blog/hello-world/');
    const img = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(img).toMatch(/\/og\/posts\/hello-world\.png$/);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    const res = await request.get(new URL(img).pathname);
    expect(res.status()).toBe(200);
    const png = await res.body();
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  test('pages without their own image use the site card; covers win', async ({ page }) => {
    await page.goto('about/');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\/site\.png$/);
    await page.goto('projects/tiny-calc/');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/images\/tiny-calc\.svg$/);
  });

  test('the RSS feed has posts and projects, with tags and authors', async ({ request }) => {
    const xml = await (await request.get('rss.xml')).text();
    expect(xml).toContain('<title>Project: Tiny Calc</title>');
    expect(xml).toContain('<title>A guest post about compilers</title>');
    expect(xml).toContain('<category>Guest post</category>');
    expect(xml).toContain('<dc:creator>Frederik, Ada Example</dc:creator>');
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
  });

  test('no analytics script without a GoatCounter code', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('script[data-goatcounter]')).toHaveCount(0);
  });
});
