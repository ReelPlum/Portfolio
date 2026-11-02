import { getCollection } from 'astro:content';
import { join } from 'node:path';
import site from '../../site.config.js';
import { isPublished, sortByDateDesc, sortProjects } from './content.js';
import { buildTargets, findReferences } from './references.js';
import { authorIds, checkAuthors } from './authors.js';

const includeDrafts = import.meta.env.DEV;

let authorsPromise;
/** Map id -> author entry from authors.yaml. */
export const getAuthors = () => (authorsPromise ??= getCollection('authors').then((list) => new Map(list.map((a) => [a.id, a]))));

const checked = async (entries) => {
  checkAuthors(entries, await getAuthors(), site.defaultAuthor);
  return entries;
};
export const getPosts = async () => checked(sortByDateDesc((await getCollection('blog')).filter((e) => isPublished(e, { includeDrafts }))));
export const getProjects = async () => checked(sortProjects((await getCollection('projects')).filter((e) => isPublished(e, { includeDrafts }))));

/** The author entries of a post or project, in the order the front matter lists them. */
export async function authorsOf(entry) {
  const all = await getAuthors();
  return authorIds(entry, site.defaultAuthor).map((id) => all.get(id));
}

let targets;
/** Posts and projects whose markdown references `key` ("blog/slug" or "projects/slug"), newest first. */
export async function getBacklinks(key) {
  targets ??= buildTargets(join(process.cwd(), process.env.CONTENT_DIR || 'src/content'));
  const all = [...(await getProjects()), ...(await getPosts())];
  return sortByDateDesc(all.filter((e) => `${e.collection}/${e.id}` !== key && findReferences(e.body, targets).includes(key)));
}
