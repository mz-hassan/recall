import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReplayOptions, type TranscriptChunk } from '../../../../shared/contracts/lecture.ts';
import { createReplaySession, type Timers } from './replay.ts';
import { createPassthroughSegmenter } from './segmentation/passthrough.ts';
import { createMemoryStore } from './store/memory.ts';

const key = { courseId: 'ai', lectureId: '2' };
const chunks: TranscriptChunk[] = [1, 2, 3, 4].map(seq => ({
  seq, text: 'chunk ' + seq, time: (seq - 1) * 8, endTime: seq * 8, timeSource: 'simulated',
  span: { path: 'lectures/x.txt', startChar: seq, endChar: seq + 1 },
}));

function fakeTimers() {
  let tick: (() => void) | null = null;
  const timers: Timers = {
    setInterval: callback => { tick = callback; return 1; },
    clearInterval: () => { tick = null; },
  };
  return { timers, fire: () => tick?.(), running: () => tick !== null };
}

function session(options: Partial<ReplayOptions> = {}, timers = fakeTimers().timers) {
  const store = createMemoryStore();
  const replay = createReplaySession({
    key, chunks, options: ReplayOptions.parse(options), store, segmenter: createPassthroughSegmenter(), timers,
    onError: error => { throw error; },
  });
  return { store, replay };
}

test('starts paused with only the first chunk visible, like the current simulation', async () => {
  const { store, replay } = session();
  replay.start();
  await replay.idle();
  assert.deepEqual(store.getMoments(key).map(moment => [moment.quote, moment.status]), [['chunk 1', 'open']]);
  assert.equal(replay.state().state, 'paused');
  assert.equal(replay.state().published, 1);
});

test('each new chunk closes the previous moment as a new revision', async () => {
  const { store, replay } = session();
  replay.start();
  replay.step();
  await replay.idle();
  const [first, second] = store.getMoments(key);
  assert.deepEqual([first!.status, first!.revision], ['closed', 2]);
  assert.deepEqual([second!.status, second!.revision], ['open', 1]);
  assert.notEqual(first!.id, second!.id);
});

test('playing publishes one chunk per tick and completes at the limit', async () => {
  const clock = fakeTimers();
  const { store, replay } = session({ limit: 3, interval: 8 }, clock.timers);
  replay.start();
  replay.play();
  assert.equal(replay.state().state, 'playing');
  clock.fire();
  clock.fire();
  await replay.idle();
  assert.equal(replay.state().state, 'completed');
  assert.equal(replay.state().elapsed, 16);
  assert.equal(clock.running(), false, 'the timer stops on completion');
  assert.equal(store.getMoments(key).length, 3);
  assert.ok(store.getMoments(key).every(moment => moment.status === 'closed'));
  assert.equal(store.getSession(key)?.state, 'completed');
});

test('pause stops the timer and play resumes it', () => {
  const clock = fakeTimers();
  const { replay } = session({}, clock.timers);
  replay.start();
  replay.play();
  replay.pause();
  assert.equal(clock.running(), false);
  assert.equal(replay.state().state, 'paused');
  replay.play();
  assert.equal(clock.running(), true);
});

test("'instant' publishes the whole transcript as a past timeline", async () => {
  const { store, replay } = session({ start: 'instant' });
  replay.start();
  await replay.idle();
  assert.equal(store.getMoments(key).length, 4);
  assert.equal(replay.state().state, 'completed');
});

test('a stopped session does no further work', async () => {
  const { store, replay } = session();
  replay.start();
  replay.stop();
  replay.step();
  await replay.idle();
  assert.equal(store.getMoments(key).length, 0, 'queued work after stop is cancelled');
});
