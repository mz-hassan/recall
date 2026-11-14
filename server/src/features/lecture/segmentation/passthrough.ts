import type { LectureKey, TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import type { MomentDraft } from '../store/types.ts';
import type { Segmenter } from './types.ts';

export const formatLectureTime = (seconds: number) => {
  const whole = Math.floor(seconds);
  return [Math.floor(whole / 60), whole % 60].map(value => String(value).padStart(2, '0')).join(':');
};

/** Moment shape for raw transcript with no generated notes yet. */
export function rawMoment(key: LectureKey, index: number, chunk: TranscriptChunk): MomentDraft {
  const title = 'Transcript chunk ' + index;
  const label = formatLectureTime(chunk.time);
  return {
    id: `${key.courseId}/${key.lectureId}/moment/${index}`,
    time: chunk.time, label, title, short: title, type: 'TRANSCRIPT',
    summary: '', quote: chunk.text,
    quoteTime: chunk.timeSource === 'transcript' ? label + ' in the recording' : 'Simulation time',
    intuition: '', slides: [], equations: [], artifacts: [], graph: null,
    status: 'open', enrichment: 'none', timeSource: chunk.timeSource,
    chunkSeqs: [chunk.seq], sources: [chunk.span],
  };
}

/**
 * One moment per chunk, matching today's browser replay. Each new chunk closes the previous moment
 * (a new revision), which exercises the same open → closed path the real segmenter will use.
 */
export function createPassthroughSegmenter(): Segmenter {
  let open: MomentDraft | null = null;
  let count = 0;
  return {
    onChunk(chunk, { key, store }) {
      if (open) store.saveMoment(key, { ...open, status: 'closed' });
      count += 1;
      open = rawMoment(key, count, chunk);
      store.saveMoment(key, open);
    },
    finish({ key, store }) {
      if (open) store.saveMoment(key, { ...open, status: 'closed' });
      open = null;
    },
  };
}
