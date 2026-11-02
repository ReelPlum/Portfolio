import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import {
  parseProduct, parsePrice, normalizeRegions, offersFor, regionsOf, regionLabel, amazonUrl, formatPrice, starIcons, productLd, productHtml, EU,
} from '../../src/lib/products.js';
import { remarkProducts } from '../../src/lib/remark-products.js';
import { remarkCode } from '../../src/lib/remark-code.js';
import { rehypeExternalLinks } from '../../src/lib/rehype-external-links.js';
import { detectCountry, languageRegion, timeZoneCountries } from '../../src/lib/product-client.js';

const yaml = (s) => s.replace(/^ {4}/gm, '');

describe('normalizeRegions', () => {
  it('treats a missing list, "*" and "worldwide" as everywhere', () => {
    expect(normalizeRegions(undefined)).toEqual(['*']);
    expect(normalizeRegions('*')).toEqual(['*']);
    expect(normalizeRegions(['dk', 'Worldwide'])).toEqual(['*']);
  });
  it('upper-cases codes, accepts a comma list and maps UK to GB', () => {
    expect(normalizeRegions('dk, se')).toEqual(['DK', 'SE']);
    expect(normalizeRegions(['UK'])).toEqual(['GB']);
  });
  it('expands groups', () => {
    expect(normalizeRegions(['EU'])).toEqual(EU);
    expect(normalizeRegions(['nordics', 'DK'])).toEqual(['DK', 'FI', 'IS', 'NO', 'SE']);
  });
  it('fails on a typo so the build catches it', () => {
    expect(() => normalizeRegions(['DKK'])).toThrow(/"DKK" is not a country code/);
    expect(() => normalizeRegions(['XX'])).toThrow(/not a country code/);
  });
});

describe('offersFor', () => {
  const offers = [{ store: 'A', regions: ['DK'] }, { store: 'B', regions: ['*'] }, { store: 'C', regions: ['US'] }];
  it('shows the stores for the country plus worldwide ones', () => {
    expect(offersFor(offers, 'DK')).toEqual({ offers: [offers[0], offers[1]], matched: true });
  });
  it('shows everything when the country is unknown or "all"', () => {
    expect(offersFor(offers, null).offers).toHaveLength(3);
    expect(offersFor(offers, 'all').offers).toHaveLength(3);
  });
  it('shows everything (and says it did not match) when no store sells there', () => {
    const only = offers.filter((o) => o.store !== 'B');
    expect(offersFor(only, 'JP')).toEqual({ offers: only, matched: false });
  });
  it('lists the countries for the picker', () => {
    expect(regionsOf(offers)).toEqual(['DK', 'US']);
  });
});

describe('regionLabel', () => {
  it('names worldwide, the EU and long lists briefly', () => {
    expect(regionLabel(['*'])).toBe('Ships worldwide');
    expect(regionLabel([...EU, 'NO'])).toBe('EU, NO');
    expect(regionLabel(['DE', 'AT'], (c) => ({ DE: 'Germany', AT: 'Austria' })[c])).toBe('Germany, Austria');
    expect(regionLabel(['DE', 'AT', 'CH', 'LI', 'LU'])).toBe('DE, AT and 3 more');
  });
});

describe('parseProduct', () => {
  const block = yaml(`
    name: Headphones
    brand: Sony
    rating: 4.5
    verdict: Good.
    pros: [Quiet]
    cons: [Big]
    asin: B09XS7JWHH
    offers:
      - store: Elgiganten
        url: https://www.elgiganten.dk/x
        price: 2499
        currency: dkk
        regions: [DK]
      - amazon: de
      - amazon: co.uk
        price: "£279.99"
    `);

  it('reads the fields and fills in Amazon offers', () => {
    const p = parseProduct(block, { affiliates: { amazon: { de: 'me-21' } }, date: '2026-10-30' });
    expect(p).toMatchObject({ name: 'Headphones', brand: 'Sony', rating: 4.5, outOf: 5, pros: ['Quiet'], cons: ['Big'] });
    expect(p.checked.toISOString().slice(0, 10)).toBe('2026-10-30');
    expect(p.offers[0]).toMatchObject({ store: 'Elgiganten', price: 2499, currency: 'DKK', regions: ['DK'] });
    expect(p.offers[1]).toMatchObject({ store: 'Amazon.de', url: 'https://www.amazon.de/dp/B09XS7JWHH?tag=me-21', regions: ['DE', 'AT'], amazon: true });
    expect(p.offers[1].price).toBeUndefined();
    // The store's currency is used when the offer has a price but no currency, and "£279.99" is read as 279.99.
    expect(p.offers[2]).toMatchObject({ store: 'Amazon.co.uk', url: 'https://www.amazon.co.uk/dp/B09XS7JWHH', price: 279.99, currency: 'GBP', regions: ['GB', 'IE'] });
  });

  it('merges a shared product with the fields in the post', () => {
    const p = parseProduct('use: kb\nverdict: Changed', { shared: { name: 'Keyboard', verdict: 'Old', offers: [] } });
    expect(p).toMatchObject({ name: 'Keyboard', verdict: 'Changed' });
  });

  it.each([
    ['offers: []', /missing `name`/],
    ['name: A\nrating: 7', /rating must be a number from 0 to 5/],
    ['name: A\noffers:\n  - url: https://a.example', /missing `store`/],
    ['name: A\noffers:\n  - store: S', /missing `url`/],
    ['name: A\noffers:\n  - store: S\n    url: javascript:alert(1)', /must start with https:\/\//],
    ['name: A\noffers:\n  - store: S\n    url: https://a.example\n    price: 10', /needs a `currency`/],
    ['name: A\noffers:\n  - store: S\n    url: https://a.example\n    price: 10\n    currency: EURO', /not a currency code/],
    ['name: A\noffers:\n  - store: S\n    url: https://a.example\n    price: cheap\n    currency: EUR', /is not a number/],
    ['name: A\noffers:\n  - amazon: dk', /unknown Amazon store "dk"/],
    ['name: A\noffers:\n  - amazon: de', /needs the product's `asin`/],
    ['name: [unclosed', /isn't valid YAML/],
    ['- just a list', /must be YAML fields/],
  ])('explains what is wrong with %j', (text, message) => {
    expect(() => parseProduct(text)).toThrow(message);
  });

  it('defaults to a compact box at the right, and checks view and align', () => {
    expect(parseProduct('name: A')).toMatchObject({ view: 'compact', align: 'right' });
    expect(parseProduct('name: A\nview: Full\nalign: left')).toMatchObject({ view: 'full', align: 'left' });
    expect(() => parseProduct('name: A\nview: tiny')).toThrow(/view must be compact or full/);
    expect(() => parseProduct('name: A\nalign: top')).toThrow(/align must be right, left or center/);
  });

  it('allows a rating out of 10', () => {
    expect(parseProduct('name: A\nrating: 8\noutOf: 10')).toMatchObject({ rating: 8, outOf: 10 });
  });
});

describe('parsePrice', () => {
  it.each([
    [279.99, 279.99], ['£279.99', 279.99], ['1,299.00', 1299], ['1.299,00 kr.', 1299], ['12,99', 12.99],
    ['1,299', 1299], ['2.499 kr.', 2499], ['1.5', 1.5], ['2 499 kr', 2499], ['1.234.567', 1234567], ['€ 49', 49],
  ])('reads %j as %d', (text, expected) => {
    expect(parsePrice(text)).toBe(expected);
  });
  // Regression: "cheap" was read as a price of 0 instead of failing the build.
  it('rejects text without digits', () => {
    expect(parsePrice('cheap')).toBeNaN();
  });
});

describe('helpers', () => {
  it('builds Amazon links with and without a tracking ID', () => {
    expect(amazonUrl('B0X', 'com', 'me-20')).toBe('https://www.amazon.com/dp/B0X?tag=me-20');
    expect(amazonUrl('B0X', 'co.jp')).toBe('https://www.amazon.co.jp/dp/B0X');
  });
  it('formats prices without pointless decimals', () => {
    expect(formatPrice(2499, 'DKK', 'da-DK')).toMatch(/2\.499\skr\./);
    expect(formatPrice(279.99, 'GBP')).toBe('£279.99');
    expect(formatPrice(329, 'USD', 'en-US')).toBe('$329');
  });
  it('rounds stars to the nearest half', () => {
    const icons = { star: 'S', starHalf: 'H' };
    const kinds = (r, of = 5) => [...starIcons(r, of, icons).matchAll(/star-(\w+)/g)].map((m) => m[1]);
    expect(kinds(4.5)).toEqual(['full', 'full', 'full', 'full', 'half']);
    expect(kinds(3.2)).toEqual(['full', 'full', 'full', 'empty', 'empty']);
    expect(kinds(7, 10)).toEqual(['full', 'full', 'full', 'half', 'empty']);
  });
  it('describes the product and its prices for search engines', () => {
    const p = parseProduct('name: A\nbrand: B\nrating: 4\nverdict: Nice\noffers:\n  - store: S\n    url: https://s.example\n    price: 10\n    currency: EUR\n  - store: T\n    url: https://t.example');
    const ld = productLd(p, { author: 'Frederik' });
    expect(ld).toMatchObject({ '@type': 'Product', name: 'A', brand: { name: 'B' }, review: { reviewRating: { ratingValue: 4, bestRating: 5 }, author: { name: 'Frederik' }, reviewBody: 'Nice' } });
    expect(ld.offers).toEqual([{ '@type': 'Offer', url: 'https://s.example/', price: 10, priceCurrency: 'EUR', seller: { '@type': 'Organization', name: 'S' } }]);
  });
});

describe('productHtml', () => {
  const icons = { star: '<i>s</i>', starHalf: '<i>h</i>', pro: '', con: '', cart: '', location: '', info: '' };
  const product = parseProduct(yaml(`
    name: <Evil> & "quoted"
    checked: 2026-10-30
    offers:
      - store: Shop
        url: https://shop.example/a?x=1&y=2
        price: 10
        currency: EUR
        regions: [EU]
    `));
  const html = productHtml(product, { icons, disclosure: 'Affiliate links.' });

  it('escapes text and links', () => {
    expect(html).toContain('&lt;Evil&gt; &amp; &quot;quoted&quot;');
    expect(html).toContain('href="https://shop.example/a?x=1&amp;y=2"');
    expect(html).not.toContain('<Evil>');
  });
  it('marks store links as sponsored and shows the date the price was checked', () => {
    expect(html).toContain('rel="sponsored noopener noreferrer"');
    expect(html).toContain('<time datetime="2026-10-30">30 October 2026</time>');
    expect(html).toContain('data-regions="' + EU.join(' ') + '"');
    expect(html).toContain('>EU</span>');
    expect(html).toContain('Affiliate links.');
  });
  it('folds pros and cons away in the compact box and shows them in the full one', () => {
    const block = 'name: A\npros: [Fast]\ncons: [Loud]\noffers:\n  - store: Shop\n    url: https://shop.example';
    const small = productHtml(parseProduct(block), { icons });
    expect(small).toContain('class="product product--compact product--right"');
    expect(small).toMatch(/<details class="product-more"><summary>.*Pros and cons \(2\)/);
    expect(small).toContain('<span>Buy</span><span class="visually-hidden"> at Shop</span>');
    const big = productHtml(parseProduct(`${block}\nview: full`), { icons });
    expect(big).toContain('class="product product--full"');
    expect(big).not.toContain('<details');
    expect(big).toContain('<span>View at Shop</span>');
  });
  // Regression: a product called "</script>" must not end the JSON-LD block and inject HTML.
  it('keeps the JSON-LD block closed', () => {
    const p = parseProduct('name: "</script><b>x</b>"');
    const out = productHtml(p, { icons });
    expect(out.match(/<\/script>/g)).toHaveLength(1);
  });
});

const render = async (md, opts = {}) => String(await unified()
  .use(remarkParse).use(remarkProducts, opts).use(remarkCode, { publicDirs: [] })
  .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw)
  .use(rehypeExternalLinks, { site: 'https://reelplum.github.io', base: '/Portfolio/' })
  .use(rehypeStringify).process(md));

describe('remarkProducts', () => {
  it('turns a ```product block into a review box', async () => {
    const html = await render('```product\nname: Thing\nimage: /images/t.png\noffers:\n  - store: S\n    url: https://s.example\n```', { base: '/Portfolio/' });
    expect(html).toContain('<aside class="product product--compact product--right" data-product');
    expect(html).toContain('src="/Portfolio/images/t.png"');
    expect(html).not.toContain('<pre');
  });
  // Regression: the external-links step replaced rel="sponsored ..." with "noopener noreferrer" and
  // added a second arrow icon to the store buttons.
  it('keeps store links sponsored after the external-links step', async () => {
    const html = await render('```product\nname: Thing\noffers:\n  - store: S\n    url: https://s.example\n```');
    expect(html).toMatch(/<a class="btn btn-tonal product-buy" href="https:\/\/s.example\/" target="_blank" rel="sponsored noopener noreferrer"/);
    expect(html).not.toContain('external-link');
  });
  it('loads a shared product with use:', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'products-'));
    writeFileSync(join(dir, 'kb.yaml'), 'name: Shared keyboard\nverdict: From the file\n');
    const html = await render('```product\nuse: kb\n```', { productsDir: dir });
    expect(html).toContain('Shared keyboard');
    expect(html).toContain('From the file');
  });
  it('fails the build with the file name when the block is wrong', async () => {
    const file = { path: 'blog/post.md', value: '```product\nname: A\nrating: 9\n```' };
    await expect(unified().use(remarkParse).use(remarkProducts).use(remarkRehype).use(rehypeStringify).process(file)).rejects.toThrow(/rating must be.*\(in blog\/post\.md\)/);
    await expect(render('```product\nuse: missing\n```', { productsDir: '/nowhere' })).rejects.toThrow(/no \/nowhere\/missing\.yaml/);
    await expect(render('```product\nuse: ../secret\n```')).rejects.toThrow(/without folders/);
  });
  it('uses the post date when the block has no checked date', async () => {
    const file = { value: '```product\nname: A\noffers:\n  - store: S\n    url: https://s.example\n    price: 5\n    currency: EUR\n```', data: { astro: { frontmatter: { date: '2026-09-01' } } } };
    const html = String(await unified().use(remarkParse).use(remarkProducts).use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(rehypeStringify).process(file));
    expect(html).toContain('datetime="2026-09-01"');
  });
});

describe('detectCountry', () => {
  it('prefers ?region= then the saved choice', () => {
    expect(detectCountry({ query: 'se', saved: 'DK', timeZone: 'America/New_York' })).toEqual({ country: 'SE', source: 'link' });
    expect(detectCountry({ query: 'nope', saved: 'dk', timeZone: 'America/New_York' })).toEqual({ country: 'DK', source: 'saved' });
    expect(detectCountry({ saved: 'all' })).toEqual({ country: 'all', source: 'saved' });
  });
  it('uses the time zone', () => {
    expect(detectCountry({ timeZone: 'Europe/Copenhagen', languages: ['en-US'] }).country).toBe('DK');
    expect(detectCountry({ timeZone: 'America/New_York', languages: ['da'] }).country).toBe('US');
  });
  it('uses the language to choose between countries that share a time zone', () => {
    expect(timeZoneCountries('Europe/Berlin').length).toBeGreaterThan(1);
    expect(detectCountry({ timeZone: 'Europe/Berlin', languages: ['sv-SE', 'en'] }).country).toBe('SE');
    expect(detectCountry({ timeZone: 'Europe/Berlin', languages: ['en-US'] }).country).toBe('DE');
  });
  it('falls back to the language when the time zone says nothing (UTC)', () => {
    expect(detectCountry({ timeZone: 'UTC', languages: ['en-GB'] })).toEqual({ country: 'GB', source: 'language' });
    expect(detectCountry({ timeZone: 'UTC', languages: ['da'] }).country).toBe('DK');
    // A bare "en" says nothing about where someone is.
    expect(detectCountry({ timeZone: 'UTC', languages: ['en'] })).toEqual({ country: null, source: 'none' });
    expect(detectCountry({})).toEqual({ country: null, source: 'none' });
  });
  it('reads the region from a language tag', () => {
    expect(languageRegion('da-DK')).toBe('DK');
    expect(languageRegion('zh-Hant-TW')).toBe('TW');
    expect(languageRegion('es-419')).toBeNull();
    expect(languageRegion('not a tag')).toBeNull();
  });
});
