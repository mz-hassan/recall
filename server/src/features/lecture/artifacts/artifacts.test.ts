import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ArtifactSpec, GeneratedArtifact } from '../../../../../shared/contracts/lectureInteractions.ts';
import { buildApp } from '../../../app.ts';
import { loadConfig } from '../../../config.ts';
import { createFixtureProvider } from '../../../llm/fixture.ts';
import { createMemoryStore } from '../store/memory.ts';
import { rawMoment } from '../segmentation/passthrough.ts';
import { artifactFixture } from './fixture.ts';
import { createArtifactService } from './service.ts';
import { ARTIFACT_TASK } from './schema.ts';

const key = { courseId: 'ai', lectureId: '2' };
const base = '/api/lectures/ai/2';
const chart = { kind: 'chart' as const, title: 'Words', description: 'Counts from evidence', chartType: 'bar' as const,
  basis: 'evidence' as const, xLabel: 'Chunk', yLabel: 'Words', xValues: [1, 2], series: [{ label: 'Words', values: [10, 20] }], equations: [] };

test('artifact specs reject generated code, invalid numbers, unequal series and broken diagram references', () => {
  assert.equal(ArtifactSpec.safeParse(chart).success, true);
  for (const spec of [
    { ...chart, code: 'alert(1)' }, { ...chart, xValues: [1, 1] },
    { ...chart, series: [{ label: 'x', values: [1, NaN] }] }, { ...chart, series: [{ label: 'x', values: [1, 2, 3] }] },
    { kind: 'animation', title: 'x', description: 'x', nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'missing', label: 'x' }],
      steps: [{ title: 'One', description: 'One', highlightNodeIds: ['a'] }, { title: 'Two', description: 'Two', highlightNodeIds: ['missing'] }], equations: [] },
  ]) assert.equal(ArtifactSpec.safeParse(spec).success, false);
});

test('pipeline revisions retain student artifacts and explicit updates still deduplicate by artifact ID', () => {
  const store = createMemoryStore();
  store.reset(key, { runId: 'run', state: 'paused', elapsed: 0, words: 160, interval: 8, published: 1, total: 2 });
  const chunk = { seq: 1, text: 'Evidence.', time: 0, endTime: 8, timeSource: 'simulated' as const, span: { path: 'x.txt', startChar: 0, endChar: 9 } };
  const draft = rawMoment(key, 1, chunk);
  store.saveMoment(key, draft);
  const reference = { id: randomUUID(), kind: 'chart', title: 'Chart', url: '/api/chart' };
  store.attachArtifact(key, draft.id, reference);
  store.saveMoment(key, { ...draft, quote: 'Evidence. More words.', status: 'closed' });
  assert.deepEqual(store.getMoment(key, draft.id)!.artifacts, [reference]);
  store.attachArtifact(key, draft.id, { ...reference, title: 'Updated chart' });
  assert.equal(store.getMoment(key, draft.id)!.artifacts.length, 1);
  assert.equal(store.getMoment(key, draft.id)!.artifacts[0]!.title, 'Updated chart');
});

test('chart and animation requests attach to the right moment, survive a snapshot reload, and retry idempotently', async () => {
  const app = await buildApp({ config: loadConfig({}), provider: createFixtureProvider() });
  try {
    const session = (await app.inject({ method: 'POST', url: base + '/session', payload: { start: 'instant', limit: 9 } })).json();
    const before = (await app.inject({ method: 'GET', url: base + '/moments' })).json();
    const momentId: string = before.moments[0].id;
    for (const kind of ['chart', 'animation']) {
      const input = { runId: session.runId, requestId: randomUUID(), momentId, kind, prompt: kind === 'chart' ? 'Chart transcript word counts.' : 'Walk through the source.' };
      const response = await app.inject({ method: 'POST', url: base + '/artifacts', payload: input });
      assert.equal(response.statusCode, 201, response.body);
      const artifact = GeneratedArtifact.parse(response.json());
      assert.equal(artifact.momentId, momentId);
      assert.equal(artifact.spec.kind, kind);
      const again = await app.inject({ method: 'POST', url: base + '/artifacts', payload: input });
      assert.equal(again.json().id, artifact.id);
      const fetched = await app.inject({ method: 'GET', url: base + '/artifacts/' + artifact.id + '?runId=' + encodeURIComponent(session.runId) });
      assert.deepEqual(fetched.json(), artifact);
      assert.equal((await app.inject({ method: 'POST', url: base + '/artifacts', payload: { ...input, prompt: 'Different request' } })).statusCode, 409);
    }
    const after = (await app.inject({ method: 'GET', url: base + '/moments' })).json();
    assert.equal(after.moments[0].artifacts.length, 2);
    assert.ok(after.moments.slice(1).every((moment: { artifacts: unknown[] }) => !moment.artifacts.length));
    const oldRef: string = after.moments[0].artifacts[0].url;
    await app.inject({ method: 'POST', url: base + '/session', payload: { limit: 2 } });
    assert.equal((await app.inject({ method: 'GET', url: oldRef })).statusCode, 409);
  } finally { await app.close(); }
});

test('invalid evidence and provider output do not attach an artifact; failed requests can be retried', async () => {
  const provider = createFixtureProvider();
  const app = await buildApp({ config: loadConfig({}), provider });
  try {
    const session = (await app.inject({ method: 'POST', url: base + '/session', payload: { limit: 2 } })).json();
    const momentId: string = (await app.inject({ method: 'GET', url: base + '/moments' })).json().moments[0].id;
    const input = { runId: session.runId, requestId: randomUUID(), momentId, kind: 'chart', prompt: 'Make a chart' };
    provider.register(ARTIFACT_TASK, () => ({ spec: chart, momentIds: ['unknown'], insufficientEvidence: false, reason: '' }));
    assert.equal((await app.inject({ method: 'POST', url: base + '/artifacts', payload: input })).statusCode, 503);
    provider.register(ARTIFACT_TASK, () => ({ spec: null, momentIds: [], insufficientEvidence: true, reason: 'Not enough evidence.' }));
    assert.equal((await app.inject({ method: 'POST', url: base + '/artifacts', payload: input })).statusCode, 422);
    assert.equal((await app.inject({ method: 'GET', url: base + '/moments' })).json().moments[0].artifacts.length, 0);
    provider.register(ARTIFACT_TASK, artifactFixture);
    assert.equal((await app.inject({ method: 'POST', url: base + '/artifacts', payload: input })).statusCode, 201);
    assert.equal((await app.inject({ method: 'POST', url: base + '/artifacts', payload: { ...input, requestId: randomUUID(), momentId: 'missing' } })).statusCode, 404);
  } finally { await app.close(); }
});

test('a restart while a visual is generating cannot attach it to the new lecture run', async () => {
  const store = createMemoryStore();
  const initialSession = { runId: 'old', state: 'paused' as const, elapsed: 0, words: 160, interval: 8, published: 1, total: 2 };
  store.reset(key, initialSession);
  const chunk = { seq: 1, text: 'Two source sentences. More evidence.', time: 0, endTime: 8, timeSource: 'simulated' as const, span: { path: 'x', startChar: 0, endChar: 35 } };
  store.appendChunk(key, chunk);
  const moment = store.saveMoment(key, rawMoment(key, 1, chunk));
  const provider = createFixtureProvider({ [ARTIFACT_TASK]: request => {
    const result = artifactFixture(request); store.reset(key, { ...initialSession, runId: 'new' }); return result;
  } });
  const service = createArtifactService({ store, provider });
  await assert.rejects(service.create(key, { runId: 'old', requestId: randomUUID(), momentId: moment.id, kind: 'chart', prompt: 'Chart coverage' }), /restarted/);
  assert.deepEqual(store.getMoments(key), []);
});
