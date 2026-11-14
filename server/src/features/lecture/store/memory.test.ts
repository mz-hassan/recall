import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TimelineEvent, type SessionState, type TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import { rawMoment } from '../segmentation/passthrough.ts';
import { createMemoryStore } from './memory.ts';

const key = { courseId: 'ai', lectureId: '2' };
const session = (runId: string): SessionState => ({ runId, state: 'paused', elapsed: 0, words: 160, interval: 8, published: 0, total: 3 });
const chunk = (seq: number): TranscriptChunk => ({
  seq, text: 'words ' + seq, time: (seq - 1) * 10, endTime: seq * 10, timeSource: 'simulated',
  span: { path: 'lectures/x.txt', startChar: seq * 100, endChar: seq * 100 + 50 },
});

function started() {
  const store = createMemoryStore();
  const events: TimelineEvent[] = [];
  store.subscribe(key, event => events.push(TimelineEvent.parse(event)));
  store.reset(key, session('run-1'));
  return { store, events };
}

test('saving the same moment again bumps its revision and keeps one entry', () => {
  const { store, events } = started();
  store.appendChunk(key, chunk(1));
  const draft = rawMoment(key, 1, chunk(1));
  assert.equal(store.saveMoment(key, draft).revision, 1);
  assert.equal(store.saveMoment(key, { ...draft, status: 'closed' }).revision, 2);
  assert.equal(store.getMoments(key).length, 1);
  assert.deepEqual(events.map(event => [event.type, event.seq]), [['timeline.snapshot', 1], ['moment.upsert', 2], ['moment.upsert', 3]]);
});

test('a repeated chunk is ignored', () => {
  const { store } = started();
  store.appendChunk(key, chunk(1));
  store.appendChunk(key, chunk(1));
  assert.equal(store.getTranscriptRange(key, { from: 0, to: 100 }).length, 1);
});

test('time ranges return the overlapping chunks and moments', () => {
  const { store } = started();
  for (const seq of [1, 2, 3]) {
    store.appendChunk(key, chunk(seq));
    store.saveMoment(key, rawMoment(key, seq, chunk(seq)));
  }
  assert.deepEqual(store.getTranscriptRange(key, { from: 12, to: 25 }).map(item => item.seq), [2, 3]);
  assert.deepEqual(store.getMoments(key, { from: 12, to: 18 }).map(item => item.chunkSeqs[0]), [2]);
});

test('attaching an artifact creates a new revision of that moment', () => {
  const { store } = started();
  store.appendChunk(key, chunk(1));
  const moment = store.saveMoment(key, rawMoment(key, 1, chunk(1)));
  const updated = store.attachArtifact(key, moment.id, { id: 'a1', kind: 'chart', title: 'Bound', url: '#' });
  assert.equal(updated.revision, 2);
  assert.deepEqual(updated.artifacts.map(item => item.id), ['a1']);
  assert.throws(() => store.attachArtifact(key, 'missing', { id: 'a2', kind: 'chart', title: 'x', url: '#' }));
});

test('reconnecting clients get only missed events, or a snapshot when they are too far behind', () => {
  const { store } = started();
  store.appendChunk(key, chunk(1));
  store.saveMoment(key, rawMoment(key, 1, chunk(1)));
  store.saveMoment(key, rawMoment(key, 2, chunk(2)));
  const missed = store.eventsAfter(key, 2);
  assert.ok(Array.isArray(missed));
  assert.deepEqual(missed.map(event => event.seq), [3]);
  assert.deepEqual(store.eventsAfter(key, 3), []);
  assert.equal(store.eventsAfter(key, 99), 'too_old', 'a seq from before a server restart');

  store.reset(key, session('run-2'));
  assert.equal(store.getMoments(key).length, 0);
  assert.equal(store.eventsAfter(key, 1), 'too_old', 'events from the previous run are gone');
  const snapshot = store.snapshot(key);
  assert.equal(snapshot.runId, 'run-2');
  assert.equal(snapshot.seq, 4);
});

test('the event log is bounded', () => {
  const store = createMemoryStore({ maxLog: 3 });
  store.reset(key, session('run-1'));
  for (let index = 1; index <= 5; index += 1) store.saveMoment(key, rawMoment(key, index, chunk(index)));
  assert.equal(store.eventsAfter(key, 1), 'too_old');
  assert.ok(Array.isArray(store.eventsAfter(key, 3)));
});
