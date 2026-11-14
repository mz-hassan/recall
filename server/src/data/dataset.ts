import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Lecture, Source } from '../../../shared/contracts/graph.ts';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const material = z.object({ files: z.array(z.string()), status: z.string().optional(), source_url: z.url().optional() });
const manifestSchema = z.object({ lectures: z.array(z.object({
  number: z.number().int().nonnegative(), title: z.string(),
  transcript: material, slides: material,
})) });
export interface LectureSource {
  load(courseId: string, lectureId: string): Promise<Lecture>;
  list(courseId: string): Promise<{ id: string; title: string; available: boolean }[]>;
}
export class DatasetSource implements LectureSource {
  constructor(private root = fileURLToPath(new URL('../../../datasets/cs690s/', import.meta.url))) {}
  private async manifest(courseId: string) {
    if (courseId !== 'ai') throw new Error('No dataset source is configured for this course.');
    return manifestSchema.parse(JSON.parse(await readFile(resolve(this.root, 'manifest.json'), 'utf8')));
  }
  private async safePath(path: string) {
    const root = await realpath(this.root);
    const target = await realpath(resolve(root, path));
    if (!target.startsWith(root + sep)) throw new Error('Source path must stay inside the dataset folder.');
    return target;
  }
  async list(courseId: string) {
    const manifest = await this.manifest(courseId);
    return manifest.lectures.map(item => ({ id: String(item.number), title: item.title,
      available: [...item.transcript.files, ...item.slides.files].some(file => /\.(txt|vtt|pdf)$/.test(file)) }));
  }
  async load(courseId: string, lectureId: string): Promise<Lecture> {
    const manifest = await this.manifest(courseId);
    const lecture = manifest.lectures.find(item => String(item.number) === lectureId);
    if (!lecture) throw new Error('Lecture not found in the dataset manifest.');
    const sources: Source[] = [];
    for (const [kind, material] of [['transcript', lecture.transcript], ['slides', lecture.slides]] as const) {
      const textPaths = material.files.filter(path => path.endsWith('.txt'));
      const paths = (textPaths.length ? textPaths : material.files.filter(path => path.endsWith(kind === 'slides' ? '.pdf' : '.vtt'))).sort();
      // A listed but missing file means the writer has not completed its handoff.
      for (const path of paths) {
        const file = await this.safePath(path);
        const url = material.source_url;
        if (url && !['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Unsupported source URL protocol.');
        if (path.endsWith('.pdf')) {
          const task = getDocument({ data: new Uint8Array(await readFile(file)), useSystemFonts: true });
          try {
            const pdf = await task.promise;
            for (let page = 1; page <= pdf.numPages; page++) {
              const content = await (await pdf.getPage(page)).getTextContent();
              const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
              if (!text) continue; // Image-only pages cannot supply text evidence.
              sources.push({ id: digest(`${path}#page=${page}`).slice(0, 24), title: `${lecture.title} · slides · page ${page}`, text, path, page, hash: digest(text), ...(url ? { url } : {}) });
            }
          } finally { await task.destroy(); }
        } else {
          const original = await readFile(file, 'utf8');
          const text = original.replace(/<latexit\b[^>]*>[\s\S]*?<\/latexit>/g, '').replace(/\r\n?/g, '\n').trim();
          if (!text) throw new Error(`Empty ${kind} text extract: ${path}`);
          sources.push({ id: digest(path).slice(0, 24), title: `${lecture.title} · ${kind}`, text, path, hash: digest(text), ...(url ? { url } : {}) });
        }
      }
    }
    if (!sources.length) throw new Error('No readable transcript or slide text is available. Save TXT/VTT transcripts or text-based PDF/TXT slides before sending completion. Scanned slides need text extracts.');
    return { courseId, id: lectureId, title: lecture.title, sources,
      contentHash: digest(JSON.stringify({ title: lecture.title, sources: sources.map(({ id, hash, url }) => ({ id, hash, url })) })) };
  }
}
