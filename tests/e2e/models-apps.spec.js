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
    // The byline moved the viewer below the fold at 720px; drag where it actually is on screen.
    await viewer.scrollIntoViewIfNeeded();
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

test.describe('charts from CSV files', () => {
  test('line, bar and scatter charts are drawn at build time with a legend and a data table', async ({ page }) => {
    await page.goto('blog/models-and-apps/');
    const charts = page.locator('figure.plot');
    await expect(charts).toHaveCount(3);
    const line = charts.nth(0);
    await expect(line.locator('.plot-title')).toHaveText('Visitors per month');
    await expect(line.locator('.plot-legend li')).toHaveText(['Posts', 'Projects']);
    await expect(line.getByRole('img', { name: 'Visitors per month of Posts, Projects by Month' })).toBeVisible();
    expect(await line.locator('svg g.series-1 path').count()).toBeGreaterThan(0);
    expect(await line.locator('svg g.series-1 circle').count()).toBe(4);
    await expect(charts.nth(1).locator('svg g.series-1 rect')).toHaveCount(3);
    await expect(charts.nth(2).locator('svg g.series-1 circle')).toHaveCount(4);
    // The data table is there for anyone who can't read the chart.
    await line.getByText('Show the data').click();
    await expect(line.locator('.plot-data tbody tr')).toHaveCount(4);
    await expect(line.locator('.plot-data tbody tr').first()).toContainText('2026-06-01');
  });

  test('series colours change with dark mode and legend text stays in text colour', async ({ page }) => {
    const colours = {};
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('blog/models-and-apps/');
      const line = page.locator('figure.plot').first();
      colours[scheme] = await line.locator('svg g.series-1 circle').first().evaluate((c) => getComputedStyle(c).fill);
      const legendText = await line.locator('.plot-legend li').first().evaluate((li) => getComputedStyle(li).color);
      const swatch = await line.locator('.plot-swatch').first().evaluate((s) => getComputedStyle(s).backgroundColor);
      expect(legendText).not.toBe(swatch);
    }
    expect(colours.light).toBe('rgb(42, 120, 214)');
    expect(colours.dark).toBe('rgb(57, 135, 229)');
  });
});
