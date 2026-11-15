import type { LectureKey, Moment, TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import type { ChatRequest } from '../../../../../shared/contracts/lectureInteractions.ts';
import type { LectureStore } from '../store/types.ts';

export class ChatContextError extends Error {
  readonly statusCode: 404 | 409;
  constructor(statusCode: 404 | 409, message: string) { super(message); this.statusCode = statusCode; }
}

export type ChatContext = {
  question: string;
  range: { from: number; to: number; timeSource: 'simulated' | 'transcript' };
  moments: Pick<Moment, 'id' | 'title' | 'label' | 'time' | 'quote' | 'summary'>[];
  chunks: Pick<TranscriptChunk, 'seq' | 'text' | 'span'>[];
  runningSummary: string | null;
  slides?: { page: number; text: string; equationNotes?: unknown }[];
};

export function retrieveChatContext(store: LectureStore, key: LectureKey, request: ChatRequest): ChatContext {
  const session = store.getSession(key);
  if (!session) throw new ChatContextError(404, 'Start a lecture session before asking a question.');
  if (session.runId !== request.runId) throw new ChatContextError(409, 'The lecture restarted. Ask again using the current timeline.');
  const chunks = store.getTranscriptRange(key, { from: 0, to: Number.MAX_SAFE_INTEGER });
  const selected = request.context.kind === 'moment' ? store.getMoment(key, request.context.momentId) : undefined;
  if (request.context.kind === 'moment' && !selected) throw new ChatContextError(404, 'This moment is not in the current lecture.');
  const selectedChunks = selected ? chunks.filter(chunk => selected.chunkSeqs.includes(chunk.seq)) : chunks;
  const to = Math.max(selected?.time ?? 0, ...selectedChunks.map(chunk => chunk.endTime));
  const from = selected?.time ?? Math.max(0, to - 180);
  const range = { from, to, timeSource: selected?.timeSource ?? chunks.at(-1)?.timeSource ?? 'simulated' } as const;
  const candidates = selected ? [selected] : store.getMoments(key, range).slice(-12);
  if (!candidates.length) throw new ChatContextError(404, 'No published moments are available in this context yet.');
  // Bound context cost. Retain the most recent overlapping chunks, in source order.
  const overlapping = store.getTranscriptRange(key, range);
  let budget = 24_000;
  const evidence: ChatContext['chunks'] = [];
  for (const chunk of [...overlapping].reverse()) {
    if (budget <= 0) break;
    const text = chunk.text.slice(-budget);
    budget -= text.length;
    evidence.unshift({ seq: chunk.seq, text, span: chunk.span });
  }
  return {
    question: request.question, range,
    moments: candidates.map(({ id, title, label, time, quote, summary }) => ({
      id, title, label, time, quote: quote.slice(-3000), summary: summary.slice(0, 1500),
    })),
    chunks: evidence,
    runningSummary: store.getRunningSummary(key)?.slice(-6000) ?? null,
  };
}
