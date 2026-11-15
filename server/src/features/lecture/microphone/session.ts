import { randomUUID } from 'node:crypto';
import type { LectureKey, SessionState, TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import type { ReplaySession } from '../replay.ts';
import type { Segmenter } from '../segmentation/types.ts';
import type { LectureStore } from '../store/types.ts';

export class CaptureConflict extends Error { statusCode = 409; }
export type MicrophoneSession = ReplaySession & {
  accept(input: { runId: string; seq: number; time: number; endTime: number; text: string }): Promise<void>;
  finish(): Promise<void>;
};

export function createMicrophoneSession({ key, store, segmenter }: { key: LectureKey; store: LectureStore; segmenter: Segmenter }): MicrophoneSession {
  const runId = randomUUID();
  const controller = new AbortController();
  const context = { key, store, signal: controller.signal };
  let mode: SessionState['state'] = 'playing';
  let published = 0, elapsed = 0, lastSeq = 0, lastEnd = 0, pending = 0;
  let queue = Promise.resolve();
  const state = (): SessionState => ({ runId, state: mode, elapsed, words: 160, interval: 12, published, total: published });
  function check(id: string) {
    if (id !== runId || controller.signal.aborted || mode === 'completed') throw new CaptureConflict('This microphone session ended. Start listening again.');
  }
  return {
    runId, state,
    start() { store.reset(key, state()); },
    play() { throw new CaptureConflict('Use Start listening to capture microphone audio.'); },
    pause() { throw new CaptureConflict('Use Stop listening to finish microphone capture.'); },
    step() {},
    stop() { controller.abort(); },
    idle() { return queue; },
    accept(input) {
      check(input.runId);
      if (input.seq !== lastSeq + 1 || input.time < lastEnd || input.endTime <= input.time) throw new CaptureConflict('Audio arrived out of order. Stop and start a new capture.');
      if (pending >= 20) throw new CaptureConflict('Topic generation fell behind. Stop listening and wait for the queued topics.');
      lastSeq = input.seq;
      lastEnd = input.endTime;
      pending++;
      const task = queue.then(async () => {
        check(input.runId);
        elapsed = input.endTime;
        if (input.text.trim()) {
          const chunk: TranscriptChunk = { seq: ++published, text: input.text.trim(), time: input.time, endTime: input.endTime,
            timeSource: 'transcript', span: { path: 'microphone/' + runId, startTime: input.time, endTime: input.endTime } };
          store.appendChunk(key, chunk);
          await segmenter.onChunk(chunk, context);
          if (!controller.signal.aborted) for (const moment of store.getMoments(key)) {
            if (moment.chunkSeqs.includes(chunk.seq)) store.updateMoment(key, moment.id, current => ({ ...current, quoteTime: current.label + ' since microphone capture started' }));
          }
        }
        if (!controller.signal.aborted) store.setSession(key, state());
      });
      queue = task.catch(() => {}).finally(() => { pending--; });
      return task;
    },
    finish() {
      const task = queue.then(async () => {
        check(runId);
        await segmenter.finish(context);
        mode = 'completed';
        store.setSession(key, state());
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}
