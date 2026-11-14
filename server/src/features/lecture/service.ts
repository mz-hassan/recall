import type { LectureKey, ReplayOptions, SessionState } from '../../../../shared/contracts/lecture.ts';
import { createReplaySession, type ReplaySession, type Timers } from './replay.ts';
import { createPassthroughSegmenter } from './segmentation/passthrough.ts';
import type { Segmenter } from './segmentation/types.ts';
import type { LectureStore } from './store/types.ts';
import { hasTranscript, loadTranscriptChunks } from './transcription/index.ts';

export class LectureNotFoundError extends Error {
  constructor(key: LectureKey) {
    super(`No transcript for lecture ${key.courseId}/${key.lectureId}`);
    this.name = 'LectureNotFoundError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(key: LectureKey) {
    super(`No session has started for lecture ${key.courseId}/${key.lectureId}`);
    this.name = 'SessionNotFoundError';
  }
}

export type LectureService = ReturnType<typeof createLectureService>;

/** Runs one replay session per lecture and wires transcript → segmenter → store. */
export function createLectureService({ store, createSegmenter = createPassthroughSegmenter, timers, onError }: {
  store: LectureStore;
  createSegmenter?: () => Segmenter;
  timers?: Timers;
  onError?: (error: unknown) => void;
}) {
  const sessions = new Map<string, ReplaySession>();
  const id = (key: LectureKey) => key.courseId + '/' + key.lectureId;

  function requireSession(key: LectureKey): ReplaySession {
    const session = sessions.get(id(key));
    if (!session) throw new SessionNotFoundError(key);
    return session;
  }

  return {
    hasTranscript,

    /** (Re)starts a replay. Resolves once the first chunk (or, for 'instant', every chunk) is processed. */
    async startReplay(key: LectureKey, options: ReplayOptions): Promise<SessionState> {
      const source = await loadTranscriptChunks(key, options);
      if (!source?.chunks.length) throw new LectureNotFoundError(key);
      sessions.get(id(key))?.stop();
      const session = createReplaySession({ key, chunks: source.chunks, options, store, segmenter: createSegmenter(), timers, onError });
      sessions.set(id(key), session);
      session.start();
      await session.idle();
      return session.state();
    },
    play(key: LectureKey): SessionState {
      const session = requireSession(key);
      session.play();
      return session.state();
    },
    pause(key: LectureKey): SessionState {
      const session = requireSession(key);
      session.pause();
      return session.state();
    },
    getSession(key: LectureKey): ReplaySession | undefined {
      return sessions.get(id(key));
    },
    close() {
      for (const session of sessions.values()) session.stop();
      sessions.clear();
    },
  };
}
