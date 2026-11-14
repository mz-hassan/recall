import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

const file = new URL('../datasets/cs690s/lectures/02_2026-09-15_limitations-of-behavior-cloning/required/dagger.pdf', import.meta.url);
const doc = await getDocument({ data: new Uint8Array(await readFile(file)), useSystemFonts: true }).promise;
const pages = [];
for (let page = 1; page <= doc.numPages; page++) {
  const pdfPage = await doc.getPage(page);
  const viewport = pdfPage.getViewport({ scale: 1, rotation: 0 });
  const content = await pdfPage.getTextContent();
  const lines = content.items.filter(item => 'str' in item && item.str.trim()).map(item => {
    const t = Util.transform(viewport.transform, item.transform);
    const h = Math.hypot(t[2], t[3]);
    const ascent = content.styles[item.fontName]?.ascent ?? 0.8;
    return { text: item.str, rect: { x: t[4] / viewport.width, y: (t[5] - h * ascent) / viewport.height, width: item.width / viewport.width, height: h / viewport.height } };
  });
  // Reading order for this two-column paper, retaining geometry for every text run.
  lines.sort((a, b) => {
    const colA = a.rect.x > 0.49 ? 1 : 0, colB = b.rect.x > 0.49 ? 1 : 0;
    return colA - colB || (Math.abs(a.rect.y - b.rect.y) > 0.004 ? a.rect.y - b.rect.y : a.rect.x - b.rect.x);
  });
  pages.push({ page, width: viewport.width, height: viewport.height, lines });
}
const output = new URL('../src/readings/data/dagger-pages.json', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, JSON.stringify({ fingerprint: doc.fingerprints[0], pages }, null, 2) + '\n');
if (process.argv.includes('--inspect')) for (const p of pages) console.log('\nPAGE ' + p.page + '\n' + p.lines.map((l, i) => i + ': ' + l.text).join('\n'));
console.log(`Prepared ${pages.length} pages (${doc.fingerprints[0]}).`);
await doc.cleanup();
