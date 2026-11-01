import rss from '@astrojs/rss';
import site from '../../site.config.js';
import { getPosts } from '../lib/queries.js';

export async function GET(context) {
  const posts = await getPosts();
  return rss({
    title: site.title,
    description: site.description,
    site: new URL(import.meta.env.BASE_URL, context.site),
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: `blog/${post.id}/`,
    })),
  });
}
