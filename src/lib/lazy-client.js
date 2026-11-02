// Small helpers that keep heavy embeds from loading before they are needed.

/** Calls `load` once, when any of `elements` comes within `margin` of the screen. */
export function whenNear(elements, load, margin = '600px') {
  const list = [...elements];
  if (!list.length) return;
  if (!('IntersectionObserver' in window)) { load(); return; }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { observer.disconnect(); load(); }
  }, { rootMargin: margin });
  list.forEach((el) => observer.observe(el));
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The YouTube / Vimeo player; matches playerIframe() in embeds.js. */
export function playerHtml(src, label) {
  const url = `${src}${src.includes('?') ? '&' : '?'}autoplay=1`;
  return `<iframe src="${escAttr(url)}" title="${escAttr(label)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

/** Swaps a video's play button for the real player when it is pressed. */
export function setupVideoFacades(root = document) {
  root.addEventListener('click', (event) => {
    const button = event.target.closest?.('.embed-facade');
    const figure = button?.closest('[data-video-embed]');
    if (!figure) return;
    figure.innerHTML = playerHtml(figure.dataset.src, figure.dataset.title);
    figure.dataset.playing = 'true';
    figure.querySelector('iframe').focus();
  });
}
