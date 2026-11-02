// Shows each product box's stores for the reader's country. Loaded only on pages with a product.
// The country is guessed in the browser, without sending anything anywhere:
//   1. ?region=DK in the address (handy for sharing or checking another country)
//   2. the country the reader picked before (remembered in this browser)
//   3. the time zone set on their device (Europe/Copenhagen -> Denmark)
//   4. the region in their language setting (da-DK -> Denmark)
// If none of the stores sell there, every store is shown with a note saying so.
import ct from 'countries-and-timezones';
import { offersFor, regionLabel } from './product-regions.js';

export const STORAGE_KEY = 'product-region';

const validCountry = (code) => {
  const c = String(code || '').trim().toUpperCase();
  if (c === 'ALL') return 'all';
  if (c === 'UK') return 'GB';
  return /^[A-Z]{2}$/.test(c) && ct.getCountry(c) ? c : null;
};

/** The explicit region in a language tag: "da-DK" -> "DK", "en" -> null. */
export function languageRegion(tag) {
  try {
    const region = new Intl.Locale(tag).region;
    return region && /^[A-Z]{2}$/.test(region) ? validCountry(region) : null;
  } catch {
    return null;
  }
}

/** The countries a time zone is used in, most specific first ("Europe/Copenhagen" -> ["DK"]). */
export function timeZoneCountries(timeZone) {
  if (!timeZone) return [];
  return ct.getTimezone(timeZone)?.countries || [];
}

/** Pure, so it can be tested: works out the reader's country from what the browser tells us. */
export function detectCountry({ query, saved, timeZone, languages = [] } = {}) {
  const fromQuery = validCountry(query);
  if (fromQuery) return { country: fromQuery, source: 'link' };
  const fromSaved = validCountry(saved);
  if (fromSaved) return { country: fromSaved, source: 'saved' };
  const langs = languages.map(languageRegion).filter(Boolean);
  const zone = timeZoneCountries(timeZone);
  // Some time zones are shared (Europe/Berlin also covers Denmark, Norway and Sweden in the time zone
  // database), so the language's region decides between them.
  if (zone.length) return { country: langs.find((c) => zone.includes(c)) || zone[0], source: 'timezone' };
  if (langs.length) return { country: langs[0], source: 'language' };
  // Last resort: the likely country for a bare language ("da" -> Denmark). Never guess from English.
  for (const tag of languages) {
    try {
      const loc = new Intl.Locale(tag);
      if (loc.language === 'en') continue;
      const region = validCountry(loc.maximize().region);
      if (region) return { country: region, source: 'language' };
    } catch { /* ignore bad tags */ }
  }
  return { country: null, source: 'none' };
}

export function countryName(code, locale) {
  try {
    return new Intl.DisplayNames([locale, 'en'], { type: 'region' }).of(code) || code;
  } catch {
    return ct.getCountry(code)?.name || code;
  }
}

/** Shows one product box's stores for `country` (a country code, 'all' or null). */
export function applyRegion(box, country, { locale = 'en' } = {}) {
  const items = [...box.querySelectorAll('.product-offer')];
  if (!items.length) return;
  const offers = items.map((el) => ({ el, regions: el.dataset.regions.split(' ') }));
  const shown = new Set(offersFor(offers, country).offers.map((o) => o.el));
  const { matched } = offersFor(offers, country);
  const name = (c) => countryName(c, locale);
  for (const { el, regions } of offers) {
    el.hidden = !shown.has(el);
    const label = el.querySelector('[data-region-label]');
    // When the list is already filtered to the reader's country, saying where each store ships is noise.
    if (label) {
      label.textContent = regionLabel(regions, name);
      label.hidden = matched;
    }
  }
  for (const el of box.querySelectorAll('.product-price[data-price]')) {
    try {
      const price = Number(el.dataset.price);
      el.textContent = new Intl.NumberFormat(locale, { style: 'currency', currency: el.dataset.currency, maximumFractionDigits: Number.isInteger(price) ? 0 : 2 }).format(price);
    } catch { /* keep the build's formatting */ }
  }
  const note = box.querySelector('.product-region-note');
  if (note) {
    const missing = country && country !== 'all' && !matched;
    note.hidden = !missing;
    note.textContent = missing ? `None of these stores list ${name(country)}, so all of them are shown.` : '';
  }
  const select = box.querySelector('select[data-product-region]');
  if (select) {
    const codes = new Set(select.dataset.regions.split(' ').filter(Boolean));
    if (country && country !== 'all') codes.add(country);
    const options = [...codes].map((c) => ({ c, n: name(c) })).sort((a, b) => a.n.localeCompare(b.n, locale));
    select.replaceChildren(new Option('All countries', 'all'), ...options.map(({ c, n }) => new Option(n, c)));
    select.value = country || 'all';
    select.closest('.product-region').hidden = false;
  }
}

export function setupProducts(doc = document) {
  const boxes = [...doc.querySelectorAll('[data-product]')];
  if (!boxes.length) return null;
  const win = doc.defaultView;
  let saved = null;
  try {
    saved = win.localStorage.getItem(STORAGE_KEY);
  } catch { /* storage blocked */ }
  const locale = win.navigator.languages?.[0] || win.navigator.language || 'en';
  const { country } = detectCountry({
    query: new URLSearchParams(win.location.search).get('region'),
    saved,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    languages: [...(win.navigator.languages || [win.navigator.language])].filter(Boolean),
  });
  const applyAll = (c) => boxes.forEach((box) => applyRegion(box, c, { locale }));
  applyAll(country);
  // Picking a country in one box changes every box on the page and is remembered for next time.
  doc.addEventListener('change', (event) => {
    const select = event.target.closest?.('select[data-product-region]');
    if (!select) return;
    try {
      win.localStorage.setItem(STORAGE_KEY, select.value);
    } catch { /* storage blocked */ }
    applyAll(select.value);
  });
  return country;
}
