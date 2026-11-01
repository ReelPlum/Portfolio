// Structured data (JSON-LD) and robots.txt so search engines understand the site.

export function absolute(path, siteUrl) {
  return new URL(path, siteUrl).href;
}

export function personLd(site, siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: site.author,
    url: siteUrl,
    description: site.tagline,
    sameAs: (site.social || []).map((s) => s.href),
  };
}

export function websiteLd(site, siteUrl) {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: site.title, url: siteUrl, description: site.description };
}

export function blogPostingLd({ title, description, date, url, image, author }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    datePublished: new Date(date).toISOString(),
    url,
    mainEntityOfPage: url,
    ...(image ? { image } : {}),
    author: { '@type': 'Person', name: author },
  };
}

export function projectLd({ title, summary, date, url, image, source, author, tags = [] }) {
  return {
    '@context': 'https://schema.org',
    '@type': source ? 'SoftwareSourceCode' : 'CreativeWork',
    name: title,
    description: summary,
    dateCreated: new Date(date).toISOString(),
    url,
    keywords: tags.join(', '),
    ...(image ? { image } : {}),
    ...(source ? { codeRepository: source } : {}),
    author: { '@type': 'Person', name: author },
  };
}

/** JSON for a <script type="application/ld+json">, safe against "</script>" in content. */
export function ldJson(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function robotsTxt(sitemapUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}
