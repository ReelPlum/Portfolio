import { visit } from 'unist-util-visit';
import { parseGithubUrl, localPath } from './github-files.js';
import { parseInclude } from './code-blocks.js';
import { embedFor } from './embeds.js';
import { ALWAYS_DOWNLOAD } from './rehype-download-links.js';

// Swaps links to files on GitHub for a downloaded copy, so the other plugins treat them like files in public/:
//   - a link on a line by itself that would show something (code, a text / CSV file, PDF, video, 3D model, canvas app)
//   - images:  ![Diagram](https://github.com/me/repo/blob/main/diagram.png)
//   - download links: [Slides](https://github.com/me/repo/blob/main/talk.pdf "download"), and archives / installers
// Any other link to GitHub stays a link to GitHub. Runs before remark-code and remark-embeds.

function soleLink(node) {
  const kids = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
  if (kids.length !== 1) return null;
  const [c] = kids;
  if (c.type === 'text') return { node: c, url: c.value.trim(), kind: 'text' };
  if (c.type === 'link') {
    const text = c.children.map((k) => k.value || '').join('');
    return { node: c, url: c.url, kind: text === c.url ? 'autolink' : 'link' };
  }
  return null;
}

/** Whether a site path on its own line would be shown as something (code block, table, embed). */
const showsOnItsOwn = (path) => Boolean(parseInclude(path) || embedFor(path));

export function remarkGithubFiles({ files } = {}) {
  return async (tree, vfile) => {
    if (!files) return;
    const jobs = [];
    const where = vfile?.path ? ` (in ${vfile.path})` : '';
    const run = (p) => jobs.push(p.catch((e) => { throw new Error(`${e.message}${where}`); }));
    const own = new Set();

    visit(tree, 'paragraph', (node) => {
      const found = soleLink(node);
      if (!found) return;
      if (found.kind === 'link' && String(found.node.title || '').toLowerCase() === 'download') return;
      const file = parseGithubUrl(found.url);
      if (!file) return;
      own.add(found.node);
      const plain = localPath(file) + file.suffix;
      const setUrl = (path) => {
        if (found.kind === 'link') found.node.url = path;
        else node.children = [{ type: 'text', value: path }];
      };
      // A .js file might be a wasm-bindgen app (it has a _bg.wasm next to it): that runs in a canvas.
      if (/\.m?js$/i.test(file.path)) {
        run(files.getApp(file).then(async (app) => {
          if (app) return setUrl(app + file.suffix);
          if (showsOnItsOwn(plain)) setUrl(await files.get(file) + file.suffix);
        }));
        return;
      }
      if (!showsOnItsOwn(plain)) return own.delete(found.node);
      run(files.get(file).then((p) => setUrl(p + file.suffix)));
    });

    visit(tree, (n) => n.type === 'image' || n.type === 'link', (node) => {
      if (own.has(node)) return;
      const file = parseGithubUrl(node.url);
      if (!file) return;
      if (node.type === 'link') {
        const marked = String(node.title || '').toLowerCase() === 'download';
        if (!marked && !ALWAYS_DOWNLOAD.test(file.path)) return;
      }
      run(files.get(file).then((p) => { node.url = p + file.suffix; }));
    });

    await Promise.all(jobs);
  };
}
