import rss from '@astrojs/rss';
import site from '../../site.config.js';
import { getPosts, getProjects, authorsOf } from '../lib/queries.js';
import { sortByDateDesc } from '../lib/content.js';
import { isGuest } from '../lib/authors.js';

// One feed with posts and projects, newest first. Each item has its tags as categories and its authors.
export async function GET(context) {
  const entries = sortByDateDesc([...(await getPosts()), ...(await getProjects())]);
  const items = [];
  for (const e of entries) {
    const authors = (await authorsOf(e)).map((a) => a.data.name).join(', ');
    items.push({
      title: e.collection === 'projects' ? `Project: ${e.data.title}` : e.data.title,
      pubDate: e.data.date,
      description: e.data.description || e.data.summary,
      link: `${e.collection}/${e.id}/`,
      categories: [...(e.data.tags || []), ...(isGuest(e, site.defaultAuthor) ? ['Guest post'] : [])],
      // <author> must be an email address, so names go in Dublin Core's creator.
      customData: `<dc:creator>${authors.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</dc:creator>`,
    });
  }
  return rss({
    title: site.title,
    description: site.description,
    site: new URL(import.meta.env.BASE_URL, context.site),
    items,
    xmlns: { dc: 'http://purl.org/dc/elements/1.1/' },
    customData: '<language>en</language>',
  });
}
