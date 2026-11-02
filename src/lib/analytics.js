// GoatCounter (https://www.goatcounter.com): no cookies, no personal data. `site.goatcounter` is your site
// code ("frederik" -> https://frederik.goatcounter.com/count) or a full count URL for a self-hosted one.
export function goatcounterUrl(code) {
  const c = String(code || '').trim();
  if (!c) return null;
  if (/^https:\/\//.test(c)) return c.endsWith('/count') ? c : `${c.replace(/\/$/, '')}/count`;
  if (!/^[a-z0-9-]+$/i.test(c)) throw new Error(`goatcounter in site.config.js should be your site code (like "frederik") or an https:// URL, not "${c}"`);
  return `https://${c.toLowerCase()}.goatcounter.com/count`;
}
