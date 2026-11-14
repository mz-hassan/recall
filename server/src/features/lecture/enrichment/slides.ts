import type { z } from 'zod';
import type { LectureKey, Slide } from '../../../../../shared/contracts/lecture.ts';
import { findLecture, readDatasetFile } from '../../../data/dataset.ts';

export type SlidePage = { page: number; text: string };
export type SlideDeck = { pdfPath: string | null; pages: SlidePage[]; slide(page: number): z.infer<typeof Slide> };

const HEADER = /^(?:--- PDF page (\d+) ---|PAGE (\d+))\s*$/;
const FOOTER = /(\d+)\s*\/\s*(\d+)\s*$/;

const clean = (lines: string[]) => lines
  .filter(line => !line.includes('<latexit') && !line.includes('</latexit>'))
  .join(' ').replace(/\s+/g, ' ').trim();

/**
 * Splits a slide-text extract into pages. Extracts mark pages in one of three ways: a
 * "--- PDF page N ---" or "PAGE N" header, or a Beamer footer ending in "N/M". An extract with no
 * marks returns no pages: guessing page numbers would produce wrong citations.
 */
export function parseSlidePages(source: string): SlidePage[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const pages: SlidePage[] = [];

  if (lines.some(line => HEADER.test(line.trim()))) {
    let current: { page: number; lines: string[] } | null = null;
    for (const line of lines) {
      const match = HEADER.exec(line.trim());
      if (match) {
        if (current) pages.push({ page: current.page, text: clean(current.lines) });
        current = { page: Number(match[1] ?? match[2]), lines: [] };
      } else current?.lines.push(line);
    }
    if (current) pages.push({ page: current.page, text: clean(current.lines) });
    return pages.filter(page => page.text);
  }

  const footers = lines.map(line => FOOTER.exec(line.trim())).filter(Boolean);
  const total = footers.at(-1)?.[2];
  if (footers.length >= 2 && total && footers.every(match => match![2] === total)) {
    let buffer: string[] = [];
    for (const line of lines) {
      const match = FOOTER.exec(line.trim());
      if (match && match[2] === total) {
        // The footer line also carries the deck title before "N/M"; keep only the slide body.
        pages.push({ page: Number(match[1]), text: clean(buffer) });
        buffer = [];
      } else buffer.push(line);
    }
    return pages.filter(page => page.text);
  }
  return [];
}

const STOPWORDS = new Set(('the and for that this with you are was were have has had not but they their them then than there here what when where which while who whom will would could should can our your its it is in on of to a an as at be by or if so we do does did from into about just like okay yeah um uh gonna wanna kind sort really right going thing things think know mean actually basically one two also more most some any all each very much many way get got make made say said see let lets well now yes no only same other these those such how why because over under between both same here').split(' '));

const terms = (text: string) => (text.toLowerCase().match(/[\p{L}][\p{L}\p{N}-]{2,}/gu) ?? []).filter(term => !STOPWORDS.has(term));

/**
 * Picks the slide pages most likely shown during a topic, by vocabulary overlap weighted so that
 * rare words count more than common ones. Cheap and deterministic; the model then confirms or
 * rejects each candidate.
 */
export function findCandidateSlides(pages: SlidePage[], topicText: string, limit = 4): SlidePage[] {
  if (!pages.length) return [];
  const pageTerms = pages.map(page => new Set(terms(page.text)));
  const documentFrequency = new Map<string, number>();
  for (const set of pageTerms) for (const term of set) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  const topicCounts = new Map<string, number>();
  for (const term of terms(topicText)) topicCounts.set(term, (topicCounts.get(term) ?? 0) + 1);

  return pages
    .map((page, index) => {
      let score = 0;
      for (const term of pageTerms[index]!) {
        const count = topicCounts.get(term);
        if (count) score += Math.log(1 + count) * Math.log(1 + pages.length / documentFrequency.get(term)!);
      }
      return { page, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.page.page - b.page.page)
    .slice(0, limit)
    .map(entry => entry.page);
}

/** Pre-rendered slide images that ship with the app, by course and lecture. */
const SLIDE_IMAGES: Record<string, Record<string, (page: number) => string>> = {
  ai: { '2': page => `assets/slide-${String(page).padStart(2, '0')}.png` },
};

/**
 * A lecture that borrows part of another lecture's deck says so in its manifest note, e.g.
 * "The lecture 10 slide deck covers this topic on pages 26–47." Returns that range, if any.
 */
export function notedPageRange(note: string | undefined): [number, number] | null {
  const match = note && /pages\s+(\d+)\s*[–—-]\s*(\d+)/i.exec(note);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/**
 * Loads a lecture's slide deck with page text and how to link each page. Prefers the page-exact
 * `<deck>.pages.txt` written by `npm run extract:slides`, then the manifest's own text extract.
 */
export async function loadSlideDeck({ courseId, lectureId }: LectureKey): Promise<SlideDeck> {
  const lecture = await findLecture(courseId, lectureId);
  const txt = lecture?.slides.files.find(file => file.endsWith('.txt'));
  const pdf = lecture?.slides.files.find(file => file.endsWith('.pdf')) ?? null;
  const pagesFile = pdf?.replace(/\.pdf$/i, '.pages.txt');
  let source = '';
  for (const candidate of [pagesFile, txt]) {
    if (!candidate) continue;
    try {
      source = await readDatasetFile(courseId, candidate);
      break;
    } catch {
      // Not generated yet: fall back to the next source.
    }
  }
  const range = notedPageRange(lecture?.slides.note);
  const pages = parseSlidePages(source).filter(page => !range || (page.page >= range[0] && page.page <= range[1]));
  const image = SLIDE_IMAGES[courseId]?.[lectureId];
  return {
    pdfPath: pdf,
    pages,
    slide(page) {
      if (image) return { page, url: image(page), kind: 'image' };
      return { page, url: `api/datasets/${courseId}/${pdf}#page=${page}`, kind: 'pdf' };
    },
  };
}
