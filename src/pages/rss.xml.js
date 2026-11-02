import rss from '@astrojs/rss';
import site from '../../site.config.js';
import { getAllPosts, urlOf } from '../lib/queries.js';
import { summaryOf } from '../lib/tags.js';

export async function GET(context) {
  const posts = await getAllPosts();
  return rss({
    title: site.title,
    description: site.description,
    site: new URL(import.meta.env.BASE_URL, context.site),
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: summaryOf(post) || undefined,
      categories: post.data.tags,
      link: urlOf(post).slice(1),
    })),
  });
}
