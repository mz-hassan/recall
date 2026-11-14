import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryStore } from '../store/memory.ts';
import { rawMoment } from '../segmentation/passthrough.ts';
import { createFixtureProvider } from '../../../llm/fixture.ts';
import type { TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import { ChatRequest } from '../../../../../shared/contracts/lectureInteractions.ts';
import { answerLectureQuestion } from './harness.ts';
import { retrieveChatContext } from './context.ts';
import { chatFixture } from './fixture.ts';
import { CHAT_TASK } from './schema.ts';

const key = { courseId: 'ai', lectureId: '2' };
const session = { runId: 'test-run', state: 'paused' as const, elapsed: 0, words: 160, interval: 8, published: 3, total: 6 };
function setup() {
  const store = createMemoryStore();
  store.reset(key, session);
  for (const [index, text] of ['Behavior cloning learns expert actions.', 'Distribution shift changes the states visited.', 'DAgger queries an expert and aggregates labels.'].entries()) {
    const chunk: TranscriptChunk = { seq: index + 1, text, time: index * 180, endTime: index * 180 + 60,
      timeSource: 'transcript', span: { path: 'transcript.vtt', startTime: index * 180, endTime: index * 180 + 60 } };
    store.appendChunk(key, chunk);
    store.saveMoment(key, rawMoment(key, index + 1, chunk));
  }
  store.setRunningSummary(key, 'The lecture compares imitation learning methods.');
  return store;
}
const selected = () => ChatRequest.parse({ runId: session.runId, question: 'Explain this moment', context: { kind: 'moment', momentId: 'ai/2/moment/2' } });

test('chat retrieves selected raw transcript, moment and running summary from the same lecture', () => {
  const context = retrieveChatContext(setup(), key, selected());
  assert.deepEqual(context.chunks.map(chunk => chunk.seq), [2]);
  assert.equal(context.moments.length, 1);
  assert.match(context.moments[0]!.quote, /Distribution shift/);
  assert.match(context.runningSummary!, /imitation learning/);
  assert.deepEqual(context.range, { from: 180, to: 240, timeSource: 'transcript' });
});

test('last three minutes uses source time and excludes earlier transcript', () => {
  const request = ChatRequest.parse({ runId: session.runId, question: 'What did I miss in the last 3 minutes?', context: { kind: 'recent', seconds: 180 } });
  const context = retrieveChatContext(setup(), key, request);
  assert.deepEqual(context.range, { from: 240, to: 420, timeSource: 'transcript' });
  assert.deepEqual(context.chunks.map(chunk => chunk.seq), [2, 3]);
  assert.equal(context.moments.length, 2);
});

test('fixture chat returns cited evidence with canonical titles rather than model-created links', async () => {
  const provider = createFixtureProvider({ [CHAT_TASK]: chatFixture });
  const answer = await answerLectureQuestion({ key, store: setup(), provider, request: selected() });
  assert.equal(answer.provider, 'fixture');
  assert.match(answer.answer, /Distribution shift/);
  assert.equal(answer.citations[0]!.momentId, 'ai/2/moment/2');
  assert.equal(answer.citations[0]!.time, 180);
  assert.equal(answer.insufficientEvidence, false);
});

test('out-of-context questions return an explicit insufficient-evidence result', async () => {
  const provider = createFixtureProvider({ [CHAT_TASK]: chatFixture });
  const request = { ...selected(), question: 'Describe unicorn biology' };
  const answer = await answerLectureQuestion({ key, store: setup(), provider, request });
  assert.equal(answer.insufficientEvidence, true);
  assert.deepEqual(answer.citations, []);
});

test('chat rejects unknown and cross-context citations', async () => {
  const provider = createFixtureProvider({ [CHAT_TASK]: () => ({ answer: 'Unsupported', momentIds: ['ai/2/moment/1'], insufficientEvidence: false }) });
  await assert.rejects(answerLectureQuestion({ key, store: setup(), provider, request: selected() }), /unsupported moment citations/);
});

test('chat cannot cross lectures or runs, including a restart during model generation', async () => {
  const store = setup();
  assert.throws(() => retrieveChatContext(store, { courseId: 'ai', lectureId: '3' }, selected()), /Start a lecture session/);
  assert.throws(() => retrieveChatContext(store, key, { ...selected(), runId: 'old-run' }), /restarted/);
  const provider = createFixtureProvider({ [CHAT_TASK]: () => {
    store.reset(key, { ...session, runId: 'new-run' });
    return { answer: 'Old answer', momentIds: ['ai/2/moment/2'], insufficientEvidence: false };
  } });
  await assert.rejects(answerLectureQuestion({ key, store, provider, request: selected() }), /restarted while answering/);
});

test('chat validates empty requests and respects cancellation', async () => {
  assert.equal(ChatRequest.safeParse({ ...selected(), question: '  ' }).success, false);
  const provider = createFixtureProvider({ [CHAT_TASK]: chatFixture });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(answerLectureQuestion({ key, store: setup(), provider, request: selected(), signal: controller.signal }), /cancelled/);
});
