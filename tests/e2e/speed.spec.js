import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

const THIRD_PARTY = /youtube-nocookie\.com|player\.vimeo\.com|ytimg\.com|vimeocdn\.com/;

test.describe('lazy embeds', () => {
  test('YouTube and Vimeo load nothing until play is pressed, then play straight away', async ({ page }) => {
    const errors = await trackErrors(page);
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('blog/hello-world/');
    await page.waitForLoadState('networkidle');
    expect(requests.filter((u) => THIRD_PARTY.test(u))).toEqual([]);

    const youtube = page.locator('figure.embed-youtube');
    await expect(youtube.locator('iframe')).toHaveCount(0);
    await youtube.getByRole('button', { name: 'Play YouTube video (loads YouTube)' }).click();
    const player = youtube.locator('iframe');
    await expect(player).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1');
    await expect(player).toHaveAttribute('title', 'YouTube video');
    await expect(youtube.locator('.embed-facade')).toHaveCount(0);
    await expect(player).toBeFocused();

    // Keyboard works too: the play button is a real button.
    const vimeo = page.locator('figure.embed-vimeo');
    await vimeo.getByRole('button', { name: /Play Vimeo video/ }).focus();
    await page.keyboard.press('Enter');
    await expect(vimeo.locator('iframe')).toHaveAttribute('src', 'https://player.vimeo.com/video/76979871?autoplay=1');
    errors.assertNone();
  });

  test('the play button keeps the 16:9 space, so nothing jumps when the player loads', async ({ page }) => {
    await trackErrors(page);
    await page.goto('blog/hello-world/');
    const figure = page.locator('figure.embed-youtube');
    const before = await figure.boundingBox();
    expect(before.width / before.height).toBeCloseTo(16 / 9, 1);
    await figure.locator('.embed-facade').click();
    const after = await figure.boundingBox();
    expect(after.height).toBeCloseTo(before.height, 0);
  });

  test('the PDF renderer loads only when the PDF comes near the screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('blog/hello-world/');
    await page.waitForLoadState('networkidle');
    const pdf = page.locator('[data-pdf]');
    // Precondition: the PDF starts well below the 600px look-ahead.
    expect((await pdf.boundingBox()).y).toBeGreaterThan(500 + 600);
    expect(requests.some((u) => /pdf\.worker|pdf-viewer/.test(u))).toBe(false);
    await pdf.scrollIntoViewIfNeeded();
    await expect(pdf).toHaveAttribute('data-pages', /\d+/);
  });

  test('3D models are shown from the compressed copy, and download the original', async ({ page }) => {
    await page.goto('blog/models-and-apps/');
    const viewer = page.locator('.embed-model model-viewer');
    await expect(viewer).toHaveAttribute('src', /\/_opt\/models\/crystal\.glb$/);
    await expect(viewer).toHaveAttribute('loading', 'lazy');
    await expect(page.locator('.embed-model a[download]')).toHaveAttribute('href', /\/models\/crystal\.glb$/);
    const res = await page.request.get(await viewer.getAttribute('src'));
    expect(res.status()).toBe(200);
  });
});

test.describe('responsive images', () => {
  test('the browser picks a modern format in a size that fits, and later images wait until scrolled to', async ({ page }) => {
    await page.goto('blog/hello-world/');
    const first = page.locator('.prose img').first();
    await expect(first).toHaveAttribute('loading', 'eager');
    await expect(first).toHaveAttribute('fetchpriority', 'high');
    const sphere = page.locator('.prose img[alt="A lit sphere"]');
    await expect(sphere).toHaveAttribute('loading', 'lazy');
    await expect(sphere).toHaveAttribute('width', '960');
    await sphere.scrollIntoViewIfNeeded();
    await expect.poll(() => sphere.evaluate((i) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
    const src = await sphere.evaluate((i) => i.currentSrc);
    expect(src).toMatch(/\/_img\/[0-9a-f]{12}-(480|800|960)\.avif$/);
    // The original is still there for anyone who opens or saves it.
    expect((await page.request.get(await sphere.getAttribute('src'))).headers()['content-type']).toBe('image/png');
  });

  test('images have their size before they load, so the page does not jump', async ({ page }) => {
    await page.goto('blog/hello-world/');
    const sizes = await page.locator('.prose img').evaluateAll((imgs) => imgs.map((i) => [i.getAttribute('width'), i.getAttribute('height')]));
    for (const [w, h] of sizes) {
      expect(Number(w)).toBeGreaterThan(0);
      expect(Number(h)).toBeGreaterThan(0);
    }
  });

  test('before/after sliders use the small modern files too', async ({ page }) => {
    await page.goto('blog/writing-features/');
    const after = page.locator('.compare img.compare-after');
    await after.scrollIntoViewIfNeeded();
    await expect.poll(() => after.evaluate((i) => i.currentSrc)).toMatch(/\.avif$/);
    await expect(page.locator('.compare source[type="image/webp"]')).toHaveCount(2);
  });
});
