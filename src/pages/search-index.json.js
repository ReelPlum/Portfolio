// The documents the search box searches, generated at build time.
import { getPosts, getProjects } from '../lib/queries.js';
import { markdownToText, MATH_RE } from '../lib/search.js';
import { preambleFromMarkdown } from '../lib/latex.js';
import { REF_RE, buildTargets, resolveRef } from '../lib/references.js';
import { join } from 'node:path';
import { withBase } from '../lib/content.js';
import { expandSnippetText } from '../lib/snippets.js';

const contentDir = join(process.cwd(), process.env.CONTENT_DIR || 'src/content');
const targets = buildTargets(contentDir);
const snippetDir = join(contentDir, 'snippets');
const refText = (ref, text) => {
  if (text) return text;
  try { return resolveRef(ref, targets).title; } catch { return ref; }
};
// Macros the post defines, so formulas in search results render the same as in the post.
const preamble = (body) => preambleFromMarkdown(body, MATH_RE) || undefined;
const plain = (body) => markdownToText(expandSnippetText(String(body || ''), snippetDir).replace(REF_RE, (_, ref, text) => refText(ref, text)));

export async function GET() {
  const base = import.meta.env.BASE_URL;
  const [projects, posts] = await Promise.all([getProjects(), getPosts()]);
  const docs = [
    ...projects.map((p) => ({ id: `projects/${p.id}`, type: 'Project', title: p.data.title, description: p.data.summary, tags: p.data.tags, date: p.data.date, url: withBase(`/projects/${p.id}/`, base), body: plain(p.body), preamble: preamble(p.body) })),
    ...posts.map((p) => ({ id: `blog/${p.id}`, type: 'Post', title: p.data.title, description: p.data.description || '', tags: p.data.tags, date: p.data.date, url: withBase(`/blog/${p.id}/`, base), body: plain(p.body), preamble: preamble(p.body) })),
  ];
  return new Response(JSON.stringify(docs), { headers: { 'content-type': 'application/json' } });
}
