import type { z } from 'zod';
import type {
  Artifact, LectureKey, Moment, SessionState, TimelineEvent, TimelineSnapshotEvent, TranscriptChunk,
} from '../../../../../shared/contracts/lecture.ts';

/** A moment as a writer hands it in; the store assigns the revision. */
export type MomentDraft = Omit<Moment, 'revision'>;

export type TimeRange = { from: number; to: number };

/**
 * Lecture timeline storage. The pipeline (segmentation, enrichment) writes through it; chat and
 * artifact features read from it and attach artifacts. Every write that changes what a student sees
 * becomes a numbered TimelineEvent for live clients.
 */
export interface LectureStore {
  // Read side: what chat and artifacts use.
  getMoments(key: LectureKey, range?: TimeRange): Moment[];
  getMoment(key: LectureKey, momentId: string): Moment | undefined;
  /** Chunks overlapping the range, in order. Raw words: the most faithful source for "what did I miss". */
  getTranscriptRange(key: LectureKey, range: TimeRange): TranscriptChunk[];
  getRunningSummary(key: LectureKey): string | null;
  /** Adds an artifact to a moment as a new revision. Throws if the moment does not exist. */
  attachArtifact(key: LectureKey, momentId: string, artifact: z.infer<typeof Artifact>): Moment;

  // Write side: the live pipeline.
  /** Starts a new run: clears chunks, moments and summary, and pushes a fresh snapshot to clients. */
  reset(key: LectureKey, session: SessionState): void;
  appendChunk(key: LectureKey, chunk: TranscriptChunk): void;
  saveMoment(key: LectureKey, draft: MomentDraft): Moment;
  setRunningSummary(key: LectureKey, summary: string): void;
  setSession(key: LectureKey, session: SessionState): void;
  getSession(key: LectureKey): SessionState | null;

  // Live delivery.
  snapshot(key: LectureKey): TimelineSnapshotEvent;
  /** Events after `seq`, or 'too_old' when the client must start again from a snapshot. */
  eventsAfter(key: LectureKey, seq: number): TimelineEvent[] | 'too_old';
  subscribe(key: LectureKey, listener: (event: TimelineEvent) => void): () => void;
}
