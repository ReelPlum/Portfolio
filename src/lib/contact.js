/** Builds the contact page rows from site.config.js. */
export function contactLinks(site) {
  const rows = [];
  const email = (site.email || '').trim();
  if (email) rows.push({ label: 'Email', detail: email, href: `mailto:${email}`, icon: 'mail' });
  for (const s of site.social || []) {
    let detail = s.href;
    try {
      const u = new URL(s.href);
      detail = (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '');
    } catch { /* keep raw */ }
    rows.push({ label: s.label, detail, href: s.href, icon: s.icon || 'link' });
  }
  return rows;
}
