import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { daggerBundle } from '../src/readings/data/dagger.js';
const pdf = await getDocument({ data: new Uint8Array(await readFile(new URL('../datasets/cs690s/lectures/02_2026-09-15_limitations-of-behavior-cloning/required/dagger.pdf', import.meta.url))) }).promise;
await mkdir(new URL('../tmp/pdfs/', import.meta.url), { recursive: true });
for (const n of [1, 2, 4, 5, 7, 8]) {
  const page = await pdf.getPage(n), viewport = page.getViewport({ scale: 1.4 });
  const canvas = createCanvas(viewport.width, viewport.height), context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport }).promise;
  for (const highlight of daggerBundle.highlights.filter(h => h.page === n)) {
    context.fillStyle = { claim: '#f9d26e66', definition: '#71c9f255', algorithm: '#b8a0f766' }[highlight.kind];
    for (const r of highlight.rects) context.fillRect(r.x * viewport.width, r.y * viewport.height, r.width * viewport.width, r.height * viewport.height);
  }
  await writeFile(new URL(`../tmp/pdfs/verified-${n}.png`, import.meta.url), canvas.toBuffer('image/png'));
}
await pdf.cleanup();
console.log('Rendered all six annotated pages for visual inspection.');
