import type { LectureKey, ReplayOptions, SessionState } from '../../../../shared/contracts/lecture.ts';
import type { Enricher } from './enrichment/harness.ts';
import { createReplaySession, type ReplaySession, type Timers } from './replay.ts';
import { createPassthroughSegmenter } from './segmentation/passthrough.ts';
import type { Segmenter } from './segmentation/types.ts';
import type { LectureStore } from './store/types.ts';
import { hasTranscript, loadTranscriptChunks } from './transcription/index.ts';
import { createMicrophoneSession, CaptureConflict, type MicrophoneSession } from './microphone/session.ts';

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

type Run = { replay: ReplaySession; microphone?: MicrophoneSession; enricher: Enricher | null; controller: AbortController };

/**
 * Runs one replay session per lecture and wires transcript → segmenter → store, with an optional
 * enricher that fills in each topic as it closes.
 */
export function createLectureService({ store, createSegmenter = createPassthroughSegmenter, createMicrophoneSegmenter, createEnricher, timers, onError }: {
  store: LectureStore;
  createSegmenter?: () => Segmenter;
  createMicrophoneSegmenter?: () => Segmenter;
  createEnricher?: () => Enricher;
  timers?: Timers;
  onError?: (error: unknown) => void;
}) {
  const runs = new Map<string, Run>();
  const id = (key: LectureKey) => key.courseId + '/' + key.lectureId;

  function requireSession(key: LectureKey): ReplaySession {
    const run = runs.get(id(key));
    if (!run) throw new SessionNotFoundError(key);
    return run.replay;
  }

  function stopRun(run: Run | undefined) {
    if (!run) return;
    run.replay.stop();
    run.enricher?.stop();
    run.controller.abort();
  }

  return {
    hasTranscript,

    async startMicrophone(key: LectureKey) {
      if (!await hasTranscript(key)) throw new LectureNotFoundError(key);
      stopRun(runs.get(id(key)));
      const controller = new AbortController();
      const enricher = createEnricher?.() ?? null;
      const microphone = createMicrophoneSession({ key, store, segmenter: (createMicrophoneSegmenter ?? createSegmenter)() });
      runs.set(id(key), { replay: microphone, microphone, enricher, controller });
      enricher?.start({ key, store, signal: controller.signal });
      microphone.start();
      return microphone.state();
    },
    microphone(key: LectureKey, runId: string) {
      const capture = runs.get(id(key))?.microphone;
      if (!capture || capture.runId !== runId) throw new CaptureConflict('The microphone session changed. Start listening again.');
      return capture;
    },

    /** (Re)starts a replay. Resolves once the first chunk (or, for 'instant', every chunk) is segmented. */
    async startReplay(key: LectureKey, options: ReplayOptions): Promise<SessionState> {
      const source = await loadTranscriptChunks(key, options);
      if (!source?.chunks.length) throw new LectureNotFoundError(key);
      stopRun(runs.get(id(key)));
      const controller = new AbortController();
      const enricher = createEnricher?.() ?? null;
      const replay = createReplaySession({ key, chunks: source.chunks, options, store, segmenter: createSegmenter(), timers, onError });
      runs.set(id(key), { replay, enricher, controller });
      // Subscribe before the replay starts so no closing topic is missed.
      enricher?.start({ key, store, signal: controller.signal });
      replay.start();
      await replay.idle();
      return replay.state();
    },
    /** Resolves when segmentation and enrichment have caught up with everything published so far. */
    async idle(key: LectureKey): Promise<void> {
      const run = runs.get(id(key));
      if (!run) return;
      await run.replay.idle();
      await run.enricher?.idle();
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
      return runs.get(id(key))?.replay;
    },
    close() {
      for (const run of runs.values()) stopRun(run);
      runs.clear();
    },
  };
}
