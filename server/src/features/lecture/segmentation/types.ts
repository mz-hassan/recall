import type { LectureKey, TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import type { LectureStore } from '../store/types.ts';

export type SegmenterContext = { key: LectureKey; store: LectureStore; signal: AbortSignal };

/**
 * Decides how incoming chunks become moments. Chunks arrive one at a time and in order; the next
 * chunk is not handed over until the previous call has finished. D2 uses the passthrough segmenter;
 * D3 replaces it with the model-backed one without touching the replay or the routes.
 */
export interface Segmenter {
  onChunk(chunk: TranscriptChunk, context: SegmenterContext): Promise<void> | void;
  /** Called once after the last chunk, to close whatever is still open. */
  finish(context: SegmenterContext): Promise<void> | void;
}
