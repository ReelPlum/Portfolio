// Region logic shared by the build (products.js) and the reader's browser (product-client.js).
// Kept free of the YAML parser so the browser code stays small.

export const EU = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
// Names you can use in `regions:` besides two-letter country codes.
export const GROUPS = { EU, NORDICS: ['DK', 'FI', 'IS', 'NO', 'SE'] };

export const offerMatches = (offer, country) => offer.regions.includes('*') || offer.regions.includes(country);

/**
 * Which offers to show a reader from `country`. When none of the stores sell there (or the country is
 * unknown, or the reader picked "All countries") every offer is shown, so the box is never empty.
 */
export function offersFor(offers, country) {
  if (!country || country === 'all') return { offers, matched: false };
  const local = offers.filter((o) => offerMatches(o, country));
  return local.length ? { offers: local, matched: true } : { offers, matched: false };
}

/** Every country the offers name, for the "Stores for" picker. */
export function regionsOf(offers) {
  return [...new Set(offers.flatMap((o) => o.regions).filter((r) => r !== '*'))].sort();
}

/** "Ships worldwide", "Denmark, Sweden", "EU", "EU, Norway" or "Germany, Austria and 3 more". */
export function regionLabel(regions, nameOf = (c) => c) {
  if (regions.includes('*')) return 'Ships worldwide';
  const set = new Set(regions);
  const parts = [];
  if (EU.every((c) => set.has(c))) {
    parts.push('EU');
    EU.forEach((c) => set.delete(c));
  }
  parts.push(...[...set].map(nameOf));
  return parts.length > 3 ? `${parts.slice(0, 2).join(', ')} and ${parts.length - 2} more` : parts.join(', ');
}
