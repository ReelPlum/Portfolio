// Files from other GitHub repositories, private ones included. Paste a link to a file on GitHub and the
// build downloads it, saves a copy with the site and uses that copy, so it works like a file in public/:
//
//   https://github.com/OWNER/REPO/blob/REF/path/to/file.rs#L10-L20
//   https://raw.githubusercontent.com/OWNER/REPO/REF/path/to/file.rs
//
// The copy is served at /_github/OWNER/REPO/REF/path. A wasm-bindgen app (a .js file with a <name>_bg.wasm
// next to it) goes under /wasm/_github/... instead, so it runs in a canvas like one in public/wasm/.
//
// Private repositories need a token in GITHUB_FILES_TOKEN (see the README). Whatever is referenced is
// published with the site, so anyone can read it, even if the repository is private.
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, resolve, dirname, sep, extname } from 'node:path';

export const LOCAL_PREFIX = '/_github/';
export const APP_PREFIX = '/wasm/_github/';

const NAME = /^[A-Za-z0-9_.-]+$/;
const SEGMENT_OK = (s) => s !== '' && s !== '.' && s !== '..' && !s.includes('\\');

/**
 * Parses a link to a file on GitHub into { owner, repo, ref, path, suffix }, or null if it isn't one.
 * `suffix` is the query and #L10-L20 part, kept so line ranges and embed options still work.
 * A branch with a slash in its name can't be told apart from a folder, so use a tag or commit for those.
 */
export function parseGithubUrl(url) {
  let u;
  try {
    u = new URL(String(url).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const parts = u.pathname.split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return null; }
  });
  if (parts.some((p) => p == null || !SEGMENT_OK(p))) return null;
  let owner, repo, ref, path;
  if (u.hostname === 'github.com' || u.hostname === 'www.github.com') {
    if (parts.length < 5 || (parts[2] !== 'blob' && parts[2] !== 'raw')) return null;
    [owner, repo, , ref] = parts;
    path = parts.slice(4);
  } else if (u.hostname === 'raw.githubusercontent.com') {
    if (parts.length < 4) return null;
    [owner, repo, ref] = parts;
    path = parts.slice(3);
  } else return null;
  if (!NAME.test(owner) || !NAME.test(repo) || !NAME.test(ref)) return null;
  // GitHub adds ?plain=1 to line links in Markdown files; it means nothing here.
  u.searchParams.delete('plain');
  return { owner, repo, ref, path: path.join('/'), suffix: u.search + u.hash };
}

/** The site path the downloaded copy is served at, e.g. /_github/ReelPlum/interp/main/src/lexer.rs */
export function localPath(file, { app = false } = {}) {
  const enc = (s) => s.split('/').map(encodeURIComponent).join('/');
  return `${app ? APP_PREFIX : LOCAL_PREFIX}${file.owner}/${file.repo}/${file.ref}/${enc(file.path)}`;
}

/** The address of a file on GitHub's website, used in error messages. */
export const githubUrl = (f) => `https://github.com/${f.owner}/${f.repo}/blob/${f.ref}/${f.path}`;

/** For a wasm-bindgen .js file, the .wasm file it loads (renderer.js -> renderer_bg.wasm). */
export function bindgenWasm(file) {
  if (!/\.m?js$/i.test(file.path)) return null;
  return { ...file, path: file.path.replace(/\.m?js$/i, '_bg.wasm'), suffix: '' };
}

/** Frontmatter values that are links to GitHub files (cover images, demo wasm / module / src). */
export function frontmatterRefs(text, { skipKeys = ['source', 'link'] } = {}) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text))?.[1];
  if (!fm) return [];
  const out = [];
  for (const line of fm.split(/\r?\n/)) {
    const m = /^\s*(?:-\s+)?([A-Za-z_][\w-]*)\s*:\s*["']?(https?:\/\/\S+?)["']?\s*(?:#.*)?$/.exec(line);
    if (!m || skipKeys.includes(m[1])) continue;
    const file = parseGithubUrl(m[2]);
    if (file) out.push({ key: m[1], file });
  }
  return out;
}

/** A frontmatter value with GitHub links swapped for the downloaded copy. Other values are returned as is. */
export function githubToLocal(value) {
  if (typeof value !== 'string') return value;
  const file = parseGithubUrl(value);
  return file ? localPath(file) + file.suffix : value;
}

export class GithubFileError extends Error {}

/**
 * Downloads files from GitHub into `dir` (mirroring the site paths) and remembers what it already fetched
 * during this build. With a token it uses the GitHub API, which works for private repositories; without one
 * it reads public files from raw.githubusercontent.com. `mockDir` (used by the tests) reads files from
 * <mockDir>/<owner>/<repo>/<ref>/<path> instead of the network.
 */
export function createGithubFiles({ dir, token = '', mockDir = null, fetch = globalThis.fetch, timeout = 60_000 } = {}) {
  const fetched = new Map();
  const root = resolve(dir);

  async function download(file) {
    if (mockDir) {
      const p = join(mockDir, file.owner, file.repo, file.ref, file.path);
      if (!existsSync(p) || !statSync(p).isFile()) return { status: 404 };
      return { status: 200, body: readFileSync(p) };
    }
    const path = file.path.split('/').map(encodeURIComponent).join('/');
    const url = token
      ? `https://api.github.com/repos/${file.owner}/${file.repo}/contents/${path}?ref=${encodeURIComponent(file.ref)}`
      : `https://raw.githubusercontent.com/${file.owner}/${file.repo}/${encodeURIComponent(file.ref)}/${path}`;
    const headers = token
      ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'portfolio-build' }
      : { 'User-Agent': 'portfolio-build' };
    let res;
    try {
      // A stalled connection fails the build after `timeout` ms instead of hanging it.
      res = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
    } catch (e) {
      const why = e.name === 'TimeoutError' ? `no answer from GitHub within ${timeout / 1000} s` : e.message;
      throw new GithubFileError(`Couldn't download ${githubUrl(file)}: ${why}`);
    }
    if (!res.ok) return { status: res.status };
    return { status: 200, body: Buffer.from(await res.arrayBuffer()) };
  }

  function explain(file, status) {
    const where = githubUrl(file);
    if (status === 404) {
      return token
        ? `File not found: ${where}. Check the path and branch, and that the token can read ${file.owner}/${file.repo}.`
        : `File not found: ${where}. If ${file.owner}/${file.repo} is private, set GITHUB_FILES_TOKEN (see the README).`;
    }
    if (status === 401) return `GitHub rejected GITHUB_FILES_TOKEN while downloading ${where}. It may have expired; make a new one (see the README).`;
    if (status === 403 || status === 429) return `GitHub refused to send ${where} (HTTP ${status}). The token may lack access to ${file.owner}/${file.repo}, or the rate limit was hit.`;
    return `Couldn't download ${where} (HTTP ${status}).`;
  }

  function target(file, app) {
    const out = resolve(root, `.${localPath(file, { app }).split('/').map(decodeURIComponent).join('/')}`);
    if (out !== root && !out.startsWith(root + sep)) throw new GithubFileError(`Refusing to save ${githubUrl(file)} outside ${root}`);
    return out;
  }

  /** Downloads the file (once per build) and returns its site path. Throws a readable error if it can't. */
  function get(file, { app = false, optional = false } = {}) {
    const key = `${app ? 'app:' : ''}${file.owner}/${file.repo}/${file.ref}/${file.path}`;
    if (!fetched.has(key)) {
      fetched.set(key, (async () => {
        const res = await download(file);
        if (res.status !== 200) {
          if (optional && res.status === 404) return null;
          throw new GithubFileError(explain(file, res.status));
        }
        const out = target(file, app);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, res.body);
        return localPath(file, { app });
      })());
    }
    return fetched.get(key);
  }

  /**
   * Downloads a .js file as a canvas app when it has a wasm-bindgen <name>_bg.wasm next to it.
   * Returns the app's site path, or null if it isn't one.
   */
  async function getApp(file) {
    const wasm = bindgenWasm(file);
    if (!wasm || !(await get(wasm, { app: true, optional: true }))) return null;
    return get(file, { app: true });
  }

  return { get, getApp, dir: root, hasToken: Boolean(token), mock: Boolean(mockDir) };
}

const TYPES = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.csv': 'text/csv; charset=utf-8', '.html': 'text/html; charset=utf-8',
};
export const contentType = (path) => TYPES[extname(path).toLowerCase()] || 'text/plain; charset=utf-8';

/** Dev server middleware that serves the downloaded copies (the build copies them into dist instead). */
export function serveGithubFiles(dir, base = '/') {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const root = resolve(dir);
  return (req, res, next) => {
    let path = (req.url || '').split(/[?#]/)[0];
    if (path.startsWith(prefix)) path = `/${path.slice(prefix.length)}`;
    if (!path.startsWith(LOCAL_PREFIX) && !path.startsWith(APP_PREFIX)) return next();
    let file;
    try {
      file = resolve(root, `.${decodeURIComponent(path)}`);
    } catch {
      return next();
    }
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader('Content-Type', contentType(file));
    createReadStream(file).pipe(res);
  };
}
