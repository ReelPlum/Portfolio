// Icons for markup built in the browser. The page renders them once in <template id="ui-icons">
// (src/layouts/Base.astro) because the icon files are only readable at build time.
export function iconHtml(name) {
  const t = document.getElementById('ui-icons');
  return t?.content.querySelector(`[data-icon="${name}"]`)?.outerHTML || '';
}
