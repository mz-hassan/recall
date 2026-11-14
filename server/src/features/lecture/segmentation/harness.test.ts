import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReplayOptions, type TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import { createFixtureProvider, ProviderError, type ModelProvider } from '../../../llm/index.ts';
import { createLectureService } from '../service.ts';
import { createMemoryStore } from '../store/memory.ts';
import { segmentationFixture } from './fixture.ts';
import { createModelSegmenter, type SegmentationCall } from './harness.ts';
import { SEGMENTATION_TASK, type SegmentationDecision } from './schema.ts';

const key = { courseId: 'ai', lectureId: '2' };
const filler = (word: string, count: number) => Array.from({ length: count }, () => word).join(' ');
// Each chunk: three 20-word sentences (60 words), 10 seconds long.
const chunk = (seq: number, words = ['alpha', 'beta', 'gamma']): TranscriptChunk => ({
  seq, text: words.map(word => filler(word, 19) + ' end.').join(' '), time: (seq - 1) * 10, endTime: seq * 10,
  timeSource: 'transcript', span: { path: 'lectures/x.vtt', startTime: (seq - 1) * 10, endTime: seq * 10 },
});

/** A provider that answers from a script, so tests control every decision. */
function scriptedProvider(answers: Array<SegmentationDecision | Error>): ModelProvider & { evidence: string[][] } {
  const evidence: string[][] = [];
  return {
    name: 'scripted', model: 'scripted', modalities: ['text'], evidence,
    async generateStructured(request) {
      evidence.push(request.evidence.map(item => item.id));
      const answer = answers.shift();
      if (!answer) throw new Error('script ran out');
      if (answer instanceof Error) throw answer;
      return { data: request.schema.parse(answer), provider: 'scripted', model: 'scripted', usage: { inputTokens: 10, outputTokens: 5 }, latencyMs: 1 };
    },
  };
}

function setup(answers: Array<SegmentationDecision | Error>, minWords = 50) {
  const store = createMemoryStore();
  store.reset(key, { runId: 'r', state: 'paused', elapsed: 0, words: 60, interval: 10, published: 0, total: 9 });
  const calls: SegmentationCall[] = [];
  const provider = scriptedProvider(answers);
  const segmenter = createModelSegmenter({ provider, minWords, onCall: call => calls.push(call) });
  const context = { key, store, signal: new AbortController().signal };
  const feed = async (item: TranscriptChunk) => { store.appendChunk(key, item); await segmenter.onChunk(item, context); };
  return { store, calls, provider, segmenter, context, feed };
}
const stay = (title: string): SegmentationDecision => ({ current_topic_title: title, current_topic_label: title, new_topics: [] });

test('the first chunk opens a titled topic', async () => {
  const { store, feed, provider } = setup([stay('Behavior cloning basics')]);
  await feed(chunk(1));
  const [moment] = store.getMoments(key);
  assert.deepEqual([moment!.title, moment!.status, moment!.type, moment!.time], ['Behavior cloning basics', 'open', 'TOPIC', 0]);
  assert.deepEqual(provider.evidence[0], ['new-text'], 'no open topic yet');
});

test('a continuing chunk grows the open topic as a new revision', async () => {
  const { store, feed, provider } = setup([stay('Behavior cloning basics'), stay('Behavior cloning basics')]);
  await feed(chunk(1));
  await feed(chunk(2));
  const moments = store.getMoments(key);
  assert.equal(moments.length, 1);
  assert.equal(moments[0]!.revision, 2);
  assert.deepEqual(moments[0]!.chunkSeqs, [1, 2]);
  assert.deepEqual(provider.evidence[1], ['open-topic', 'new-text']);
});

test('a topic change mid-chunk splits the words and places the new topic in time', async () => {
  const { store, feed } = setup([
    stay('Behavior cloning basics'),
    { ...stay('Behavior cloning basics'), new_topics: [{ starts_at_sentence: 3, title: 'Distribution shift', label: 'Shift' }] },
  ]);
  await feed(chunk(1));
  await feed(chunk(2, ['delta', 'epsilon', 'zeta']));
  const [first, second] = store.getMoments(key);
  assert.equal(first!.status, 'closed');
  assert.match(first!.quote, /epsilon end\.$/, 'sentences 1–2 stay with the open topic');
  assert.match(second!.quote, /^zeta/, 'sentence 3 starts the new topic');
  assert.equal(second!.title, 'Distribution shift');
  assert.ok(Math.abs(second!.time - (10 + 10 * 40 / 60)) < 1e-9, 'time interpolated by word position');
  assert.equal(second!.status, 'open');
});

test('a new topic at sentence 1 closes the open topic without adding to it', async () => {
  const { store, feed } = setup([
    stay('Behavior cloning basics'),
    { ...stay('Behavior cloning basics'), new_topics: [{ starts_at_sentence: 1, title: 'DAgger', label: 'DAgger' }] },
  ]);
  await feed(chunk(1));
  await feed(chunk(2));
  const [first, second] = store.getMoments(key);
  assert.deepEqual(first!.chunkSeqs, [1]);
  assert.equal(first!.status, 'closed');
  assert.deepEqual([second!.title, second!.time], ['DAgger', 10]);
});

test('impossible boundaries are ignored and every word is kept exactly once', async () => {
  const { store, feed } = setup([
    stay('First'),
    { ...stay('First'), new_topics: [{ starts_at_sentence: 9, title: 'Out of range', label: 'X' }, { starts_at_sentence: 2, title: 'B', label: 'B' }, { starts_at_sentence: 2, title: 'Dup', label: 'D' }] },
  ]);
  await feed(chunk(1));
  await feed(chunk(2));
  const moments = store.getMoments(key);
  assert.deepEqual(moments.map(moment => moment.title), ['First', 'B']);
  assert.equal(moments.map(moment => moment.quote).join(' '), chunk(1).text + ' ' + chunk(2).text);
});

test('a "new" topic with the same title or label as the open one is merged, not split', async () => {
  const { store, feed } = setup([
    stay('Compounding error bound'),
    { ...stay('Compounding error bound'), new_topics: [{ starts_at_sentence: 2, title: 'Compounding Error Bound!', label: 'Other' }] },
    { ...stay('Compounding error bound'), new_topics: [{ starts_at_sentence: 1, title: 'Something else', label: 'compounding error bound' }] },
  ]);
  await feed(chunk(1));
  await feed(chunk(2));
  await feed(chunk(3));
  assert.equal(store.getMoments(key).length, 1);
});

test('a failed model call keeps the transcript visible by extending the open topic', async () => {
  const { store, feed, calls } = setup([stay('Behavior cloning basics'), new ProviderError('request_failed', 'DeepSeek returned 503')]);
  await feed(chunk(1));
  await feed(chunk(2));
  const moments = store.getMoments(key);
  assert.equal(moments.length, 1);
  assert.deepEqual(moments[0]!.chunkSeqs, [1, 2]);
  assert.deepEqual(calls.map(call => call.outcome), ['ok', 'fallback']);
});

test('a failure on the very first chunk still shows the words', async () => {
  const { store, feed } = setup([new ProviderError('invalid_output', 'bad')]);
  await feed(chunk(1));
  assert.equal(store.getMoments(key)[0]!.title, 'Lecture in progress');
});

test('a chunk with too few new words skips the model call', async () => {
  const { store, feed, calls } = setup([stay('Topic')], 50);
  await feed(chunk(1));
  await feed({ ...chunk(2), text: 'just a few words here.' });
  assert.deepEqual(calls.map(call => call.outcome), ['ok', 'skipped']);
  assert.match(store.getMoments(key)[0]!.quote, /just a few words here\.$/);
});

test('finish closes the last topic', async () => {
  const { store, feed, segmenter, context } = setup([stay('Topic')]);
  await feed(chunk(1));
  await segmenter.finish(context);
  assert.equal(store.getMoments(key)[0]!.status, 'closed');
});

test('offline: a full Lecture 02 replay with the fixture model forms topics and keeps every word', async () => {
  const store = createMemoryStore();
  const provider = createFixtureProvider({ [SEGMENTATION_TASK]: segmentationFixture });
  const service = createLectureService({ store, createSegmenter: () => createModelSegmenter({ provider }), onError: error => { throw error; } });
  try {
    await service.startReplay(key, ReplayOptions.parse({ start: 'instant' }));
    const moments = store.getMoments(key);
    const chunks = store.getTranscriptRange(key, { from: 0, to: Infinity });
    assert.ok(moments.length > 5 && moments.length < chunks.length, `${moments.length} topics from ${chunks.length} chunks`);
    assert.ok(moments.every(moment => moment.status === 'closed' && moment.type === 'TOPIC'));
    assert.equal(moments.map(moment => moment.quote).join(' '), chunks.map(item => item.text).join(' '));
  } finally {
    service.close();
  }
});
