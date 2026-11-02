import { getCollection } from 'astro:content';
import { join } from 'node:path';
import site from '../../site.config.js';
import { isPublished } from './content.js';
import { normalizeTagConfig, sortPosts, postPath, homePageFor } from './tags.js';
import { buildTargets, findReferences } from './references.js';
import { authorIds, checkAuthors } from './authors.js';

const includeDrafts = import.meta.env.DEV;
/** The `tags` section of site.config.js with its defaults filled in. */
export const tagConfig = normalizeTagConfig(site.tags);

let authorsPromise;
/** Map id -> author entry from authors.yaml. */
export const getAuthors = () => (authorsPromise ??= getCollection('authors').then((list) => new Map(list.map((a) => [a.id, a]))));

/** Every published post, newest first. Projects are posts too (tagged `project`). Unknown authors fail the build. */
export const getAllPosts = async () => {
  const posts = sortPosts((await getCollection('posts')).filter((e) => isPublished(e, { includeDrafts })));
  checkAuthors(posts, await getAuthors(), site.defaultAuthor);
  return posts;
};
/** Site-relative address of a post, e.g. /projects/interpreter/. */
export const urlOf = (post) => postPath(post, tagConfig);
/** The page a post belongs to (used for its back link, list icon and search label). */
export const pageOf = (post) => homePageFor(post, tagConfig);

/** The author entries of a post, in the order the front matter lists them. */
export async function authorsOf(entry) {
  const all = await getAuthors();
  return authorIds(entry, site.defaultAuthor).map((id) => all.get(id));
}

let targets;
/** Posts whose markdown references `key` ("posts/slug"), newest first. */
export async function getBacklinks(key) {
  targets ??= buildTargets(join(process.cwd(), process.env.CONTENT_DIR || 'src/content'), tagConfig);
  const all = await getAllPosts();
  return all.filter((e) => `posts/${e.id}` !== key && findReferences(e.body, targets).includes(key));
}
