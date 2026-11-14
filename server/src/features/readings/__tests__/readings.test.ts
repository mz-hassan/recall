import test from 'node:test';
import assert from 'node:assert/strict';
import type { ZodType } from 'zod';
import { buildApp } from '../../../app.ts';
import { loadConfig } from '../../../config.ts';
import { createFixtureProvider } from '../../../llm/fixture.ts';
import { ProviderError, type GenerateStructuredRequest, type ModelProvider } from '../../../llm/index.ts';
import { teach, validateReferences, TEACHER_TASK } from '../harness.ts';
import { GUIDE_TASK } from '../generate.ts';
import { daggerBundle } from '../../../../../src/readings/data/dagger.js';
import { papers } from '../../../../../src/readings/catalog.js';

const answer = { blocks: [{ text: 'DAgger aggregates expert-labeled states visited during rollouts.', citations: ['algorithm'] }] };
const input = { requestId: 'test', question: 'Explain the algorithm', context: { page: 4, passageId: 'algorithm' }, history: [] };
const noSignal = () => new AbortController().signal;

/** A provider whose answers come from a function, validated against the caller's schema like a real model's. */
function stub(respond: (request: GenerateStructuredRequest<any>) => unknown): ModelProvider & { requests: GenerateStructuredRequest<any>[] } {
  const requests: GenerateStructuredRequest<any>[] = [];
  return {
    name: 'stub', model: 'stub-model', modalities: ['text'], requests,
    async generateStructured<T>(request: GenerateStructuredRequest<T>) {
      requests.push(request);
      const parsed = (request.schema as ZodType<T>).safeParse(respond(request));
      if (!parsed.success) throw new ProviderError('invalid_output', request.task + ': ' + parsed.error.message);
      return { data: parsed.data, provider: 'stub', model: 'stub-model', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 };
    },
  };
}
const teacherStub = () => stub(() => ({ ...answer, annotations: [{ passageId: 'aggregation', kind: 'definition', explanation: 'Keep previous examples.' }] }));
const app = (provider: ModelProvider) => buildApp({ config: loadConfig({}), provider });
const behavioralCloning = () => papers.find(p => !p.prepared && p.title === 'Behavioral Cloning from Observation')!;

test('API returns cited answers and annotations using the shared contract', async () => {
  const server = await app(teacherStub());
  const result = await server.inject({ method: 'POST', url: '/api/readings/ai-dagger/teacher', payload: input });
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().requestId, 'test');
  assert.equal(result.json().annotations[0].passageId, 'aggregation');
  assert.equal(result.json().provider, 'stub');
  await server.close();
});

test('API rejects malformed requests and missing paper evidence', async () => {
  const server = await app(teacherStub());
  assert.equal((await server.inject({ method: 'POST', url: '/api/readings/ai-dagger/teacher', payload: {} })).statusCode, 400);
  assert.equal((await server.inject({ method: 'POST', url: '/api/readings/missing/teacher', payload: input })).statusCode, 404);
  await server.close();
});

test('unknown citations and fabricated diagram edges are rejected', () => {
  assert.throws(() => validateReferences({ blocks: [{ citations: ['invented'] }] }, daggerBundle), /Unknown passage/);
  assert.throws(() => validateReferences({ diagrams: [{ nodes: [{ id: 'a', passageId: 'algorithm' }], edges: [{ from: 'a', to: 'missing' }] }] }, daggerBundle), /no node/);
});

test('a model citing an unknown passage cannot produce a confident answer', async () => {
  const provider = stub(() => ({ blocks: [{ text: 'Invented.', citations: ['invented'] }] }));
  await assert.rejects(teach(input, daggerBundle, provider, noSignal()), /grounded answer/);
});

test('missing evidence cannot produce a confident cited answer', async () => {
  const provider = teacherStub();
  await assert.rejects(teach({ ...input, context: null }, { ...daggerBundle, passages: [], highlights: [] }, provider, noSignal()), /grounded answer/);
  assert.equal(provider.requests.length, 0);
});

test('provider failure is recoverable and does not expose secrets', async () => {
  const provider = teacherStub();
  provider.generateStructured = async () => { throw new ProviderError('request_failed', 'DeepSeek returned 503'); };
  const server = await app(provider);
  const result = await server.inject({ method: 'POST', url: '/api/readings/ai-dagger/teacher', payload: input });
  assert.equal(result.statusCode, 503);
  assert.match(result.json().error, /503/);
  await server.close();
});

test('one structured call supplies passage evidence, a diagram and a cited answer', async () => {
  const provider = stub(() => ({
    ...answer,
    diagrams: [{ title: 'Learning loop', description: 'Conceptual explanation.', nodes: [{ id: 'a', label: 'Roll out', passageId: 'algorithm' }, { id: 'b', label: 'Aggregate', passageId: 'aggregation' }], edges: [{ from: 'a', to: 'b', label: 'expert labels' }] }],
  }));
  const result = await teach(input, daggerBundle, provider, noSignal());
  assert.equal(provider.requests.length, 1);
  const request = provider.requests[0]!;
  assert.equal(request.task, TEACHER_TASK);
  assert.ok(request.evidence.some(item => item.id === 'algorithm'), 'selected passage is evidence');
  assert.equal(result.diagrams.length, 1);
  assert.deepEqual(result.annotations, []);
});

test('abort and invalid page do not call the provider', async () => {
  const provider = teacherStub();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(teach(input, daggerBundle, provider, controller.signal));
  await assert.rejects(teach({ ...input, context: { page: 99, passageId: 'algorithm' } }, daggerBundle, provider, noSignal()), /page does not exist/);
  assert.equal(provider.requests.length, 0);
});

test('other papers generate on request, cache the result, and support teacher questions', async () => {
  const paper = behavioralCloning();
  const provider = stub(request => request.task === GUIDE_TASK
    ? { overview: 'A guide grounded in the first page.', sections: [{ title: 'Introduction', page: 1, summary: 'An introduction.' }], ideas: [{ title: 'Idea', text: 'An idea.', page: 1 }], findings: [], limitations: [] }
    : { blocks: [{ text: 'See the source.', citations: ['page-1'] }] });
  const server = await app(provider);
  assert.equal(provider.requests.length, 0);
  const generated = await server.inject({ method: 'POST', url: `/api/readings/${paper.id}/generate` });
  assert.equal(generated.statusCode, 200, generated.body);
  assert.equal(generated.json().paperId, paper.id);
  assert.ok(generated.json().passages[0].quote.length > 100);
  assert.equal((await server.inject({ method: 'GET', url: `/api/readings/${paper.id}/pdf` })).statusCode, 200);
  assert.equal((await server.inject({ method: 'POST', url: `/api/readings/${paper.id}/generate` })).statusCode, 200);
  assert.equal(provider.requests.length, 1);
  const response = await server.inject({ method: 'POST', url: `/api/readings/${paper.id}/teacher`, payload: { ...input, context: { page: 1, passageId: 'page-1' } } });
  assert.equal(response.statusCode, 200, response.body);
  await server.close();
});

test('generation preserves the DAgger fixture and gracefully handles missing sources', async () => {
  const missing = papers.find(p => !p.files.some((f: string) => f.endsWith('.pdf')))!;
  const provider = stub(() => { throw new Error('Unexpected model call'); });
  const server = await app(provider);
  const dagger = await server.inject({ method: 'POST', url: '/api/readings/ai-dagger/generate' });
  assert.equal(dagger.statusCode, 200);
  assert.equal(dagger.json().highlights.length, 13);
  const absent = await server.inject({ method: 'POST', url: `/api/readings/${missing.id}/generate` });
  assert.equal(absent.statusCode, 503);
  assert.match(absent.json().error, /No local PDF/);
  assert.equal(provider.requests.length, 0);
  await server.close();
});

test('invalid guide output returns a readable error', async () => {
  const paper = papers.find(p => !p.prepared && p.title === 'Of Moments and Matching: A Game-Theoretic Framework for Closing the Imitation Gap')!;
  const server = await app(stub(() => ({ overview: 'unfinished' })));
  const response = await server.inject({ method: 'POST', url: `/api/readings/${paper.id}/generate` });
  assert.equal(response.statusCode, 503);
  assert.match(response.json().error, /incomplete or malformed/);
  assert.doesNotMatch(response.json().error, /position|JSON at|overview/);
  await server.close();
});

test('a guide that cites a missing page is rejected', async () => {
  const server = await app(stub(() => ({ overview: 'x', sections: [{ title: 'Nowhere', page: 999, summary: 'x' }], ideas: [], findings: [], limitations: [] })));
  // A paper no other test generates: guides are cached per process.
  const paper = papers.find(p => !p.prepared && p.title.startsWith('π_0'))!;
  const response = await server.inject({ method: 'POST', url: `/api/readings/${paper.id}/generate` });
  assert.equal(response.statusCode, 503);
  assert.match(response.json().error, /missing page/);
  await server.close();
});

test('the offline fixture provider serves both tasks with no key', async () => {
  const server = await app(createFixtureProvider());
  const teacher = await server.inject({ method: 'POST', url: '/api/readings/ai-dagger/teacher', payload: input });
  assert.equal(teacher.statusCode, 200, teacher.body);
  assert.equal(teacher.json().provider, 'fixture');
  const guide = await server.inject({ method: 'POST', url: `/api/readings/${behavioralCloning().id}/generate` });
  assert.equal(guide.statusCode, 200, guide.body);
  await server.close();
});
