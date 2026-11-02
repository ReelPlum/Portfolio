// WCAG contrast helpers, used to keep highlighted code readable on the site's code backgrounds.

const channels = (hex) => hex.replace('#', '').slice(0, 6).match(/../g).map((x) => parseInt(x, 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

export function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/**
 * The colour closest to `hex` that reaches `min` contrast against every background: mixed step by step
 * towards black (light backgrounds) or white (dark ones), so the hue stays recognisable.
 */
export function readable(hex, backgrounds, min = 4.5) {
  const worst = () => Math.min(...backgrounds.map((b) => contrast(color, b)));
  let color = toHex(channels(hex));
  if (worst() >= min) return color;
  const dark = luminance(backgrounds[0]) > 0.4;
  const target = dark ? [0, 0, 0] : [255, 255, 255];
  const start = channels(hex);
  for (let t = 0.02; t <= 1; t += 0.02) {
    color = toHex(start.map((v, i) => v + (target[i] - v) * t));
    if (worst() >= min) return color;
  }
  return color;
}
