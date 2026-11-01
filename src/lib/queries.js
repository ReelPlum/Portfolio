import { getCollection } from 'astro:content';
import { join } from 'node:path';
import { isPublished, sortByDateDesc, sortProjects } from './content.js';
import { buildTargets, findReferences } from './references.js';

const includeDrafts = import.meta.env.DEV;
export const getPosts = async () => sortByDateDesc((await getCollection('blog')).filter((e) => isPublished(e, { includeDrafts })));
export const getProjects = async () => sortProjects((await getCollection('projects')).filter((e) => isPublished(e, { includeDrafts })));

let targets;
/** Posts and projects whose markdown references `key` ("blog/slug" or "projects/slug"), newest first. */
export async function getBacklinks(key) {
  targets ??= buildTargets(join(process.cwd(), process.env.CONTENT_DIR || 'src/content'));
  const all = [...(await getProjects()), ...(await getPosts())];
  return sortByDateDesc(all.filter((e) => `${e.collection}/${e.id}` !== key && findReferences(e.body, targets).includes(key)));
}
