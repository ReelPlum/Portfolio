// The documents the search box searches, generated at build time.
import { getAllPosts, tagConfig, urlOf, pageOf } from '../lib/queries.js';
import { summaryOf } from '../lib/tags.js';
import { markdownToText, MATH_RE } from '../lib/search.js';
import { preambleFromMarkdown } from '../lib/latex.js';
import { REF_RE, buildTargets, resolveRef } from '../lib/references.js';
import { join } from 'node:path';
import { withBase } from '../lib/content.js';

const targets = buildTargets(join(process.cwd(), process.env.CONTENT_DIR || 'src/content'), tagConfig);
const refText = (ref, text) => {
  if (text) return text;
  try { return resolveRef(ref, targets).title; } catch { return ref; }
};
// Macros the post defines, so formulas in search results render the same as in the post.
const preamble = (body) => preambleFromMarkdown(body, MATH_RE) || undefined;
const plain = (body) => markdownToText(String(body || '').replace(REF_RE, (_, ref, text) => refText(ref, text)));

export async function GET() {
  const base = import.meta.env.BASE_URL;
  const posts = await getAllPosts();
  // `type` is what the result is labelled with ("Project", "Post"), from the page the post is on.
  const docs = posts.map((p) => ({
    id: `posts/${p.id}`, type: pageOf(p)?.name || 'Post', icon: pageOf(p)?.icon || 'article', title: p.data.title, description: summaryOf(p),
    tags: p.data.tags, date: p.data.date, url: withBase(urlOf(p), base), body: plain(p.body), preamble: preamble(p.body),
  }));
  return new Response(JSON.stringify(docs), { headers: { 'content-type': 'application/json' } });
}
