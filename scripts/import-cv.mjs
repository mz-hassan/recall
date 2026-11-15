import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseVttTranscript } from '../server/src/features/lecture/transcription/parse.ts';

const source = process.argv[2];
if (!source) throw new Error('Usage: node --import tsx scripts/import-cv.mjs <course transcript folder>');
const root = new URL('../.local/course-imports/cs670/', import.meta.url);
await mkdir(new URL('transcripts/', root), { recursive: true });
const names = (await readdir(source)).filter(name => name.endsWith('.vtt')).sort((a,b) => {
  const index = name => /\((\d+)\)/.exec(name)?.[1] ? Number(/\((\d+)\)/.exec(name)[1]) : name.endsWith('_.vtt') ? 100 : 0;
  return index(a)-index(b);
});
const seen = new Set(), lectures = [];
let empty = 0, duplicates = 0;
for (const name of names) {
  const content = await readFile(path.join(source, name), 'utf8');
  const words = parseVttTranscript(content);
  if (words.length < 20) { empty++; continue; }
  const hash = createHash('sha256').update(words.map(word=>word.text).join(' ')).digest('hex');
  if (seen.has(hash)) { duplicates++; continue; } seen.add(hash);
  const number = lectures.length+1, file = `transcripts/recording-${String(number).padStart(2,'0')}.vtt`;
  await writeFile(new URL(file, root), content);
  lectures.push({ number, date: '', title: `Imported recording ${number}`, folder: 'transcripts', required: [], optional: [],
    source_filename: name, source_hash: hash, date_note: 'Recording date and course lecture number are not supplied by the caption file.',
    transcript: { status: 'available', files: [file] }, slides: { status: 'missing', files: [] } });
}
const manifest = { course: 'COMPSCI 670', title: 'Computer Vision', course_url: 'https://cvl-umass.github.io/cv-fall-2026/', lectures };
await writeFile(new URL('manifest.json', root), JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({ recordings: lectures.length, empty, duplicates, location: '.local/course-imports/cs670' }));
