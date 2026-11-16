import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { createMemoryStore } from '../store/memory.ts';
import { createPassthroughSegmenter } from '../segmentation/passthrough.ts';
import { createMicrophoneSession } from './session.ts';
import { createLectureService } from '../service.ts';
import { microphoneRoutes } from './routes.ts';
import { coachingRoutes, groundCoaching } from './coaching.ts';
import { createFixtureProvider } from '../../../llm/fixture.ts';
import { CoachingSpec } from '../../../../../shared/contracts/slideCoaching.ts';
import type { SpeechDecoder } from './worker.ts';
import { buildApp } from '../../../app.ts';
import { loadConfig } from '../../../config.ts';
import type { ModelProvider } from '../../../llm/types.ts';

const key = { courseId: 'cs50', lectureId: '0' };
const text = 'An algorithm is a step by step process that takes inputs and produces outputs. A phone book search can divide the problem in half at every step.';

test('a slow question cannot block recognition or publishing the next microphone chunk', async t => {
  const store = createMemoryStore(), service = createLectureService({ store });
  let release!: () => void, started!: () => void, answered = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const began = new Promise<void>(resolve => { started = resolve; });
  const provider: ModelProvider = { name: 'held-chat-test', model: 'fixture', modalities: ['text'], async generateStructured(request) {
    assert.equal(request.task, 'lecture.chat'); started(); await gate;
    return { data: request.schema.parse({ answer: 'Algorithms solve problems in precise steps.', momentIds: [store.getMoments(key)[0]!.id], insufficientEvidence: false }),
      provider: 'test', model: 'test', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 };
  } };
  let decodes = 0;
  const decoder: SpeechDecoder = { status: () => ({ installed: true, ready: true, busy: false, model: 'test', device: 'test' }), warmup: async () => {}, close() {}, async transcribe() { decodes++; return text; } };
  const app = await buildApp({ config: loadConfig({}), provider, lectureStore: store, lectureService: service, speechDecoder: decoder });
  t.after(async () => { release(); await app.close(); });
  const headers = { 'x-recall-microphone': '1' }, base = '/api/lectures/cs50/0';
  const state = (await app.inject({ method: 'POST', url: base + '/microphone', headers, payload: {} })).json();
  const packet = { runId: state.runId, seq: 1, time: 0, endTime: 12, audio: 'A'.repeat(64) };
  assert.equal((await app.inject({ method: 'POST', url: base + '/microphone/audio', headers, payload: packet })).statusCode, 200);
  await service.idle(key);
  const answer = app.inject({ method: 'POST', url: base + '/chat', payload: { runId: state.runId, question: 'Explain algorithms', context: { kind: 'moment', momentId: store.getMoments(key)[0]!.id } } }).then(response => { answered = true; return response; });
  await began;
  assert.equal((await app.inject({ method: 'POST', url: base + '/microphone/audio', headers, payload: { ...packet, seq: 2, time: 12, endTime: 36 } })).statusCode, 200);
  await service.idle(key);
  assert.equal(decodes, 2); assert.equal(answered, false);
  assert.equal(store.getMoments(key).length, 2);
  release(); assert.equal((await answer).statusCode, 200);
});
test('microphone chunks retain capture times, ignore silence, finish topics and reject stale / reordered audio', async () => {
  const store = createMemoryStore();
  const capture = createMicrophoneSession({ key, store, segmenter: createPassthroughSegmenter() });
  capture.start();
  assert.deepEqual(store.getMoments(key), []); // No reference transcript seeded.
  assert.throws(() => capture.accept({ runId: randomUUID(), seq: 1, time: 0, endTime: 12, text }));
  await capture.accept({ runId: capture.runId, seq: 1, time: 0, endTime: 12, text: '' });
  assert.equal(store.getMoments(key).length, 0);
  await capture.accept({ runId: capture.runId, seq: 2, time: 12, endTime: 24, text });
  assert.equal(store.getMoments(key)[0]?.time, 12);
  assert.equal(store.getMoments(key)[0]?.quote, text);
  assert.match(store.getMoments(key)[0]!.sources[0]!.path, /^microphone\//);
  assert.throws(() => capture.accept({ runId: capture.runId, seq: 2, time: 12, endTime: 24, text }));
  await capture.finish();
  assert.equal(store.getMoments(key)[0]?.status, 'closed');
  assert.equal(capture.state().state, 'completed');
  assert.throws(() => capture.accept({ runId: capture.runId, seq: 3, time: 24, endTime: 36, text }));
});

test('reset aborts queued microphone work and cannot republish an old run', async () => {
  const store = createMemoryStore();
  const service = createLectureService({ store });
  const old = await service.startMicrophone(key);
  const capture = service.microphone(key, old.runId);
  const pending = capture.accept({ runId: old.runId, seq: 1, time: 0, endTime: 12, text });
  const next = await service.startMicrophone(key);
  await pending.catch(() => {});
  assert.notEqual(next.runId, old.runId);
  assert.throws(() => service.microphone(key, old.runId));
  assert.equal(store.snapshot(key).runId, next.runId);
  assert.equal(store.getMoments(key).length, 0);
  service.close();
});

test('local microphone API passes only audio to decoder, only recognized text to pipeline, and forbids remote / cross-origin calls', async t => {
  const store = createMemoryStore(), service = createLectureService({ store });
  let decodes = 0;
  const decoder: SpeechDecoder = { status: () => ({ installed: true, ready: true, busy: false, model: 'test', device: 'test' }), warmup: async () => {}, close() {},
    async transcribe(audio) { assert.equal(audio, 'A'.repeat(64)); decodes++; return text; } };
  const app = Fastify();
  app.setErrorHandler((error: any, _request, reply) => reply.code(error.statusCode ?? 400).send({ error: error.message }));
  await app.register(microphoneRoutes, { service, decoder });
  t.after(async () => { service.close(); await app.close(); });
  const base = '/lectures/cs50/0/microphone', headers = { 'x-recall-microphone': '1' };
  assert.equal((await app.inject({ method: 'POST', url: base, payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: base, headers: { ...headers, origin: 'https://unrelated.example' }, payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: base, headers: { ...headers, host: 'unrelated.example', origin: 'https://unrelated.example' }, payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/speech/status', remoteAddress: '192.168.1.4' })).statusCode, 403);
  const started = (await app.inject({ method: 'POST', url: base, headers, payload: {} })).json();
  const packet = { runId: started.runId, seq: 1, time: 0, endTime: 12, audio: 'A'.repeat(64) };
  assert.equal((await app.inject({ method: 'POST', url: base + '/audio', headers, payload: { ...packet, endTime: 90 } })).statusCode, 400);
  assert.equal(decodes, 0);
  assert.equal((await app.inject({ method: 'POST', url: base + '/audio', headers, payload: packet })).statusCode, 200);
  await service.idle(key);
  assert.equal(store.getMoments(key)[0]?.quote, text);
  assert.equal((await app.inject({ method: 'POST', url: base + '/finish', headers, payload: { runId: started.runId } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: base + '/audio', headers, payload: { ...packet, seq: 2, time: 12, endTime: 24 } })).statusCode, 409);
});

test('live capture works on any course lecture, including one with no recorded transcript', async t => {
  const store = createMemoryStore(), service = createLectureService({ store });
  const decoder: SpeechDecoder = { status: () => ({ installed: true, ready: true, busy: false, model: 'test', device: 'test' }), warmup: async () => {}, close() {},
    async transcribe() { return text; } };
  const app = Fastify();
  app.setErrorHandler((error: any, _request, reply) => reply.code(error.statusCode ?? 400).send({ error: error.message }));
  await app.register(microphoneRoutes, { service, decoder });
  t.after(async () => { service.close(); await app.close(); });
  const headers = { 'x-recall-microphone': '1' };
  for (const [courseId, lectureId] of [['ai', '0'], ['my-course-1', '3']] as const) {
    const base = `/lectures/${courseId}/${lectureId}/microphone`, live = { courseId, lectureId };
    const started = await app.inject({ method: 'POST', url: base, headers, payload: {} });
    assert.equal(started.statusCode, 200, courseId + ' starts');
    const packet = { runId: started.json().runId, seq: 1, time: 0, endTime: 12, audio: 'A'.repeat(64) };
    assert.equal((await app.inject({ method: 'POST', url: base + '/audio', headers, payload: packet })).statusCode, 200);
    await service.idle(live);
    assert.equal(store.getMoments(live)[0]?.quote, text);
  }
  assert.equal((await app.inject({ method: 'POST', url: '/lectures/bad_id/1/microphone', headers, payload: {} })).statusCode, 400);
});

test('slide notes resolve only extracted text IDs, reject malformed tables, and are invalidated by run changes', async t => {
  const spec = CoachingSpec.parse({ mode: 'highlight', note: 'Short note', highlights: [{ textId: 'invented', note: 'No source' }], steps: [], table: null, equations: [] });
  assert.equal(groundCoaching(spec, []).mode, 'whole');
  assert.deepEqual(groundCoaching(spec, []).highlights, []);
  assert.equal(CoachingSpec.safeParse({ ...spec, table: { title: 'Bad', columns: ['a','b'], rows: [['one']], basis: 'evidence' } }).success, false);
  const store = createMemoryStore(), service = createLectureService({ store });
  const state = await service.startMicrophone(key);
  await service.microphone(key, state.runId).accept({ runId: state.runId, seq: 1, time: 0, endTime: 12, text });
  const app = Fastify(); await app.register(coachingRoutes, { store, provider: createFixtureProvider() });
  app.setErrorHandler((error: any, _request, reply) => reply.code(error.statusCode ?? 400).send({ error: error.message }));
  t.after(async () => { service.close(); await app.close(); });
  const payload = { runId: state.runId, momentId: store.getMoments(key)[0]!.id };
  const response = await app.inject({ method: 'POST', url: '/lectures/cs50/0/slide-coaching', payload });
  assert.equal(response.statusCode, 200);
  const notes = response.json();
  assert(notes.runs.length > 0);
  assert(notes.spec.highlights.every((item: { textId: string }) => notes.runs.some((run: { id: string }) => run.id === item.textId)));
  assert.match(notes.fingerprint, /^[a-f0-9]{64}$/);
  await service.startMicrophone(key);
  assert.equal((await app.inject({ method: 'POST', url: '/lectures/cs50/0/slide-coaching', payload })).statusCode, 409);
});
