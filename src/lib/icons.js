import * as lucide from 'lucide-static';

// Brand icons were removed from Lucide, so the few we need live here.
const extra = {
  github: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
};

// Which micro-animation each icon plays when its button / link is hovered, focused or pressed.
// The animations themselves are in src/styles/icons.css.
export const animations = {
  sun: 'spin', moon: 'swing', 'sun-moon': 'spin', monitor: 'pop',
  'arrow-right': 'nudge-x', 'arrow-left': 'nudge-x-back', 'arrow-up-right': 'nudge-diag', 'chevron-right': 'nudge-x',
  'external-link': 'nudge-diag', github: 'wiggle', mail: 'wiggle', rss: 'pulse',
  play: 'pop', 'rotate-ccw': 'spin-back', copy: 'pop', check: 'draw', menu: 'pop', x: 'spin',
  'folder-code': 'bounce', 'pen-line': 'wiggle', user: 'bounce', home: 'bounce', search: 'wiggle',
  calendar: 'bounce', tag: 'swing', 'square-terminal': 'pop', 'link': 'wiggle',
};

export function toPascal(name) {
  return String(name).split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

export function hasIcon(name) {
  return Boolean(extra[name] || lucide[toPascal(name)]);
}

/** Returns inline SVG markup for an icon, sized and labelled. Throws on unknown names so typos fail the build. */
export function iconSvg(name, { size = 20, label } = {}) {
  const raw = extra[name] || lucide[toPascal(name)];
  if (!raw) throw new Error(`Unknown icon "${name}"`);
  const anim = animations[name] || 'pop';
  const a11y = label ? `role="img" aria-label="${String(label).replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^\s*<svg\b[^>]*?class="[^"]*"/, '<svg')
    .replace(/<svg\b/, `<svg class="icon" data-icon="${name}" data-anim="${anim}" ${a11y} focusable="false"`)
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`)
    .trim();
}
