import { visit } from 'unist-util-visit';
import { embedFor, embedHtml } from './embeds.js';
import { withBase } from './content.js';
import { iconSvg } from './icons.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// A YouTube / Vimeo / video link on its own line becomes an embedded player.
// Works with bare URLs, autolinks (<https://...>) and [title](url) links.
function soleUrl(node) {
  const kids = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
  if (kids.length !== 1) return null;
  const [child] = kids;
  if (child.type === 'text') {
    const v = child.value.trim();
    return /^(?:https?:\/\/|\/(?!\/))\S+$/.test(v) ? { url: v, title: '' } : null;
  }
  // A link titled "download" is a download link, not an embed.
  if (child.type === 'link' && String(child.title || '').toLowerCase() === 'download') return null;
  if (child.type === 'link') {
    const title = child.children.map((c) => c.value || '').join('');
    return { url: child.url, title: title === child.url ? '' : title };
  }
  return null;
}

export function remarkEmbeds({ base = '/', publicDirs = [], optimizeModels = process.env.NODE_ENV === 'production' } = {}) {
  const icons = { download: iconSvg('download', { size: 18 }), run: iconSvg('play_arrow', { size: 18 }), soon: iconSvg('deployed_code', { size: 36 }), play: iconSvg('play_arrow', { size: 40 }) };
  return (tree) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || index == null) return;
      const found = soleUrl(node);
      if (!found) return;
      const embed = embedFor(found.url);
      if (!embed) return;
      // A canvas app shows a placeholder until its build is in public/.
      const missing = embed.provider === 'canvas' && publicDirs.length > 0 && !publicDirs.some((d) => existsSync(join(d, embed.src)));
      embed.publicPath = embed.src;
      // Models are viewed from a compressed copy made after the build; the download stays the original.
      if (embed.provider === 'model' && optimizeModels && embed.src.startsWith('/') && !embed.src.startsWith('//')) {
        embed.viewSrc = withBase(`/_opt${embed.src}`, base);
      }
      // Embeds become raw HTML, which later URL rewriting can't see, so add the base path here.
      if (embed.src.startsWith('/') && !embed.src.startsWith('//') && !embed.src.startsWith(base)) embed.src = withBase(embed.src, base);
      parent.children[index] = { type: 'html', value: embedHtml(embed, found.title, { icons, missing }) };
    });
  };
}
