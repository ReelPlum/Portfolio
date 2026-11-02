// Astro integration for files from other GitHub repositories (see github-files.js):
//   - before the build, downloads GitHub files named in frontmatter (cover images, demo wasm / module)
//   - in `astro dev`, serves the downloaded copies
//   - after the build, copies them into dist so they are published with the site
import { readdirSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontmatterRefs, serveGithubFiles } from './github-files.js';

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return markdownFiles(p);
    return /\.mdx?$/.test(e.name) ? [p] : [];
  });
}

/** Downloads every GitHub file referenced in the frontmatter of the posts under `contentDir`. */
export async function prefetchFrontmatter(files, contentDir) {
  const jobs = [];
  for (const path of markdownFiles(contentDir)) {
    for (const { key, file } of frontmatterRefs(readFileSync(path, 'utf8'))) {
      const fail = (e) => { throw new Error(`${e.message} (${key} in ${path})`); };
      jobs.push(files.get(file).catch(fail));
      // A wasm-bindgen module (demo type "bindgen") also needs the .wasm file next to it.
      if (/\.m?js$/i.test(file.path)) jobs.push(files.get({ ...file, path: file.path.replace(/\.m?js$/i, '_bg.wasm') }, { optional: true }).catch(fail));
    }
  }
  return Promise.all(jobs);
}

export function githubFilesIntegration({ files, contentDir, base = '/' }) {
  return {
    name: 'github-files',
    hooks: {
      'astro:config:setup': async ({ logger }) => {
        await prefetchFrontmatter(files, contentDir);
        if (!files.hasToken && !files.mock) logger.debug('GITHUB_FILES_TOKEN is not set, so only public GitHub files can be used');
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(serveGithubFiles(files.dir, base));
      },
      'astro:build:done': ({ dir }) => {
        if (existsSync(files.dir)) cpSync(files.dir, fileURLToPath(dir), { recursive: true });
      },
    },
  };
}
