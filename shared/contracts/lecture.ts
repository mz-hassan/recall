import { z } from 'zod';

// Shared lecture contracts: what the server sends and the timeline UI renders.
// Owner: live pipeline (Dhev). Changes go through a PR the student-side owner (Helly) reviews.
// This file must stay browser-safe: no server-only imports.

export const CONTRACT_VERSION = 1;

/** Identifies a lecture: course ID from the library ('ai') + manifest lecture number as a string. */
export const LectureKey = z.object({
  courseId: z.string().min(1),
  lectureId: z.string().min(1),
});
export type LectureKey = z.infer<typeof LectureKey>;

/**
 * Where a piece of text came from. `path` is relative to the course dataset folder.
 * TXT sources carry character offsets into that file; VTT sources carry cue times.
 */
export const SourceSpan = z.object({
  path: z.string().min(1),
  startChar: z.number().int().nonnegative().optional(),
  endChar: z.number().int().nonnegative().optional(),
  startTime: z.number().nonnegative().optional(),
  endTime: z.number().nonnegative().optional(),
}).refine(span => (span.startChar !== undefined && span.endChar !== undefined) || span.startTime !== undefined,
  'A source span needs a character range or a start time');
export type SourceSpan = z.infer<typeof SourceSpan>;

/** How a time value was obtained. 'simulated' = chunk index x replay interval, not real lecture time. */
export const TimeSource = z.enum(['transcript', 'simulated']);
export type TimeSource = z.infer<typeof TimeSource>;

/** One piece of transcript as it arrives, in order. */
export const TranscriptChunk = z.object({
  seq: z.number().int().positive(),
  text: z.string(),
  /** Lecture time in seconds where the chunk starts and ends. */
  time: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
  timeSource: TimeSource,
  span: SourceSpan,
});
export type TranscriptChunk = z.infer<typeof TranscriptChunk>;

export const Slide = z.object({ page: z.number().int().positive(), url: z.string() });
export const Equation = z.object({ expression: z.string(), explanation: z.string() });
export const Artifact = z.object({ id: z.string(), kind: z.string(), title: z.string(), url: z.string() });
export const TopicGraph = z.object({
  origin: z.string(),
  nodes: z.array(z.object({ id: z.string(), label: z.string() })),
  edges: z.array(z.object({ id: z.string(), from: z.string(), to: z.string(), relation: z.string() })),
});

/**
 * A timeline moment. The first group of fields matches what the existing UI renders;
 * the second group is what streaming adds.
 *
 * Rules: `id` never changes once sent. Every change sends the whole moment again with a higher
 * `revision`; clients keep the highest revision per ID. A moment only grows or closes, it is
 * never split or merged after it has been sent.
 */
export const Moment = z.object({
  id: z.string().min(1),
  time: z.number().nonnegative(),
  label: z.string(),
  title: z.string(),
  short: z.string(),
  type: z.string(),
  summary: z.string(),
  quote: z.string(),
  quoteTime: z.string(),
  intuition: z.string(),
  slides: z.array(Slide),
  equations: z.array(Equation),
  artifacts: z.array(Artifact),
  graph: TopicGraph.nullable(),

  revision: z.number().int().positive(),
  /** 'open' while transcript is still being added to it; 'closed' once the next topic starts. */
  status: z.enum(['open', 'closed']),
  /** Generated notes: 'none' (raw transcript only), 'pending', 'ready', or 'failed' (raw transcript kept). */
  enrichment: z.enum(['none', 'pending', 'ready', 'failed']),
  timeSource: TimeSource,
  /** Transcript chunk sequence numbers this moment covers, first to last. */
  chunkSeqs: z.array(z.number().int().positive()),
  sources: z.array(SourceSpan),
});
export type Moment = z.infer<typeof Moment>;

export const SessionState = z.object({
  runId: z.string(),
  state: z.enum(['paused', 'playing', 'completed']),
  /** Simulated seconds since the replay started. */
  elapsed: z.number().nonnegative(),
  words: z.number().int().positive(),
  interval: z.number().positive(),
  /** Chunks published so far and the total this run will publish. */
  published: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type SessionState = z.infer<typeof SessionState>;

/**
 * Server-sent events on GET /api/lectures/:courseId/:lectureId/events.
 * `seq` increases by one per event for a lecture and is sent as the SSE `id`, so a reconnecting
 * client resumes with `?after=<seq>` (or the Last-Event-ID header). A client that is too far
 * behind, or connects fresh, first receives a `timeline.snapshot` holding the full current state.
 */
export const TimelineSnapshotEvent = z.object({
  type: z.literal('timeline.snapshot'),
  seq: z.number().int().nonnegative(),
  /** null until a replay or live session has started for this lecture. */
  runId: z.string().nullable(),
  moments: z.array(Moment),
  session: SessionState.nullable(),
});
export const MomentUpsertEvent = z.object({
  type: z.literal('moment.upsert'),
  seq: z.number().int().positive(),
  runId: z.string(),
  moment: Moment,
});
export const SessionStateEvent = z.object({
  type: z.literal('session.state'),
  seq: z.number().int().positive(),
  runId: z.string(),
  session: SessionState,
});
export const TimelineEvent = z.discriminatedUnion('type', [TimelineSnapshotEvent, MomentUpsertEvent, SessionStateEvent]);
export type TimelineEvent = z.infer<typeof TimelineEvent>;
export type TimelineSnapshotEvent = z.infer<typeof TimelineSnapshotEvent>;
export type MomentUpsertEvent = z.infer<typeof MomentUpsertEvent>;
export type SessionStateEvent = z.infer<typeof SessionStateEvent>;

/** Body of POST /api/lectures/:courseId/:lectureId/session, which (re)starts a paused replay. */
export const ReplayOptions = z.object({
  words: z.number().int().min(30).max(1000).default(160),
  interval: z.number().min(0.05).max(60).default(8),
  /** Stop after this many chunks; omit for the full transcript. */
  limit: z.number().int().min(1).max(10000).optional(),
  /**
   * 'paused': publish the first chunk and wait for play (the live simulation).
   * 'instant': publish every chunk at once and complete (a past timeline).
   */
  start: z.enum(['paused', 'instant']).default('paused'),
});
export type ReplayOptions = z.infer<typeof ReplayOptions>;
