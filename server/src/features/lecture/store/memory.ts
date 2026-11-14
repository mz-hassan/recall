import type {
  LectureKey, Moment, SessionState, TimelineEvent, TimelineSnapshotEvent, TranscriptChunk,
} from '../../../../../shared/contracts/lecture.ts';
import type { LectureStore, MomentDraft, TimeRange } from './types.ts';

type LectureState = {
  runId: string | null;
  seq: number;
  log: TimelineEvent[];
  chunks: TranscriptChunk[];
  moments: Map<string, Moment>;
  order: string[];
  summary: string | null;
  session: SessionState | null;
  listeners: Set<(event: TimelineEvent) => void>;
};

/**
 * Keeps timelines in process memory: enough for local development and tests. A MongoDB store can
 * later implement the same LectureStore interface without changing callers.
 */
export function createMemoryStore({ maxLog = 5000 }: { maxLog?: number } = {}): LectureStore {
  const lectures = new Map<string, LectureState>();

  function state({ courseId, lectureId }: LectureKey): LectureState {
    const id = courseId + '/' + lectureId;
    let lecture = lectures.get(id);
    if (!lecture) {
      lecture = { runId: null, seq: 0, log: [], chunks: [], moments: new Map(), order: [], summary: null, session: null, listeners: new Set() };
      lectures.set(id, lecture);
    }
    return lecture;
  }

  function emit(lecture: LectureState, event: TimelineEvent) {
    lecture.log.push(event);
    if (lecture.log.length > maxLog) lecture.log.splice(0, lecture.log.length - maxLog);
    for (const listener of lecture.listeners) listener(event);
  }

  function requireRun(lecture: LectureState): string {
    if (!lecture.runId) throw new Error('No run has started for this lecture');
    return lecture.runId;
  }

  function momentEnd(lecture: LectureState, moment: Moment): number {
    const last = moment.chunkSeqs.at(-1);
    const chunk = last === undefined ? undefined : lecture.chunks.find(item => item.seq === last);
    return chunk?.endTime ?? moment.time;
  }

  function buildSnapshot(lecture: LectureState): TimelineSnapshotEvent {
    return {
      type: 'timeline.snapshot', seq: lecture.seq, runId: lecture.runId,
      moments: lecture.order.map(id => lecture.moments.get(id)!), session: lecture.session,
    };
  }

  function save(lecture: LectureState, draft: MomentDraft): Moment {
    const runId = requireRun(lecture);
    const previous = lecture.moments.get(draft.id);
    const moment: Moment = { ...draft, revision: (previous?.revision ?? 0) + 1 };
    if (!previous) lecture.order.push(moment.id);
    lecture.moments.set(moment.id, moment);
    emit(lecture, { type: 'moment.upsert', seq: ++lecture.seq, runId, moment });
    return moment;
  }

  return {
    getMoments(key, range?: TimeRange) {
      const lecture = state(key);
      const moments = lecture.order.map(id => lecture.moments.get(id)!);
      if (!range) return moments;
      return moments.filter(moment => moment.time <= range.to && momentEnd(lecture, moment) >= range.from);
    },
    getMoment(key, momentId) {
      return state(key).moments.get(momentId);
    },
    getTranscriptRange(key, { from, to }) {
      return state(key).chunks.filter(chunk => chunk.time <= to && chunk.endTime >= from);
    },
    getRunningSummary(key) {
      return state(key).summary;
    },
    attachArtifact(key, momentId, artifact) {
      const lecture = state(key);
      const moment = lecture.moments.get(momentId);
      if (!moment) throw new Error(`No moment ${momentId}`);
      const { revision: _revision, ...draft } = moment;
      return save(lecture, { ...draft, artifacts: [...moment.artifacts.filter(item => item.id !== artifact.id), artifact] });
    },

    reset(key, session) {
      const lecture = state(key);
      Object.assign(lecture, { runId: session.runId, log: [], chunks: [], moments: new Map(), order: [], summary: null, session });
      lecture.seq += 1;
      emit(lecture, buildSnapshot(lecture));
    },
    appendChunk(key, chunk) {
      const lecture = state(key);
      requireRun(lecture);
      if (lecture.chunks.some(item => item.seq === chunk.seq)) return; // repeated chunk: ignore
      lecture.chunks.push(chunk);
      lecture.chunks.sort((a, b) => a.seq - b.seq);
    },
    saveMoment(key, draft) {
      return save(state(key), draft);
    },
    setRunningSummary(key, summary) {
      state(key).summary = summary;
    },
    setSession(key, session) {
      const lecture = state(key);
      const runId = requireRun(lecture);
      lecture.session = session;
      emit(lecture, { type: 'session.state', seq: ++lecture.seq, runId, session });
    },
    getSession(key) {
      return state(key).session;
    },

    snapshot(key) {
      return buildSnapshot(state(key));
    },
    eventsAfter(key, seq) {
      const lecture = state(key);
      if (seq === lecture.seq) return [];
      // A seq from the future means the server restarted since the client last connected.
      if (seq > lecture.seq) return 'too_old';
      const first = lecture.log[0];
      if (!first || seq < first.seq - 1) return 'too_old';
      return lecture.log.filter(event => event.seq > seq);
    },
    subscribe(key, listener) {
      const lecture = state(key);
      lecture.listeners.add(listener);
      return () => { lecture.listeners.delete(listener); };
    },
  };
}
