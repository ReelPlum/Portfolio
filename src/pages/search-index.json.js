// The documents the search box searches, generated at build time.
import { getPosts, getProjects } from '../lib/queries.js';
import { markdownToText } from '../lib/search.js';
import { REF_RE, buildTargets, resolveRef } from '../lib/references.js';
import { join } from 'node:path';
import { withBase } from '../lib/content.js';

const targets = buildTargets(join(process.cwd(), process.env.CONTENT_DIR || 'src/content'));
const refText = (ref, text) => {
  if (text) return text;
  try { return resolveRef(ref, targets).title; } catch { return ref; }
};
const plain = (body) => markdownToText(String(body || '').replace(REF_RE, (_, ref, text) => refText(ref, text)));

export async function GET() {
  const base = import.meta.env.BASE_URL;
  const [projects, posts] = await Promise.all([getProjects(), getPosts()]);
  const docs = [
    ...projects.map((p) => ({ id: `projects/${p.id}`, type: 'Project', title: p.data.title, description: p.data.summary, tags: p.data.tags, date: p.data.date, url: withBase(`/projects/${p.id}/`, base), body: plain(p.body) })),
    ...posts.map((p) => ({ id: `blog/${p.id}`, type: 'Post', title: p.data.title, description: p.data.description || '', tags: p.data.tags, date: p.data.date, url: withBase(`/blog/${p.id}/`, base), body: plain(p.body) })),
  ];
  return new Response(JSON.stringify(docs), { headers: { 'content-type': 'application/json' } });
}
