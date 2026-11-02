// Small browser helpers for posts: heading link copy, diff view toggle, before/after sliders and the
// image lightbox. Nothing here animates; only the icons do (src/styles/icons.css).
import { iconHtml } from './icon-client.js';

/* ---------- heading anchors: go to the section and copy its address ---------- */
export function setupAnchors() {
  document.addEventListener('click', async (event) => {
    const a = event.target.closest?.('.heading-anchor');
    if (!a) return;
    const url = new URL(a.getAttribute('href'), location.href).href;
    try {
      await navigator.clipboard.writeText(url);
      a.classList.add('is-copied');
      announce('Link copied');
      setTimeout(() => a.classList.remove('is-copied'), 2000);
    } catch { /* copying blocked: the link still goes to the section */ }
  });
}

let live;
function announce(text) {
  if (!live) {
    live = document.createElement('div');
    live.className = 'visually-hidden';
    live.setAttribute('role', 'status');
    document.body.append(live);
  }
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 20);
}

/* ---------- diffs: split / unified ---------- */
function setDiffView(fig, view) {
    fig.dataset.view = view;
    for (const b of fig.querySelectorAll('.diff-toggle')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
    fig.querySelector('.diff-view-split').hidden = view !== 'split';
    fig.querySelector('.diff-view-unified').hidden = view !== 'unified';
}

export function setupDiffs() {
  // Side by side needs room; narrow screens start with one column.
  for (const fig of document.querySelectorAll('[data-diff]')) if (fig.clientWidth < 640) setDiffView(fig, 'unified');
  document.addEventListener('click', (event) => {
    const btn = event.target.closest?.('.diff-toggle');
    if (btn) setDiffView(btn.closest('[data-diff]'), btn.dataset.view);
  });
}

/* ---------- before / after ---------- */
export function setupCompare() {
  for (const fig of document.querySelectorAll('[data-compare]')) {
    const range = fig.querySelector('.compare-range');
    const after = fig.querySelector('.compare-label-after')?.textContent || 'After';
    const update = () => {
      fig.style.setProperty('--pos', `${range.value}%`);
      range.setAttribute('aria-valuetext', `${range.value}% ${after}`);
    };
    range.addEventListener('input', update);
    fig.classList.add('is-ready');
    update();
  }
}

/* ---------- lightbox ---------- */
export function setupLightbox() {
  const images = [...document.querySelectorAll('.prose img')]
    .filter((img) => !img.closest('a, button, .compare, .embed, .project-card') && !img.hasAttribute('data-no-lightbox'));
  if (!images.length) return;
  let index = 0;
  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  dialog.setAttribute('aria-label', 'Image viewer');
  dialog.innerHTML = `<figure class="lightbox-figure"><img class="lightbox-img" alt="" /><figcaption class="lightbox-caption"></figcaption></figure>
    <p class="lightbox-count" aria-live="polite"></p>
    <button type="button" class="icon-btn lightbox-close" aria-label="Close">${iconHtml('close')}</button>
    <button type="button" class="icon-btn lightbox-prev" aria-label="Previous image">${iconHtml('chevron_left')}</button>
    <button type="button" class="icon-btn lightbox-next" aria-label="Next image">${iconHtml('chevron_right')}</button>`;
  document.body.append(dialog);
  const big = dialog.querySelector('.lightbox-img');
  const caption = dialog.querySelector('.lightbox-caption');
  const count = dialog.querySelector('.lightbox-count');
  const multi = images.length > 1;
  dialog.querySelector('.lightbox-prev').hidden = !multi;
  dialog.querySelector('.lightbox-next').hidden = !multi;

  const show = (i) => {
    index = (i + images.length) % images.length;
    const img = images[index];
    big.src = img.currentSrc || img.src;
    big.alt = img.alt;
    caption.textContent = img.alt;
    caption.hidden = !img.alt;
    count.textContent = multi ? `${index + 1} of ${images.length}` : '';
  };
  const open = (i) => { show(i); dialog.showModal(); };

  images.forEach((img, i) => {
    img.classList.add('lightbox-trigger');
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', `Open image${img.alt ? `: ${img.alt}` : ''}`);
    img.addEventListener('click', () => open(i));
    img.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
  });
  dialog.querySelector('.lightbox-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.lightbox-prev').addEventListener('click', () => show(index - 1));
  dialog.querySelector('.lightbox-next').addEventListener('click', () => show(index + 1));
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && multi) show(index - 1);
    if (e.key === 'ArrowRight' && multi) show(index + 1);
  });
  // Swipe left / right on touch screens. Clicking the dark area around the image closes it, but only
  // when the press also started there (regression: the click that ends a swipe closed the viewer).
  let startX = null;
  let downOnBackdrop = false;
  dialog.addEventListener('pointerdown', (e) => { startX = e.clientX; downOnBackdrop = e.target === dialog; });
  dialog.addEventListener('click', (e) => { if (e.target === dialog && downOnBackdrop) dialog.close(); });
  dialog.addEventListener('close', () => images[index]?.focus());
  dialog.addEventListener('pointerup', (e) => {
    if (startX == null || !multi) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) downOnBackdrop = false;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
}
