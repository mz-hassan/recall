import { randomUUID } from 'node:crypto';
import type { LectureKey, ReplayOptions, SessionState, TranscriptChunk } from '../../../../shared/contracts/lecture.ts';
import type { Segmenter, SegmenterContext } from './segmentation/types.ts';
import type { LectureStore } from './store/types.ts';

export type Timers = {
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

const realTimers: Timers = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
};

export type ReplaySession = {
  readonly runId: string;
  state(): SessionState;
  start(): void;
  play(): void;
  pause(): void;
  /** Publishes the next chunk now. The timer calls this while playing; tests call it directly. */
  step(): void;
  /** Stops the timer and cancels in-flight work, e.g. when the replay is restarted. */
  stop(): void;
  /** Resolves once every published chunk has been through the segmenter. */
  idle(): Promise<void>;
};

/**
 * Feeds a recorded transcript into the pipeline as if it were live: one chunk every `interval`
 * seconds while playing. Chunks are processed strictly in order, one at a time.
 */
export function createReplaySession({ key, chunks, options, store, segmenter, timers = realTimers, onError = () => {} }: {
  key: LectureKey;
  chunks: TranscriptChunk[];
  options: ReplayOptions;
  store: LectureStore;
  segmenter: Segmenter;
  timers?: Timers;
  onError?: (error: unknown) => void;
}): ReplaySession {
  const runId = randomUUID();
  const total = Math.min(chunks.length, options.limit ?? Infinity);
  const controller = new AbortController();
  const context: SegmenterContext = { key, store, signal: controller.signal };
  let published = 0;
  let mode: SessionState['state'] = 'paused';
  let timer: unknown = null;
  let queue: Promise<void> = Promise.resolve();

  const state = (): SessionState => ({
    runId, state: mode, elapsed: Math.max(0, published - 1) * options.interval,
    words: options.words, interval: options.interval, published, total,
  });

  function enqueue(task: () => Promise<void> | void) {
    queue = queue.then(() => {
      if (controller.signal.aborted) return;
      return task();
    }).catch(onError);
  }

  function stopTimer() {
    if (timer !== null) timers.clearInterval(timer);
    timer = null;
  }

  function announce() {
    const snapshot = state();
    enqueue(() => store.setSession(key, snapshot));
  }

  function publishNext() {
    if (published >= total) return;
    const chunk = chunks[published]!;
    published += 1;
    store.appendChunk(key, chunk);
    enqueue(() => segmenter.onChunk(chunk, context));
    if (published === total) {
      stopTimer();
      mode = 'completed';
      enqueue(() => segmenter.finish(context));
    }
  }

  return {
    runId,
    state,
    start() {
      store.reset(key, state());
      if (options.start === 'instant') {
        while (published < total) publishNext();
      } else {
        publishNext();
      }
      announce();
    },
    play() {
      if (mode !== 'paused') return;
      mode = 'playing';
      timer = timers.setInterval(() => { publishNext(); announce(); }, options.interval * 1000);
      announce();
    },
    pause() {
      if (mode !== 'playing') return;
      stopTimer();
      mode = 'paused';
      announce();
    },
    step() {
      publishNext();
      announce();
    },
    stop() {
      stopTimer();
      controller.abort();
    },
    idle() {
      return queue;
    },
  };
}
