import Slugger from 'github-slugger';
import { toString } from 'hast-util-to-string';
import { iconSvg } from './icons.js';
import { fromHtml } from './hast-html.js';

const HEADINGS = new Set(['h2', 'h3', 'h4']);

/**
 * Gives every h2–h4 an id (the same slugs Astro uses, so "On this page" links still match) and a link
 * icon after the text. Clicking the icon goes to the section and copies its address (src/layouts/Base.astro).
 */
export function rehypeHeadingAnchors() {
  return (tree) => {
    const slugger = new Slugger();
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.type !== 'element') continue;
        if (/^h[1-6]$/.test(child.tagName)) {
          const text = toString(child).trim();
          child.properties ||= {};
          if (typeof child.properties.id !== 'string') child.properties.id = slugger.slug(text);
          else slugger.slug(child.properties.id);
          if (HEADINGS.has(child.tagName) && child.properties.id !== 'footnote-label') {
            child.properties.className = [...(child.properties.className || []), 'has-anchor'];
            child.children.push({
              type: 'element', tagName: 'a',
              properties: { className: ['heading-anchor'], href: `#${child.properties.id}`, ariaLabel: `Copy link to “${text}”`, dataIconTrigger: '' },
              children: fromHtml(iconSvg('link', { size: 18 })),
            });
          }
          continue;
        }
        visit(child);
      }
    };
    visit(tree);
  };
}
