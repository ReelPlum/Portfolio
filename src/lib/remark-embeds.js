import { visit } from 'unist-util-visit';
import { embedFor, embedHtml } from './embeds.js';
import { withBase } from './content.js';

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
  if (child.type === 'link') {
    const title = child.children.map((c) => c.value || '').join('');
    return { url: child.url, title: title === child.url ? '' : title };
  }
  return null;
}

export function remarkEmbeds({ base = '/' } = {}) {
  return (tree) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || index == null) return;
      const found = soleUrl(node);
      if (!found) return;
      const embed = embedFor(found.url);
      if (!embed) return;
      // Embeds become raw HTML, which later URL rewriting can't see, so add the base path here.
      if (embed.src.startsWith('/') && !embed.src.startsWith('//') && !embed.src.startsWith(base)) embed.src = withBase(embed.src, base);
      parent.children[index] = { type: 'html', value: embedHtml(embed, found.title) };
    });
  };
}
