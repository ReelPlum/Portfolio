import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

const PAGE = 'blog/writing-features/';

test.describe('post details', () => {
  test('the page renders without errors and shows updated date and reading time', async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto(PAGE);
    const meta = page.locator('.article-aside .meta');
    await expect(meta).toContainText('20 October 2026');
    await expect(meta.locator('.meta-updated')).toContainText('Updated 28 October 2026');
    await expect(meta.locator('.meta-updated time')).toHaveAttribute('datetime', /^2026-10-28/);
    await expect(meta).toContainText(/\d+ min read/);
    await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute('content', /^2026-10-28/);
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
    expect(ld.dateModified).toMatch(/^2026-10-28/);
    await page.locator('[data-mermaid][data-rendered]').waitFor();
    errors.assertNone();
  });

  test('drafts are not published anywhere', async ({ page, request }) => {
    expect((await page.goto('blog/draft-post/')).status()).toBe(404);
    for (const path of ['rss.xml', 'search-index.json', 'sitemap-0.xml', 'blog/']) {
      expect(await (await request.get(path)).text(), path).not.toContain('secret draft');
    }
  });

  test('related posts are listed at the end, never the page itself', async ({ page }) => {
    await page.goto(PAGE);
    const related = page.getByRole('region', { name: 'Related' });
    await expect(related.locator('a.post-row')).toHaveCount(3);
    await expect(related.locator(`a[href$="/${PAGE}"]`)).toHaveCount(0);
    await page.goto('projects/tiny-calc/');
    await expect(page.getByRole('region', { name: 'Related' }).locator('a.post-row').first()).toBeVisible();
  });
});

test.describe('callouts, footnotes and sidenotes', () => {
  test('callouts are labelled notes', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByRole('note', { name: 'Note' })).toContainText('Plain notes use the info colour.');
    await expect(page.getByRole('note', { name: 'Mind the gap' })).toBeVisible();
  });

  test('footnotes show in the margin on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(PAGE);
    const note = page.getByRole('note', { name: 'Note 1' });
    await expect(note).toBeVisible();
    await expect(note).toContainText('They evaluate the syntax tree directly.');
    const prose = await page.locator('.prose').boundingBox();
    const box = await note.boundingBox();
    expect(box.x).toBeGreaterThan(prose.x + 700); // beside the text, not in it
    await expect(page.locator('.footnotes')).toBeHidden();
  });

  test('narrow screens use the normal footnotes instead', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(PAGE);
    await expect(page.locator('.sidenote').first()).toBeHidden();
    await expect(page.locator('.footnotes')).toBeVisible();
    await page.locator('[data-footnote-ref]').first().click();
    await expect(page).toHaveURL(/#user-content-fn-simple$/);
  });
});

test.describe('maths', () => {
  test('labelled equations are numbered and references link to them', async ({ page }) => {
    await page.goto(PAGE);
    const display = page.locator('.katex-display');
    await expect(display.filter({ hasText: '(1)' }).first()).toBeVisible();
    // Regression: equation numbers were boxed in mid-line, because pages were rendered by an older KaTeX
    // (class "tag", which the site's tag chips also use) than the stylesheet (".katex-tag").
    const number = display.locator('.katex-tag').first();
    expect(await number.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px');
    const right = await display.first().evaluate((el) => el.getBoundingClientRect().right);
    const nb = await number.boundingBox();
    expect(nb.x + nb.width).toBeGreaterThan(right - 4); // at the right edge, like LaTeX
    await expect(page.locator('.prose')).not.toContainText('label');
    await page.locator('a.math-ref', { hasText: '(2)' }).click();
    await expect(page).toHaveURL(/#ref-half$/);
    await expect(page.locator('#ref-pyth')).toContainText('Theorem 1');
    await expect(page.locator('a.math-ref[href="#ref-pyth"]')).toHaveText('1');
  });

  test('citations link to the generated bibliography', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByRole('heading', { name: 'References' })).toBeVisible();
    const items = page.locator('ol.bibliography li');
    await expect(items).toHaveCount(3);
    await expect(items.first()).toContainText('Knuth');
    await page.locator('a.citation-link', { hasText: '3' }).click();
    await expect(page).toHaveURL(/#cite-turing1936$/);
  });
});

test.describe('diagrams and diffs', () => {
  test('mermaid diagrams render and follow the colour scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(PAGE);
    const fig = page.locator('[data-mermaid]');
    await expect(fig).toHaveAttribute('data-rendered', 'true');
    await expect(fig.getByRole('img', { name: 'Pipeline' })).toBeVisible();
    await expect(fig.locator('.mermaid-source')).toBeHidden();
    const light = await fig.locator('svg').innerHTML();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => fig.locator('svg').innerHTML()).not.toBe(light);
  });

  test('without JavaScript the diagram source is shown', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(new URL(PAGE, test.info().project.use.baseURL).href);
    await expect(page.locator('.mermaid-source')).toContainText('A[Source] --> B[Lexer]');
    await ctx.close();
  });

  test('diffs switch between side by side and one column', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(PAGE);
    const diff = page.locator('[data-diff]').nth(1);
    await expect(diff.locator('.code-lang')).toHaveText('Rust');
    await expect(diff.locator('.diff-view-split')).toBeVisible();
    await expect(diff.locator('.diff-split tr').filter({ hasText: 'sum = {x}' })).toContainText('println!("{}", x);');
    await diff.getByRole('button', { name: 'Unified' }).click();
    await expect(diff.getByRole('button', { name: 'Unified' })).toHaveAttribute('aria-pressed', 'true');
    await expect(diff.locator('.diff-view-split')).toBeHidden();
    await expect(diff.locator('.diff-unified tr.diff-add')).toHaveCount(3);
    await expect(diff.locator('.diff-unified tr.diff-del')).toHaveCount(2);
  });

  test('diffs start as one column on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(PAGE);
    await expect(page.locator('[data-diff]').first()).toHaveAttribute('data-view', 'unified');
  });
});

test.describe('navigation inside a post', () => {
  test('heading links go to the section and copy its address', async ({ page, context, browserName }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(PAGE);
    const heading = page.getByRole('heading', { name: 'Diffs' });
    await heading.hover();
    const anchor = heading.getByRole('link', { name: 'Copy link to “Diffs”' });
    await expect(anchor).toBeVisible();
    await anchor.click();
    await expect(page).toHaveURL(/#diffs$/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/blog\/writing-features\/#diffs$/);
    await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toHaveCount(1);
  });

  test('on narrow screens "On this page" is a collapsible menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(PAGE);
    const menu = page.locator('details.toc-mobile');
    await expect(menu).toBeVisible();
    await expect(page.locator('nav.toc')).toBeHidden();
    await expect(menu.getByRole('link', { name: 'Citations' })).toBeHidden();
    await menu.locator('summary').click();
    await menu.getByRole('link', { name: 'Citations' }).click();
    await expect(page).toHaveURL(/#citations$/);
  });

  test('wide screens keep the side column instead', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(PAGE);
    await expect(page.locator('details.toc-mobile')).toBeHidden();
    await expect(page.locator('nav.toc')).toBeVisible();
    // The hidden "Footnotes" label of the footnote list is not a section; only the post's own heading is listed.
    await expect(page.locator('nav.toc').getByRole('link', { name: 'Footnotes' })).toHaveCount(1);
  });
});

test.describe('images', () => {
  test('before / after slider moves with the keyboard', async ({ page }) => {
    await page.goto(PAGE);
    const fig = page.locator('[data-compare]');
    const range = fig.getByRole('slider', { name: 'Slide to compare Flat and Lit' });
    await range.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await expect(range).toHaveValue('60');
    await expect.poll(() => fig.evaluate((el) => el.style.getPropertyValue('--pos'))).toBe('60%');
    await expect(range).toHaveAttribute('aria-valuetext', '60% Lit');
    await page.keyboard.press('Home');
    await expect.poll(() => fig.evaluate((el) => el.style.getPropertyValue('--pos'))).toBe('0%');
  });

  test('before / after slider follows a drag', async ({ page }) => {
    await page.goto(PAGE);
    const frame = page.locator('.compare-frame');
    await frame.scrollIntoViewIfNeeded();
    // The images load lazily; measure once they have, so the frame has its final size.
    await expect.poll(() => frame.locator('img').evaluateAll((imgs) => imgs.every((i) => i.complete && i.naturalWidth > 0))).toBe(true);
    const box = await frame.boundingBox();
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
    const pos = await page.locator('[data-compare]').evaluate((el) => parseFloat(el.style.getPropertyValue('--pos')));
    expect(pos).toBeGreaterThan(15);
    expect(pos).toBeLessThan(35);
  });

  test('clicking an image opens it full screen with arrows, swipe and Escape', async ({ page }) => {
    await page.goto(PAGE);
    const first = page.getByRole('button', { name: 'Open image: First picture' });
    await first.click();
    const dialog = page.getByRole('dialog', { name: 'Image viewer' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.lightbox-caption')).toHaveText('First picture');
    await expect(dialog.locator('.lightbox-count')).toHaveText('1 of 2');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('.lightbox-caption')).toHaveText('Second picture');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('.lightbox-caption')).toHaveText('First picture');
    // Swipe left goes to the next image.
    const box = await dialog.locator('.lightbox-img').boundingBox();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 100, box.y + 20);
    await page.mouse.up();
    await expect(dialog.locator('.lightbox-caption')).toHaveText('Second picture');
    // A swipe that ends over the dark area must not close the viewer; a plain click there does.
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(20, 300);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    const vp = page.viewportSize();
    await page.mouse.click(vp.width / 2, vp.height - 12);
    await expect(dialog).toBeHidden();
    await first.click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open image: Second picture' })).toBeFocused();
  });

  test('images in the before / after slider do not open the lightbox', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('.compare img.lightbox-trigger')).toHaveCount(0);
  });
});

test.describe('sliders', () => {
  test('moving a slider updates values, formulas and the plot', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('html')).toHaveAttribute('data-live-vars', 'ready');
    const amp = page.getByRole('slider', { name: /Amplitude/ });
    const plot = page.locator('[data-fnplot] path.fn-line');
    const before = await plot.getAttribute('d');
    await expect(page.locator('.live-value').first()).toHaveText('2');
    await amp.focus();
    await page.keyboard.press('ArrowRight');
    await expect(amp).toHaveValue('2.5');
    await expect(page.locator('output[data-live-expr="a"]')).toHaveText('2.5');
    await expect(page.locator('.live-value[data-live-expr="a"]')).toHaveText('2.5');
    await expect(page.locator('.live-value[data-live-expr="2*a"]')).toHaveText('5');
    await expect(page.locator('.live-math .katex-mathml')).toContainText('2.5');
    await expect.poll(() => plot.getAttribute('d')).not.toBe(before);
    await page.getByRole('slider', { name: /Frequency/ }).fill('3');
    await expect(page.locator('.live-math .katex-mathml')).toContainText('3');
  });
});

test.describe('snippets', () => {
  test('shared snippets are part of the post', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('.prose code', { hasText: 'cargo add tiny-calc' })).toBeVisible();
    await expect(page.getByRole('note', { name: 'Thanks for reading' })).toBeVisible();
  });
});
