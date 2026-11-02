import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Material Symbols (Rounded) from @material-symbols/svg-400. Each icon is rendered with both its
// outlined and filled shapes; on hover the icon fills in and plays a small motion (src/styles/icons.css).
const require = createRequire(import.meta.url);
const ROOT = join(dirname(require.resolve('@material-symbols/svg-400/package.json')), 'rounded');

// Brand marks are not part of Material Symbols.
const brands = {
  github: 'M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z',
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  bluesky: 'M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z',
  linkedin: 'M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z',
};

// Which motion each icon plays when its button / link is hovered, focused or pressed.
export const animations = {
  light_mode: 'spin', dark_mode: 'swing',
  arrow_forward: 'nudge-x', arrow_back: 'nudge-x-back', north_east: 'nudge-diag', chevron_right: 'nudge-x', open_in_new: 'nudge-diag',
  mail: 'wiggle', rss_feed: 'pulse', github: 'wiggle', linkedin: 'wiggle', link: 'wiggle',
  play_arrow: 'pop', restart_alt: 'spin-back', content_copy: 'pop', check: 'pop', menu: 'pop', close: 'spin',
  search: 'wiggle', calendar_today: 'bounce', terminal: 'pop', home: 'bounce', person: 'bounce', code: 'pop',
  article: 'bounce', download: 'bounce', deployed_code: 'spin', view_in_ar: 'spin', table: 'pop', stars_2: 'pulse', schedule: 'spin',
  info: 'pop', lightbulb: 'pulse', priority_high: 'bounce', warning: 'wiggle', report: 'wiggle', update: 'spin', account_tree: 'pop',
  x: 'wiggle', bluesky: 'bounce', share: 'nudge-diag', rocket_launch: 'nudge-diag', build: 'wiggle', task_alt: 'pop', pause_circle: 'pop', inventory_2: 'bounce', science: 'wiggle', history: 'spin-back', group: 'bounce', work: 'bounce', school: 'bounce', badge: 'pop', public: 'spin',
  toc: 'pop', keyboard_arrow_down: 'bounce', chevron_left: 'nudge-x-back', functions: 'pop', menu_book: 'bounce', verified: 'pop', view_column_2: 'pop', view_agenda: 'pop',
};

const cache = new Map();
function paths(name) {
  if (!cache.has(name)) {
    const file = (suffix) => join(ROOT, `${name}${suffix}.svg`);
    if (!existsSync(file(''))) throw new Error(`Unknown icon "${name}"`);
    const d = (f) => (existsSync(f) ? /<path d="([^"]+)"/.exec(readFileSync(f, 'utf8'))?.[1] : null);
    cache.set(name, { outline: d(file('')), fill: d(file('-fill')) });
  }
  return cache.get(name);
}

export function hasIcon(name) {
  try {
    return Boolean(brands[name] || paths(name).outline);
  } catch {
    return false;
  }
}

/** Inline SVG for an icon. Throws on unknown names so typos fail the build. */
export function iconSvg(name, { size = 20, label } = {}) {
  const anim = animations[name] || 'pop';
  const a11y = label ? `role="img" aria-label="${String(label).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  const attrs = `class="icon" data-icon="${name}" data-anim="${anim}" ${a11y} focusable="false" width="${size}" height="${size}" fill="currentColor"`;
  if (brands[name]) return `<svg ${attrs} viewBox="0 0 24 24"><path d="${brands[name]}"/></svg>`;
  const { outline, fill } = paths(name);
  const filled = fill && fill !== outline ? `<path class="icon-fill" d="${fill}"/>` : '';
  return `<svg ${attrs} viewBox="0 -960 960 960"><path class="icon-outline" d="${outline}"/>${filled}</svg>`;
}
