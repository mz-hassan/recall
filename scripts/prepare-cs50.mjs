import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Public CS50x 2025 Week 0 links point at the Fall 2024 recording/materials.
const root = new URL('../datasets/cs50/lecture0/', import.meta.url);
await mkdir(root, { recursive: true });
const sources = {
  'lecture0.pdf': 'https://cdn.cs50.net/2024/fall/lectures/0/lecture0.pdf',
  'transcript.txt': 'https://cdn.cs50.net/2024/fall/lectures/0/lang/en/lecture0.txt',
  'transcript.srt': 'https://cdn.cs50.net/2024/fall/lectures/0/lang/en/lecture0.srt',
  'notes.html': 'https://cs50.harvard.edu/x/2025/notes/0/',
};
const hashes = {};
for (const [name, url] of Object.entries(sources)) {
  const staged = process.argv.includes('--staged') && new URL('../.local/cs50-pilot/' + name, import.meta.url);
  const bytes = staged ? await readFile(staged) : Buffer.from(await (await fetch(url)).arrayBuffer());
  if (!bytes.length) throw new Error('Empty download: ' + url);
  await writeFile(new URL(name, root), bytes);
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
}
const srt = await readFile(new URL('transcript.srt', root), 'utf8');
await writeFile(new URL('transcript.vtt', root), 'WEBVTT\n\n' + srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'));
const html = await readFile(new URL('notes.html', root), 'utf8');
const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html;
const notes = main.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<\/(?:p|h[1-6]|li|pre|table)>/gi, '\n\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .split(/\n\s*\n/).map(paragraph => paragraph.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
await writeFile(new URL('notes.txt', root), notes);
const data = new Uint8Array(await readFile(new URL('lecture0.pdf', root)));
const task = getDocument({ data, useSystemFonts: true });
const pages = [];
try {
  const pdf = await task.promise;
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const runs = content.items.filter(item => 'str' in item && item.str.trim()).map((item, i) => {
      const transform = Util.transform(viewport.transform, item.transform);
      const height = Math.hypot(transform[2], transform[3]);
      return { id: String(i), text: item.str, rect: {
        x: Math.max(0, transform[4] / viewport.width), y: Math.max(0, (transform[5] - height) / viewport.height),
        width: Math.min(1, item.width / viewport.width), height: Math.min(1, height / viewport.height),
      } };
    });
    pages.push({ page: number, width: viewport.width, height: viewport.height, runs });
  }
} finally { await task.destroy(); }
await writeFile(new URL('lecture0.pages.json', root), JSON.stringify({ fingerprint: hashes['lecture0.pdf'], pages }, null, 2) + '\n');
await writeFile(new URL('lecture0.pages.txt', root), pages.map(page => `--- PDF page ${page.page} ---\n${page.runs.map(run => run.text).join('\n')}`).join('\n\n'));
await writeFile(new URL('sources.json', root), JSON.stringify({ sources, sha256: hashes }, null, 2) + '\n');
console.log(`Prepared CS50 Lecture 0: ${pages.length} PDF pages, ${pages.filter(page => page.runs.length).length} with text.`);
