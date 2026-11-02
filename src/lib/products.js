// Product reviews in posts: a ```product block holds a product, your verdict and the stores that sell it.
// Every store's link and price is written into the page when the site is built; the reader's browser
// then shows only the stores for the reader's country (src/lib/product-client.js).
// Pure functions (no file system) so they can be unit tested.
import YAML from 'yaml';
import ct from 'countries-and-timezones';
import { GROUPS, regionsOf, regionLabel } from './product-regions.js';

export { EU, GROUPS, offerMatches, offersFor, regionsOf, regionLabel } from './product-regions.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ALIASES = { UK: 'GB' };
const WORLDWIDE = new Set(['*', 'WORLDWIDE', 'ALL', 'EVERYWHERE']);

// Amazon has one store (and one Associates account) per country. `amazon: de` on an offer builds the
// link from the product's `asin` and your tracking ID for that store in site.config.js.
export const AMAZON = {
  com: { name: 'Amazon.com', regions: ['US'], currency: 'USD' },
  ca: { name: 'Amazon.ca', regions: ['CA'], currency: 'CAD' },
  'com.mx': { name: 'Amazon.com.mx', regions: ['MX'], currency: 'MXN' },
  'com.br': { name: 'Amazon.com.br', regions: ['BR'], currency: 'BRL' },
  'co.uk': { name: 'Amazon.co.uk', regions: ['GB', 'IE'], currency: 'GBP' },
  de: { name: 'Amazon.de', regions: ['DE', 'AT'], currency: 'EUR' },
  fr: { name: 'Amazon.fr', regions: ['FR'], currency: 'EUR' },
  it: { name: 'Amazon.it', regions: ['IT'], currency: 'EUR' },
  es: { name: 'Amazon.es', regions: ['ES'], currency: 'EUR' },
  nl: { name: 'Amazon.nl', regions: ['NL'], currency: 'EUR' },
  'com.be': { name: 'Amazon.com.be', regions: ['BE'], currency: 'EUR' },
  se: { name: 'Amazon.se', regions: ['SE'], currency: 'SEK' },
  pl: { name: 'Amazon.pl', regions: ['PL'], currency: 'PLN' },
  'com.tr': { name: 'Amazon.com.tr', regions: ['TR'], currency: 'TRY' },
  ae: { name: 'Amazon.ae', regions: ['AE'], currency: 'AED' },
  sa: { name: 'Amazon.sa', regions: ['SA'], currency: 'SAR' },
  in: { name: 'Amazon.in', regions: ['IN'], currency: 'INR' },
  'co.jp': { name: 'Amazon.co.jp', regions: ['JP'], currency: 'JPY' },
  sg: { name: 'Amazon.sg', regions: ['SG'], currency: 'SGD' },
  'com.au': { name: 'Amazon.com.au', regions: ['AU'], currency: 'AUD' },
};

const isCountry = (code) => Boolean(ct.getCountry(code));
const countryName = (code) => ct.getCountry(code)?.name || code;

/** Turns `regions:` (a string or list of codes / group names) into a list of country codes, or ['*']. */
export function normalizeRegions(value, where = 'regions') {
  if (value == null || value === '') return ['*'];
  const list = Array.isArray(value) ? value : String(value).split(/[\s,]+/);
  const out = new Set();
  for (const raw of list) {
    const key = String(raw).trim().toUpperCase();
    if (!key) continue;
    if (WORLDWIDE.has(key)) return ['*'];
    const code = ALIASES[key] || key;
    if (GROUPS[code]) GROUPS[code].forEach((c) => out.add(c));
    else if (/^[A-Z]{2}$/.test(code) && isCountry(code)) out.add(code);
    else throw new Error(`${where}: "${raw}" is not a country code (like DK or US), a group (${Object.keys(GROUPS).join(', ')}) or "worldwide"`);
  }
  return out.size ? [...out] : ['*'];
}

const toDate = (v) => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

function list(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`product: \`${name}\` must be a list`);
  return value.map(String);
}

function httpUrl(value, where) {
  try {
    const u = new URL(String(value));
    if (/^https?:$/.test(u.protocol)) return u.href;
  } catch { /* falls through */ }
  throw new Error(`${where}: url "${value}" must start with https://`);
}

/**
 * Reads a price written as a number or text: 279.99, "£279.99", "1,299.00", "1.299,00 kr." or "12,99".
 * The last dot or comma is the decimal separator unless exactly three digits follow it ("2.499 kr." is
 * 2499, since no shop prices things in thousandths); every other dot and comma separates thousands.
 */
export function parsePrice(value) {
  if (typeof value === 'number') return value;
  const text = String(value).replace(/[^\d.,-]/g, '').replace(/^[.,]+|[.,]+$/g, '');
  if (!/\d/.test(text)) return NaN;
  const last = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  const decimals = text.slice(last + 1);
  if (last === -1 || decimals.length === 3) return Number(text.replace(/[.,]/g, ''));
  return Number(`${text.slice(0, last).replace(/[.,]/g, '')}.${decimals}`);
}

/** The link to a product on one of Amazon's stores, with your tracking ID if you have one there. */
export function amazonUrl(asin, store, tag) {
  const u = new URL(`https://www.amazon.${store}/dp/${encodeURIComponent(asin)}`);
  if (tag) u.searchParams.set('tag', tag);
  return u.href;
}

function normalizeOffer(raw, i, product, affiliates) {
  const where = `product "${product.name}", offer ${i + 1}`;
  if (!raw || typeof raw !== 'object') throw new Error(`${where}: each offer needs at least a store and a url`);
  let { store, url } = raw;
  let regions = raw.regions;
  let currency = raw.currency;
  if (raw.amazon != null) {
    const key = String(raw.amazon).toLowerCase().replace(/^(?:www\.)?amazon\./, '');
    const shop = AMAZON[key];
    if (!shop) throw new Error(`${where}: unknown Amazon store "${raw.amazon}". Use one of: ${Object.keys(AMAZON).join(', ')}`);
    const asin = raw.asin || product.asin;
    if (!url && !asin) throw new Error(`${where}: an Amazon offer needs the product's \`asin\` (the code after /dp/ in the Amazon link) or a url`);
    store = store || shop.name;
    url = url || amazonUrl(asin, key, affiliates?.amazon?.[key]);
    regions = regions ?? shop.regions;
    currency = currency || shop.currency;
  }
  if (!store) throw new Error(`${where}: missing \`store\` (the shop's name)`);
  if (!url) throw new Error(`${where}: missing \`url\``);
  const offer = { store: String(store), url: httpUrl(url, where), regions: normalizeRegions(regions, `${where}, regions`) };
  if (raw.price != null && raw.price !== '') {
    const price = parsePrice(raw.price);
    if (!Number.isFinite(price) || price < 0) throw new Error(`${where}: price "${raw.price}" is not a number`);
    if (!currency) throw new Error(`${where}: a price needs a \`currency\` (like EUR, USD or DKK)`);
    const code = String(currency).toUpperCase();
    try {
      new Intl.NumberFormat('en', { style: 'currency', currency: code });
    } catch {
      throw new Error(`${where}: "${currency}" is not a currency code (like EUR, USD or DKK)`);
    }
    offer.price = price;
    offer.currency = code;
  }
  if (raw.note) offer.note = String(raw.note);
  const checked = toDate(raw.checked);
  if (checked) offer.checked = checked;
  if (raw.amazon != null) offer.amazon = true;
  return offer;
}

/**
 * Validates a product (already parsed from YAML) and fills in defaults. Mistakes throw with a message
 * that says what to fix, so a typo fails the build instead of showing a broken box.
 * @param {object} data   the product block
 * @param {object} opts   { shared: product loaded with `use:`, date: the post's date, affiliates: site.config.js affiliates }
 */
export function normalizeProduct(data, { shared = null, date = null, affiliates = {} } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('product: the block must be YAML fields like `name: ...`');
  const merged = { ...(shared || {}), ...data };
  delete merged.use;
  if (!merged.name) throw new Error('product: missing `name`');
  const product = { name: String(merged.name) };
  for (const key of ['brand', 'image', 'verdict', 'asin', 'link']) if (merged[key] != null && merged[key] !== '') product[key] = String(merged[key]);
  if (merged.alt) product.alt = String(merged.alt);
  // compact (the default) is a small box with pros and cons folded away; full shows everything.
  product.view = String(merged.view ?? 'compact').toLowerCase();
  if (!['compact', 'full'].includes(product.view)) throw new Error(`product "${product.name}": view must be compact or full, not "${merged.view}"`);
  // Where a compact box sits: at the right or left with the post's text flowing around it, or on its own line.
  product.align = String(merged.align ?? 'right').toLowerCase();
  if (!['right', 'left', 'center'].includes(product.align)) throw new Error(`product "${product.name}": align must be right, left or center, not "${merged.align}"`);
  if (product.link) product.link = httpUrl(product.link, `product "${product.name}"`);
  if (merged.rating != null) {
    const max = Number(merged.outOf ?? 5);
    const rating = Number(merged.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > max) throw new Error(`product "${product.name}": rating must be a number from 0 to ${max}`);
    product.rating = rating;
    product.outOf = max;
  }
  product.pros = list(merged.pros, 'pros');
  product.cons = list(merged.cons, 'cons');
  product.checked = toDate(merged.checked) || toDate(date);
  const offers = merged.offers ?? [];
  if (!Array.isArray(offers)) throw new Error(`product "${product.name}": \`offers\` must be a list`);
  product.offers = offers.map((o, i) => normalizeOffer(o, i, product, affiliates));
  return product;
}

/** Parses the text of a ```product block. */
export function parseProduct(text, opts = {}) {
  let data;
  try {
    data = YAML.parse(text);
  } catch (e) {
    throw new Error(`product: the block isn't valid YAML: ${e.message.split('\n')[0]}`);
  }
  return normalizeProduct(data, opts);
}

export function formatPrice(price, currency, locale = 'en-GB') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: Number.isInteger(price) ? 0 : 2 }).format(price);
}

const isoDay = (d) => d.toISOString().slice(0, 10);
const longDate = (d) => d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** Stars for a rating, rounded to the nearest half. */
export function starIcons(rating, outOf, icons) {
  const scaled = Math.round((rating / outOf) * 5 * 2) / 2;
  let out = '';
  for (let i = 1; i <= 5; i++) {
    const kind = scaled >= i ? 'full' : scaled >= i - 0.5 ? 'half' : 'empty';
    out += `<span class="star star-${kind}">${kind === 'half' ? icons.starHalf : icons.star}</span>`;
  }
  return out;
}

/** schema.org Product + Review, so search engines can show the rating and prices. */
export function productLd(product, { author } = {}) {
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: product.name };
  if (product.brand) ld.brand = { '@type': 'Brand', name: product.brand };
  if (product.image && /^https?:\/\//.test(product.image)) ld.image = product.image;
  if (product.rating != null) {
    ld.review = {
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: product.rating, bestRating: product.outOf, worstRating: 0 },
      ...(author ? { author: { '@type': 'Person', name: author } } : {}),
      ...(product.verdict ? { reviewBody: product.verdict } : {}),
    };
  }
  const priced = product.offers.filter((o) => o.price != null);
  if (priced.length) {
    ld.offers = priced.map((o) => ({ '@type': 'Offer', url: o.url, price: o.price, priceCurrency: o.currency, seller: { '@type': 'Organization', name: o.store } }));
  }
  return ld;
}

// Keeps "</script>" in a product name from ending the JSON-LD block early.
const ldJson = (d) => JSON.stringify(d).replace(/</g, '\\u003c');

function offerHtml(o, product, icons) {
  const checked = o.checked || product.checked;
  const price = o.price != null
    ? `<span class="product-price" data-price="${o.price}" data-currency="${esc(o.currency)}">${esc(formatPrice(o.price, o.currency))}</span>`
    : '<span class="product-price product-price-none">See price</span>';
  const when = o.price != null && checked ? `<span class="product-checked">on <time datetime="${isoDay(checked)}">${esc(longDate(checked))}</time></span>` : '';
  const where = regionLabel(o.regions, countryName);
  return `<li class="product-offer" data-regions="${esc(o.regions.join(' '))}">`
    + `<div class="product-offer-info"><span class="product-store">${esc(o.store)}</span>`
    + `<span class="product-offer-meta">${price}${when}</span>`
    + `${o.note ? `<span class="product-note">${esc(o.note)}</span>` : ''}`
    + `<span class="product-offer-regions" data-region-label>${esc(where)}</span></div>`
    // rel="sponsored" tells search engines this is a paid link (Google asks for it on affiliate links).
    + `<a class="btn btn-tonal product-buy" href="${esc(o.url)}" target="_blank" rel="sponsored noopener noreferrer" data-external="manual">${icons.cart}${product.view === 'full' ? `<span>View at ${esc(o.store)}</span>` : `<span>Buy</span><span class="visually-hidden"> at ${esc(o.store)}</span>`}<span class="visually-hidden"> (opens in a new tab)</span></a>`
    + '</li>';
}

/** The review box. `icons` holds the SVG for each icon (see remark-products.js). */
export function productHtml(product, { icons, disclosure, author, imageSrc } = {}) {
  const id = `product-${product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const img = product.image
    ? `<img class="product-image" src="${esc(imageSrc || product.image)}" alt="${esc(product.alt || product.name)}" loading="lazy" />`
    : '';
  const rating = product.rating != null
    ? `<p class="product-rating" aria-label="Rated ${product.rating} out of ${product.outOf}"><span class="product-stars" aria-hidden="true">${starIcons(product.rating, product.outOf, icons)}</span><span class="product-score" aria-hidden="true">${product.rating}/${product.outOf}</span></p>`
    : '';
  const pc = (items, cls, title, icon) => (items.length
    ? `<div class="product-${cls}"><h4>${title}</h4><ul>${items.map((t) => `<li>${icon}<span>${esc(t)}</span></li>`).join('')}</ul></div>`
    : '');
  const compact = product.view !== 'full';
  let proscons = product.pros.length || product.cons.length
    ? `<div class="product-proscons">${pc(product.pros, 'pros', 'Good', icons.pro)}${pc(product.cons, 'cons', 'Not so good', icons.con)}</div>`
    : '';
  // The compact box folds the pros and cons away behind a button.
  if (proscons && compact) {
    const count = product.pros.length + product.cons.length;
    proscons = `<details class="product-more"><summary>${icons.expand || ''}<span>Pros and cons (${count})</span></summary>${proscons}</details>`;
  }
  const regions = regionsOf(product.offers);
  const offers = product.offers.length
    ? `<div class="product-buy-section"><div class="product-buy-header"><h4 id="${id}-buy">Where to buy</h4>`
      + (regions.length ? `<label class="product-region" hidden>${icons.location}<span class="visually-hidden">Show stores for</span><select data-product-region data-regions="${esc(regions.join(' '))}"><option value="all">All countries</option></select></label>` : '')
      + `</div><p class="product-region-note" role="status" hidden></p>`
      + `<ul class="product-offers" aria-labelledby="${id}-buy">${product.offers.map((o) => offerHtml(o, product, icons)).join('')}</ul>`
      + (disclosure ? `<p class="product-disclosure">${icons.info}<span>${esc(disclosure)}</span></p>` : '')
      + '</div>'
    : '';
  const name = product.link
    ? `<a href="${esc(product.link)}" target="_blank" rel="noopener noreferrer" data-external="manual">${esc(product.name)}</a>`
    : esc(product.name);
  const cls = compact ? `product--compact product--${product.align}` : 'product--full';
  return `<aside class="product ${cls}" data-product aria-label="${esc(`Review: ${product.name}`)}">`
    + `<div class="product-head">${img}<div class="product-title">`
    + `${product.brand ? `<p class="product-brand">${esc(product.brand)}</p>` : ''}<h3 class="product-name">${name}</h3>${rating}`
    + `${product.verdict ? `<p class="product-verdict">${esc(product.verdict)}</p>` : ''}</div></div>`
    + proscons + offers
    + `<script type="application/ld+json">${ldJson(productLd(product, { author }))}</script>`
    + '</aside>';
}
