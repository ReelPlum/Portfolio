import { getCollection } from 'astro:content';
import { join } from 'node:path';
import site from '../../site.config.js';
import { isPublished } from './content.js';
import { normalizeTagConfig, sortPosts, postPath, homePageFor } from './tags.js';
import { buildTargets, findReferences } from './references.js';

const includeDrafts = import.meta.env.DEV;
/** The `tags` section of site.config.js with its defaults filled in. */
export const tagConfig = normalizeTagConfig(site.tags);
/** Every published post, newest first. Projects are posts too (tagged `project`). */
export const getAllPosts = async () => sortPosts((await getCollection('posts')).filter((e) => isPublished(e, { includeDrafts })));
/** Site-relative address of a post, e.g. /projects/interpreter/. */
export const urlOf = (post) => postPath(post, tagConfig);
/** The page a post belongs to (used for its back link, list icon and search label). */
export const pageOf = (post) => homePageFor(post, tagConfig);

let targets;
/** Posts whose markdown references `key` ("posts/slug"), newest first. */
export async function getBacklinks(key) {
  targets ??= buildTargets(join(process.cwd(), process.env.CONTENT_DIR || 'src/content'), tagConfig);
  const all = await getAllPosts();
  return all.filter((e) => `posts/${e.id}` !== key && findReferences(e.body, targets).includes(key));
}
