import { robotsTxt } from '../lib/seo.js';

// Note: crawlers only read robots.txt at the domain root. While the site lives under /Portfolio/
// this file is informational; the sitemap is still discoverable through the <link rel="sitemap"> tag.
export function GET({ site }) {
  return new Response(robotsTxt(new URL(`${import.meta.env.BASE_URL}sitemap-index.xml`.replace(/\/\//g, '/'), site).href));
}
