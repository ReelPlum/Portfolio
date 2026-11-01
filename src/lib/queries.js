import { getCollection } from 'astro:content';
import { isPublished, sortByDateDesc, sortProjects } from './content.js';

const includeDrafts = import.meta.env.DEV;
export const getPosts = async () => sortByDateDesc((await getCollection('blog')).filter((e) => isPublished(e, { includeDrafts })));
export const getProjects = async () => sortProjects((await getCollection('projects')).filter((e) => isPublished(e, { includeDrafts })));
