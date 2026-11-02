import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

const POST = 'posts/product-review/';
const box = (page) => page.locator('[data-product]').first();
const visibleStores = (page) => box(page).locator('.product-offer:visible .product-store').allTextContents();

test.describe('reader in Denmark', () => {
  test.use({ timezoneId: 'Europe/Copenhagen', locale: 'da-DK' });

  test('shows only the Danish store, with the price in Danish format', async ({ page }) => {
    const errors = await trackErrors(page);
    await page.goto(POST);
    await expect(box(page).locator('select[data-product-region]')).toHaveValue('DK');
    expect(await visibleStores(page)).toEqual(['Nordic Shop']);
    await expect(box(page).locator('.product-offer:visible .product-price')).toHaveText(/2\.499\skr\./);
    // The store link is a sponsored affiliate link that opens in a new tab.
    const link = box(page).locator('.product-offer:visible a.product-buy');
    await expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(box(page).locator('.product-disclosure')).toContainText('affiliate links');
    errors.assertNone();
  });

  test('picking another country changes every box and is remembered', async ({ page }) => {
    await page.goto(POST);
    await box(page).locator('select[data-product-region]').selectOption('GB');
    expect(await visibleStores(page)).toEqual(['UK Audio']);
    // The shared keyboard ships worldwide, so it is still listed in the second box.
    await expect(page.locator('[data-product]').nth(1).locator('.product-offer:visible .product-store')).toHaveText(['Keyco Store']);
    await page.reload();
    await expect(box(page).locator('select[data-product-region]')).toHaveValue('GB');
    await box(page).locator('select[data-product-region]').selectOption('all');
    expect(await visibleStores(page)).toHaveLength(4);
  });
});

test.describe('reader in Germany', () => {
  test.use({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });

  test('gets the Amazon.de link built from the ASIN, with no price shown', async ({ page }) => {
    await page.goto(POST);
    expect(await visibleStores(page)).toEqual(['Amazon.de']);
    const offer = box(page).locator('.product-offer:visible');
    await expect(offer.locator('a.product-buy')).toHaveAttribute('href', /^https:\/\/www\.amazon\.de\/dp\/B0TESTASIN/);
    await expect(offer.locator('.product-price')).toHaveText('See price');
  });
});

test.describe('reader in Japan', () => {
  test.use({ timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });

  test('sees every store and a note when none of them sell there', async ({ page }) => {
    await page.goto(POST);
    expect(await visibleStores(page)).toHaveLength(4);
    await expect(box(page).locator('.product-region-note')).toBeVisible();
    await expect(box(page).locator('.product-region-note')).toContainText('so all of them are shown');
  });
});

test('?region= in the address picks the country', async ({ page }) => {
  await page.goto(`${POST}?region=us`);
  expect(await visibleStores(page)).toEqual(['US Audio']);
  await expect(box(page).locator('.product-offer:visible .product-price')).toHaveText('$329');
});

test('shows the review details and the shared product', async ({ page }) => {
  await page.goto(POST);
  await expect(box(page).locator('.product-name')).toHaveText('Test Headphones X1');
  await expect(box(page).locator('.product-rating')).toHaveAttribute('aria-label', 'Rated 4.5 out of 5');
  await expect(box(page).locator('.star-half')).toHaveCount(1);
  await expect(box(page).locator('.product-pros li')).toHaveText(['Quiet', '30 hour battery']);
  await expect(box(page).locator('img.product-image')).toBeVisible();
  const shared = page.locator('[data-product]').nth(1);
  await expect(shared.locator('.product-name')).toHaveText('Test Keyboard 75');
  await expect(shared.locator('.product-verdict')).toHaveText('Overridden in this post.');
  const ld = await page.locator('[data-product] script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(ld)).toMatchObject({ '@type': 'Product', name: 'Test Headphones X1', review: { reviewRating: { ratingValue: 4.5 } } });
});

test('the compact box sits at the right with the text flowing around it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(POST);
  const card = await box(page).boundingBox();
  const prose = await page.locator('.prose').boundingBox();
  expect(card.width).toBeLessThan(360);
  expect(card.x + card.width).toBeGreaterThan(prose.x + prose.width - 2);
  // The paragraph after the box starts beside it, not below it.
  const text = page.locator('.prose p', { hasText: 'paragraphs that wrap around' }).first();
  const para = await text.boundingBox();
  expect(para.y).toBeLessThan(card.y + card.height);
  // Pros and cons open from a button; the full box shows them straight away.
  await expect(box(page).locator('.product-pros')).toBeHidden();
  await box(page).getByText('Pros and cons (3)').click();
  await expect(box(page).locator('.product-pros')).toBeVisible();
  const full = page.locator('[data-product]').nth(1);
  await expect(full).toHaveClass(/product--full/);
  expect((await full.boundingBox()).width).toBeGreaterThan(600);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('every store is listed with where it ships', async ({ page }) => {
    await page.goto(POST);
    expect(await visibleStores(page)).toHaveLength(4);
    await expect(box(page).locator('.product-offer').first().locator('.product-offer-regions')).toHaveText('Denmark');
    await expect(box(page).locator('.product-region')).toBeHidden();
  });
});
