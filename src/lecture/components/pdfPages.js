// Renders single pages of lecture slide PDFs to image URLs in the browser, so generated topics can
// show the cited slide itself instead of a link. pdf.js loads on first use; each deck is fetched
// once and each page rendered once per visit, even when several topics cite the same deck.
const documents = new Map();
const pages = new Map();
const RENDER_WIDTH = 1400;

async function loadDocument(url) {
  if (!documents.has(url)) {
    const promise = import('pdfjs-dist').then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc ||= new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return pdfjs.getDocument({ url }).promise;
    });
    promise.catch(() => documents.delete(url));
    documents.set(url, promise);
  }
  return documents.get(url);
}

/** Splits a slide link such as `/api/datasets/ai/x/slides.pdf#page=7` into the file and page. */
export function pdfSlideTarget(slide) {
  const [file] = slide.url.split('#');
  return { file, page: slide.page };
}

/** Resolves to an object URL of the rendered page image. */
export function renderPdfPage(slide) {
  const { file, page } = pdfSlideTarget(slide);
  const key = file + '#' + page;
  if (!pages.has(key)) {
    const promise = (async () => {
      const pdf = await loadDocument(file);
      const pdfPage = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: RENDER_WIDTH / pdfPage.getViewport({ scale: 1 }).width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pdfPage.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(value => value ? resolve(value) : reject(new Error('Slide could not be drawn.')), 'image/png'));
      return URL.createObjectURL(blob);
    })();
    promise.catch(() => pages.delete(key));
    pages.set(key, promise);
  }
  return pages.get(key);
}
