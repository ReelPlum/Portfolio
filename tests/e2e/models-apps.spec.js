import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

test.describe('3D models', () => {
  test('a .glb on its own line shows a model you can rotate', async ({ page }) => {
    await page.goto('blog/models-and-apps/');
    const viewer = page.locator('.embed-model model-viewer');
    await expect(viewer).toBeVisible();
    // The custom element is defined (its code loaded) and the model loads.
    await page.waitForFunction(() => customElements.get('model-viewer') !== undefined);
    await expect.poll(() => viewer.evaluate((el) => el.loaded), { timeout: 15000 }).toBe(true);
    await expect(viewer).toHaveAttribute('camera-controls', '');
    const before = await viewer.evaluate((el) => el.getCameraOrbit().theta);
    const box = await viewer.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => viewer.evaluate((el) => el.getCameraOrbit().theta)).not.toBeCloseTo(before, 2);
    await expect(page.locator('.embed-model a[download]')).toHaveAttribute('href', /models\/crystal\.glb$/);
  });

  test('pages without a model do not load the 3D viewer', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('blog/hello-world/');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => customElements.get('model-viewer'))).toBeUndefined();
    expect(requests.some((u) => /model-viewer/i.test(u))).toBe(false);
  });
});

test.describe('WebAssembly canvas apps', () => {
  test('run when Run is pressed, with init called before start(canvas)', async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto('blog/models-and-apps/');
    const app = page.locator('.embed-canvas[data-module$="spinner.js"]');
    const canvas = app.locator('canvas');
    await expect(canvas).not.toHaveAttribute('data-started', /.*/); // nothing runs on its own
    expect((await canvas.boundingBox()).height).toBeCloseTo(320, 0);
    await app.getByRole('button', { name: 'Run spinner' }).click();
    await expect(canvas).toHaveAttribute('data-started', /^\d+$/);
    await expect(app.locator('.canvas-overlay')).toBeHidden();
    const pixel = await canvas.evaluate((c) => Array.from(c.getContext('2d').getImageData(5, 5, 1, 1).data));
    expect(pixel.slice(0, 3)).toEqual([66, 133, 244]);
    errors.assertNone();
  });

  test('show the error when an app fails', async ({ page }) => {
    await page.goto('blog/models-and-apps/');
    const app = page.locator('.embed-canvas[data-module$="broken.js"]');
    await app.getByRole('button', { name: 'Run broken' }).click();
    await expect(app.getByRole('status')).toHaveText('The demo stopped with an error: adapter not found');
  });

  test('show a placeholder until the build is added', async ({ page }) => {
    await page.goto('blog/models-and-apps/');
    const soon = page.locator('.embed-canvas-soon');
    await expect(soon).toContainText('not-built-yet is coming soon');
    await expect(soon).toContainText('public/wasm/not-built-yet/');
    await expect(soon.locator('canvas')).toHaveCount(0);
  });
});

test.describe('file views', () => {
  test('a .txt file is shown as text with a copy button', async ({ page }) => {
    await page.goto('blog/models-and-apps/');
    const block = page.locator('.code-block', { hasText: 'notes.txt' });
    await expect(block.locator('.code-lang')).toHaveText('Text');
    await expect(block.locator('pre')).toContainText('Shopping list');
    await expect(block.getByRole('button', { name: 'Copy code' })).toBeVisible();
  });

  test('a .csv file is shown as a table', async ({ page }) => {
    await page.goto('blog/models-and-apps/');
    const table = page.locator('.table-block');
    await expect(table.locator('.code-lang')).toHaveText('CSV');
    await expect(table.locator('th')).toHaveText(['Name', 'Language', 'Score, out of 100']);
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await expect(table.locator('tbody tr').nth(1).locator('td').first()).toHaveText('Grace "Amazing" Hopper');
    await expect(table.locator('tbody td.num').first()).toHaveText('97');
    await expect(table.getByRole('link', { name: 'Download scores.csv' })).toHaveAttribute('download', '');
  });
});

test.describe('download links', () => {
  test('download the file when clicked, and show its size', async ({ page }) => {
    await page.goto('blog/models-and-apps/');
    const zip = page.locator('a.download-link', { hasText: 'the source' });
    await expect(zip).toHaveAttribute('download', 'tiny-calc.zip');
    await expect(zip.locator('.download-size')).toHaveText(/\d+(\.\d)? (B|KB)/);
    await expect(zip.locator('svg.icon[data-icon="download"]')).toHaveCount(1);
    const [download] = await Promise.all([page.waitForEvent('download'), zip.click()]);
    expect(download.suggestedFilename()).toBe('tiny-calc.zip');
  });

  test('a link titled "download" on its own line downloads instead of embedding', async ({ page }) => {
    await page.goto('blog/models-and-apps/');
    const notes = page.locator('a.download-link', { hasText: 'Lecture notes' });
    await expect(notes).toHaveAttribute('download', 'lecture-notes.pdf');
    await expect(page.locator('.embed-pdf')).toHaveCount(0);
    const [download] = await Promise.all([page.waitForEvent('download'), notes.click()]);
    expect(download.suggestedFilename()).toBe('lecture-notes.pdf');
  });
});

test.describe('files from other GitHub repositories', () => {
  // The build reads these from tests/fixtures/github/<owner>/<repo>/<ref>/ instead of GitHub.
  test('code, files, embeds, images and downloads are served from the site', async ({ page, request }) => {
    const errors = await trackErrors(page);
    await page.goto('blog/files-from-github/');
    const code = page.locator('.code-block', { hasText: 'main.rs (lines 1–5)' });
    await expect(code.locator('.code-lang')).toHaveText('Rust');
    await expect(code.locator('pre')).toContainText('use std::collections::HashMap;');
    await expect(page.locator('.code-block', { hasText: 'helper.js' }).locator('pre')).toContainText('answer = 42');
    await expect(page.locator('.code-block', { hasText: 'notes.txt' }).locator('pre')).toContainText('Private notes');
    await expect(page.locator('.table-block tbody tr')).toHaveCount(3);
    await expect(page.locator('.embed-pdf canvas.pdf-page').first()).toBeVisible();
    const img = page.getByRole('img', { name: 'A diagram from another repo' });
    await expect.poll(() => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.article-cover')).toHaveAttribute('src', /_github\/octo-dev\/secret-lab\/v1\/assets\/cover\.svg$/);

    const zip = page.locator('a.download-link', { hasText: 'the release' });
    await expect(zip).toHaveAttribute('download', 'release.zip');
    expect((await request.get(await zip.getAttribute('href'))).ok()).toBe(true);

    // A link in a sentence stays a link to GitHub.
    await expect(page.getByRole('link', { name: /link to the repository.s code/ })).toHaveAttribute('href', 'https://github.com/octo-dev/secret-lab/blob/v1/src/main.rs');
    errors.assertNone();
  });

  test('a wasm-bindgen app from another repository runs in a canvas', async ({ page }) => {
    await page.goto('blog/files-from-github/');
    const app = page.locator('.embed-canvas[data-module$="orbit.js"]');
    await app.getByRole('button', { name: 'Run orbit' }).click();
    const canvas = app.locator('canvas');
    await expect(canvas).toHaveAttribute('data-started', /^\d+$/);
    const pixel = await canvas.evaluate((c) => Array.from(c.getContext('2d').getImageData(5, 5, 1, 1).data));
    expect(pixel.slice(0, 3)).toEqual([52, 168, 83]);
  });

  test('a 3D model from another repository loads', async ({ page }) => {
    await page.goto('blog/files-from-github/');
    const viewer = page.locator('.embed-model model-viewer');
    await viewer.scrollIntoViewIfNeeded(); // model-viewer only loads a model once it is on screen
    await expect.poll(() => viewer.evaluate((el) => el.loaded), { timeout: 15000 }).toBe(true);
    await expect(page.locator('.embed-model a[download]')).toHaveAttribute('href', /_github\/octo-dev\/secret-lab\/v1\/assets\/gem\.glb$/);
  });
});
