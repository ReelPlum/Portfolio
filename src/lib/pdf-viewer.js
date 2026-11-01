// Renders PDFs embedded in posts (a .pdf link on its own line) page by page onto canvases.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function renderPdf(figure) {
  const link = figure.querySelector('figcaption a');
  const pages = figure.querySelector('.pdf-pages');
  if (!link || !pages || figure.dataset.rendered) return;
  figure.dataset.rendered = 'true';
  try {
    const doc = await pdfjs.getDocument({ url: link.href }).promise;
    const width = pages.clientWidth || 720;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.className = 'pdf-page';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${link.textContent}, page ${n} of ${doc.numPages}`);
      pages.append(canvas);
      await page.render({ canvas, viewport }).promise;
    }
    figure.dataset.pages = String(doc.numPages);
  } catch (e) {
    figure.dataset.error = 'true';
    pages.textContent = 'This PDF could not be displayed. Use the link below to open it.';
    console.warn('PDF failed to render', e);
  }
}

export function renderAllPdfs(root = document) {
  return Promise.all([...root.querySelectorAll('[data-pdf]')].map(renderPdf));
}
