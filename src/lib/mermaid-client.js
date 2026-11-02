// Draws ```mermaid blocks in the browser, in the colours of the current light / dark setting.
// Loaded only on pages that have a diagram. Without JavaScript the diagram's source stays visible.
let counter = 0;

async function drawAll(mermaid, dark) {
  // The site's own colour tokens, so diagrams match the page in both modes.
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'strict',
    fontFamily: 'Roboto Flex Variable, Roboto, system-ui, sans-serif',
    themeVariables: {
      darkMode: dark,
      background: v('--surface'),
      primaryColor: v('--surface-container'),
      primaryTextColor: v('--on-surface'),
      primaryBorderColor: v('--outline'),
      secondaryColor: v('--secondary-container'),
      tertiaryColor: v('--surface-high'),
      lineColor: v('--on-surface-variant'),
      textColor: v('--on-surface'),
      edgeLabelBackground: v('--surface'),
      clusterBkg: v('--surface-low'),
      noteBkgColor: v('--surface-high'),
      noteTextColor: v('--on-surface'),
    },
  });
  for (const fig of document.querySelectorAll('[data-mermaid]')) {
    const source = fig.querySelector('.mermaid-source');
    const target = fig.querySelector('.mermaid-diagram');
    try {
      const { svg } = await mermaid.render(`mermaid-${++counter}`, source.textContent);
      target.innerHTML = svg;
      const label = fig.getAttribute('aria-label') || 'Diagram';
      target.firstElementChild?.setAttribute('role', 'img');
      target.firstElementChild?.setAttribute('aria-label', label);
      target.hidden = false;
      source.hidden = true;
      fig.dataset.rendered = 'true';
      fig.classList.remove('is-error');
    } catch (e) {
      // Keep the source visible so the reader still sees something, and say why.
      fig.classList.add('is-error');
      fig.dataset.rendered = 'error';
      fig.dataset.error = e?.message || String(e);
      document.getElementById(`dmermaid-${counter}`)?.remove();
    }
  }
}

export async function renderMermaid() {
  const { default: mermaid } = await import('mermaid');
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  await drawAll(mermaid, scheme.matches);
  scheme.addEventListener('change', (e) => drawAll(mermaid, e.matches));
}
