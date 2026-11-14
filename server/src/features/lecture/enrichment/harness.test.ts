import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReplayOptions, type TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import { createFixtureProvider, ProviderError, type GenerateStructuredRequest, type ModelProvider } from '../../../llm/index.ts';
import { rawMoment } from '../segmentation/passthrough.ts';
import { createModelSegmenter } from '../segmentation/harness.ts';
import { segmentationFixture } from '../segmentation/fixture.ts';
import { SEGMENTATION_TASK } from '../segmentation/schema.ts';
import { createLectureService } from '../service.ts';
import { createMemoryStore } from '../store/memory.ts';
import { enrichmentFixture } from './fixture.ts';
import { createModelEnricher, type EnrichmentCall } from './harness.ts';
import { ENRICHMENT_TASK, type EnrichmentResult } from './schema.ts';
import type { SlideDeck } from './slides.ts';

const key = { courseId: 'ai', lectureId: '2' };
const chunk = (seq: number, text: string): TranscriptChunk => ({
  seq, text, time: (seq - 1) * 60, endTime: seq * 60, timeSource: 'transcript',
  span: { path: 'lectures/x.vtt', startTime: (seq - 1) * 60, endTime: seq * 60 },
});
const deck: SlideDeck = {
  pdfPath: 'x.pdf',
  pages: [
    { page: 4, text: 'Behavior cloning supervised learning on expert demonstrations' },
    { page: 8, text: 'DAgger aggregate dataset expert labels learner states' },
  ],
  slide: page => ({ page, url: `slide-${page}.png`, kind: 'image' }),
};
const notes = (overrides: Partial<EnrichmentResult> = {}): EnrichmentResult => ({
  summary: 'DAgger asks the expert to label states the learner visits.',
  intuition: 'Practice where you actually go.',
  type: 'ALGORITHM',
  equations: [{ expression: 'J(π) − J(π*) ≤ O(Tε)', explanation: 'Linear in the horizon.' }],
  slides: [{ page: 8, confidence: 'high' }, { page: 4, confidence: 'low' }, { page: 99, confidence: 'high' }],
  diagram: {
    nodes: [{ id: 'rollout', label: 'Rollout' }, { id: 'expert', label: 'Expert labels' }],
    edges: [{ from: 'rollout', to: 'expert', relation: 'queries' }, { from: 'rollout', to: 'ghost', relation: 'broken' }],
  },
  lecture_so_far: 'Behavior cloning, then DAgger.',
  ...overrides,
});

function scripted(answers: Array<EnrichmentResult | Error>) {
  const requests: GenerateStructuredRequest<unknown>[] = [];
  const provider: ModelProvider = {
    name: 'scripted', model: 'scripted', modalities: ['text'],
    async generateStructured(request) {
      requests.push(request as GenerateStructuredRequest<unknown>);
      const answer = answers.shift();
      if (!answer) throw new Error('script ran out');
      if (answer instanceof Error) throw answer;
      return { data: request.schema.parse(answer), provider: 'scripted', model: 'scripted', usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
    },
  };
  return { provider, requests };
}

function setup(answers: Array<EnrichmentResult | Error>) {
  const store = createMemoryStore();
  store.reset(key, { runId: 'r', state: 'paused', elapsed: 0, words: 160, interval: 8, published: 0, total: 5 });
  const { provider, requests } = scripted(answers);
  const calls: EnrichmentCall[] = [];
  const enricher = createModelEnricher({ provider, loadDeck: async () => deck, onCall: call => calls.push(call) });
  const controller = new AbortController();
  enricher.start({ key, store, signal: controller.signal });
  const close = (seq: number, text: string) => {
    store.appendChunk(key, chunk(seq, text));
    const draft = { ...rawMoment(key, seq, chunk(seq, text)), title: 'DAgger', type: 'TOPIC' };
    store.saveMoment(key, draft);
    store.saveMoment(key, { ...draft, status: 'closed' });
    return draft.id;
  };
  return { store, enricher, requests, calls, controller, close };
}

test('a closed topic is enriched with notes, real slides with confidence, a valid diagram and a running summary', async () => {
  const { store, enricher, requests, close } = setup([notes()]);
  const id = close(1, 'DAgger rolls out the learner, asks the expert for labels and aggregates the dataset.');
  await enricher.idle();
  const moment = store.getMoment(key, id)!;
  assert.equal(moment.enrichment, 'ready');
  assert.equal(moment.type, 'ALGORITHM');
  assert.equal(moment.summary, notes().summary);
  assert.deepEqual(moment.slides, [
    { page: 8, url: 'slide-8.png', kind: 'image', confidence: 'high' },
    { page: 4, url: 'slide-4.png', kind: 'image', confidence: 'low' },
  ], 'page 99 does not exist in the deck');
  assert.deepEqual(moment.graph?.edges.map(edge => edge.id + ':' + edge.relation), ['e1:queries'], 'edge to an unknown node is dropped');
  assert.equal(store.getRunningSummary(key), 'Behavior cloning, then DAgger.');
  const evidence = requests[0]!.evidence;
  assert.equal(evidence[0]!.id, 'topic');
  const index = evidence.find(item => item.id === 'slide-index');
  assert.equal(index?.kind === 'text' ? index.text : '', '4: Behavior cloning supervised learning on expert demonstrations\n8: DAgger aggregate dataset expert labels learner states');
  assert.ok(evidence.some(item => item.id === 'slide-page-8'));
  assert.ok(!evidence.some(item => item.id === 'previous-slides'), 'first topic has no previous slides');
  assert.equal(requests[0]!.options?.reasoning, 'low');
});

test('the next topic gets the previous topic\'s slides as a hint, plus the pages right after them', async () => {
  const deckPages = Array.from({ length: 12 }, (_, index) => ({ page: index + 1, text: `Slide ${index + 1} unrelated words` }));
  const store = createMemoryStore();
  store.reset(key, { runId: 'r', state: 'paused', elapsed: 0, words: 160, interval: 8, published: 0, total: 5 });
  const { provider, requests } = scripted([notes({ slides: [{ page: 5, confidence: 'high' }] }), notes({ slides: [] })]);
  const enricher = createModelEnricher({ provider, loadDeck: async () => ({ ...deck, pages: deckPages }) });
  enricher.start({ key, store, signal: new AbortController().signal });
  for (const seq of [1, 2]) {
    const draft = rawMoment(key, seq, chunk(seq, 'nothing in common'));
    store.appendChunk(key, chunk(seq, 'nothing in common'));
    store.saveMoment(key, { ...draft, status: 'closed' });
  }
  await enricher.idle();
  const second = requests[1]!.evidence;
  const hint = second.find(item => item.id === 'previous-slides');
  assert.equal(hint?.kind === 'text' ? hint.text : '', 'The previous topic was matched to slide page(s) 5.');
  assert.deepEqual(second.filter(item => item.id.startsWith('slide-page-')).map(item => item.id), ['slide-page-5', 'slide-page-6', 'slide-page-7']);
});

test('open topics are not enriched until they close', async () => {
  const { store, enricher, requests } = setup([notes()]);
  store.appendChunk(key, chunk(1, 'text'));
  store.saveMoment(key, rawMoment(key, 1, chunk(1, 'text')));
  await enricher.idle();
  assert.equal(requests.length, 0);
});

test('the second topic sees the first topic\'s running summary and title', async () => {
  const { enricher, requests, close } = setup([notes({ lecture_so_far: 'First summary.' }), notes()]);
  close(1, 'behavior cloning supervised');
  close(2, 'DAgger aggregate');
  await enricher.idle();
  const second = requests[1]!.evidence;
  const summary = second.find(item => item.id === 'lecture-so-far');
  assert.equal(summary?.kind === 'text' ? summary.text : null, 'First summary.');
  assert.ok(second.some(item => item.id === 'earlier-topics'));
});

test('a failed call marks the topic failed and keeps its transcript', async () => {
  const { store, enricher, calls, close } = setup([new ProviderError('request_failed', 'DeepSeek returned 503')]);
  const id = close(1, 'raw words stay');
  await enricher.idle();
  const moment = store.getMoment(key, id)!;
  assert.equal(moment.enrichment, 'failed');
  assert.equal(moment.quote, 'raw words stay');
  assert.equal(calls[0]!.outcome, 'failed');
  assert.equal(store.getRunningSummary(key), null);
});

test('an artifact attached while notes are being written is kept', async () => {
  const store = createMemoryStore();
  store.reset(key, { runId: 'r', state: 'paused', elapsed: 0, words: 160, interval: 8, published: 0, total: 1 });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const provider: ModelProvider = {
    name: 'slow', model: 'slow', modalities: ['text'],
    async generateStructured(request) {
      await gate;
      return { data: request.schema.parse(notes()), provider: 'slow', model: 'slow', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 };
    },
  };
  const enricher = createModelEnricher({ provider, loadDeck: async () => deck });
  enricher.start({ key, store, signal: new AbortController().signal });
  const draft = rawMoment(key, 1, chunk(1, 'DAgger'));
  store.appendChunk(key, chunk(1, 'DAgger'));
  store.saveMoment(key, { ...draft, status: 'closed' });
  await new Promise(resolve => setImmediate(resolve));
  store.attachArtifact(key, draft.id, { id: 'chart-1', kind: 'chart', title: 'Bound', url: '#' });
  release();
  await enricher.idle();
  const moment = store.getMoment(key, draft.id)!;
  assert.equal(moment.enrichment, 'ready');
  assert.deepEqual(moment.artifacts.map(item => item.id), ['chart-1']);
});

test('after stop, newly closed topics are ignored', async () => {
  const { enricher, requests, close } = setup([notes()]);
  enricher.stop();
  close(1, 'DAgger');
  await enricher.idle();
  assert.equal(requests.length, 0);
});

test('offline: a full Lecture 02 replay is segmented and every topic enriched, with real slide images', async () => {
  const store = createMemoryStore();
  const provider = createFixtureProvider({ [SEGMENTATION_TASK]: segmentationFixture, [ENRICHMENT_TASK]: enrichmentFixture });
  const service = createLectureService({
    store,
    createSegmenter: () => createModelSegmenter({ provider }),
    createEnricher: () => createModelEnricher({ provider }),
    onError: error => { throw error; },
  });
  try {
    await service.startReplay(key, ReplayOptions.parse({ start: 'instant' }));
    await service.idle(key);
    const moments = store.getMoments(key);
    assert.ok(moments.length > 5);
    assert.ok(moments.every(moment => moment.enrichment === 'ready' && moment.summary.length > 0));
    assert.ok(moments.some(moment => moment.slides.some(slide => /^assets\/slide-\d\d\.png$/.test(slide.url))));
    assert.ok((store.getRunningSummary(key) ?? '').length > 0);
  } finally {
    service.close();
  }
});
