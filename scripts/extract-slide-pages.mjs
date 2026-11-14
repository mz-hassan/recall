// Re-extracts every slide PDF in a course dataset page by page, writing `<deck>.pages.txt` next to it
// with "--- PDF page N ---" markers. The server prefers these files because their page numbers are
// exact; the older .txt extracts lost page breaks for several decks.
//
// Usage: npm run extract:slides [-- --course datasets/cs690s]
// Needs pdftotext (Poppler): `brew install poppler` or `apt install poppler-utils`. Only whoever
// regenerates the files needs it; the output is committed with the dataset.
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';

const run = promisify(execFile);
const { values } = parseArgs({ options: { course: { type: 'string', default: 'datasets/cs690s' } } });
const root = path.resolve(values.course);
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

try {
  await run('pdftotext', ['-v']);
} catch {
  console.error('pdftotext was not found. Install Poppler (brew install poppler / apt install poppler-utils) and retry.');
  process.exit(1);
}

const decks = [...new Set(manifest.lectures.flatMap(lecture => lecture.slides.files.filter(file => file.endsWith('.pdf'))))];
for (const deck of decks) {
  const source = path.join(root, deck);
  // pdftotext separates pages with form feeds; "-" writes to stdout. execFile passes arguments
  // without a shell, so file names are never interpreted.
  const { stdout } = await run('pdftotext', ['-enc', 'UTF-8', source, '-'], { maxBuffer: 64 * 1024 * 1024 });
  const pages = stdout.split('\f');
  if (pages.at(-1)?.trim() === '') pages.pop();
  const text = pages.map((page, index) => `--- PDF page ${index + 1} ---\n${page.replace(/[ \t]+\n/g, '\n').trim()}\n`).join('\n');
  const target = source.replace(/\.pdf$/i, '.pages.txt');
  await writeFile(target, text);
  const empty = pages.filter(page => !page.trim()).length;
  console.log(`${path.relative(root, target)}: ${pages.length} pages${empty ? `, ${empty} without text (image-only)` : ''}`);
}
