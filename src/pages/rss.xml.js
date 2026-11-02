import rss from '@astrojs/rss';
import site from '../../site.config.js';
import { getAllPosts, urlOf, pageOf, authorsOf } from '../lib/queries.js';
import { summaryOf } from '../lib/tags.js';
import { isGuest } from '../lib/authors.js';

// One feed with every post, newest first. Posts on a page other than the blog (projects, say) are labelled
// with that page's name ("Project: …"). Each item has its tags as categories and its authors.
export async function GET(context) {
  const posts = await getAllPosts();
  const items = [];
  for (const post of posts) {
    const authors = (await authorsOf(post)).map((a) => a.data.name).join(', ');
    const kind = pageOf(post)?.name;
    items.push({
      title: kind && kind !== 'Post' ? `${kind}: ${post.data.title}` : post.data.title,
      pubDate: post.data.date,
      description: summaryOf(post) || undefined,
      link: urlOf(post).slice(1),
      categories: [...(post.data.tags || []), ...(isGuest(post, site.defaultAuthor) ? ['Guest post'] : [])],
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
