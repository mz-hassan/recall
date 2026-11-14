import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphService } from './service.ts';
import { MemoryRepository, TestProvider, TestSource } from './testSupport.ts';
import { createApp } from '../../app.ts';

const event = (lectureId = '1', revision = 1) => ({ courseId: 'ai', lectureId, revision });
function setup() {
  const repository = new MemoryRepository(), source = new TestSource(), provider = new TestProvider();
  return { repository, source, provider, service: new GraphService(repository, source, provider) };
}
test('completed lectures deduplicate BC aliases, share policy, and expose cited resolvable edges', async () => {
  const { service, repository } = setup();
  await service.complete(event()); await service.complete(event('3')); await service.idle();
  const graph = await repository.graph('ai');
  assert.equal(graph.nodes.length, 3); assert.equal(graph.edges.length, 2);
  const bc = graph.nodes.find(node => node.aliases.includes('BC'))!;
  assert.deepEqual(bc.lectureIds, ['1', '3']);
  assert.equal(bc.references.length, 2);
  assert.ok(bc.summary?.includes('Behavior'));
  for (const edge of graph.edges) {
    assert.ok(graph.nodes.some(node => node.id === edge.from)); assert.ok(graph.nodes.some(node => node.id === edge.to));
    assert.ok(edge.references.every(ref => ref.end > ref.start && ref.sourceHash.length === 64));
  }
  assert.equal(graph.changes.nodes.length, 1);
});
test('simultaneous duplicate completion and unchanged higher revisions do not repeat model calls', async () => {
  const { service, provider, repository } = setup();
  const [a, b] = await Promise.all([service.complete(event()), service.complete(event())]);
  assert.equal(a.id, b.id); await service.idle();
  await service.complete(event()); await service.complete(event('1', 2)); await service.idle();
  assert.equal(provider.calls, 1);
  assert.equal(provider.overviewCalls, 1);
  assert.equal(provider.summaryCalls, 1);
  assert.equal((await repository.graph('ai')).lectures[0].revision, 2);
  await assert.rejects(service.complete(event()), /Stale/);
});
test('revised transcript and delayed slide replace old citations without duplicating concepts', async () => {
  const { service, source, repository, provider } = setup();
  await service.complete(event()); await service.idle();
  const old = await repository.graph('ai');
  source.revise('1', 'Behavior cloning learns a policy from new demonstrations.');
  await assert.rejects(service.complete(event()), /higher revision/);
  await service.complete(event('1', 2)); await service.idle();
  const revised = await repository.graph('ai');
  assert.equal(revised.nodes.length, old.nodes.length);
  assert.deepEqual(revised.nodes.map(node => node.id), old.nodes.map(node => node.id));
  assert.ok(revised.nodes.every(node => node.references.every(ref => ref.quote.includes('new demonstrations'))));
  const lecture = source.lectures[0];
  lecture.sources.push({ ...lecture.sources[0], id: 'delayed-slide', title: 'Delayed slides' });
  lecture.contentHash += '-slides';
  await service.complete(event('1', 3)); await service.idle();
  assert.equal(provider.calls, 4); // one initial, one correction, transcript + delayed slides
  assert.ok((await repository.graph('ai')).nodes.every(node => node.references.length === 2));
});
test('invalid citations retain the published graph and failed job can be retried', async () => {
  const { service, repository, provider } = setup();
  await service.complete(event()); await service.idle();
  const before = await repository.graph('ai');
  provider.invalid = true;
  await service.complete(event('3')); await service.idle();
  assert.deepEqual(await repository.graph('ai'), before);
  assert.equal((await repository.job('ai/3/1'))?.state, 'failed');
  provider.invalid = false;
  await service.complete(event('3')); await service.idle();
  assert.equal((await repository.job('ai/3/1'))?.state, 'completed');
});
test('retry reuses validated generated segments and does not repeat successful model calls', async () => {
  const { service, source, repository, provider } = setup();
  const lecture = source.lectures[0];
  lecture.sources.push({ ...lecture.sources[0], id: 'b'.repeat(24), title: 'Second source' });
  lecture.contentHash += '-second-source';
  provider.beforeGenerate = async () => { provider.invalid = provider.calls === 2 || provider.calls === 3; };
  await service.complete(event()); await service.idle();
  assert.equal((await repository.job('ai/1/1'))!.state, 'failed');
  assert.equal(provider.calls, 3);
  assert.equal(repository.segments.size, 1);
  await service.complete(event()); await service.idle();
  assert.equal((await repository.job('ai/1/1'))!.state, 'completed');
  assert.equal(provider.calls, 4);
  assert.equal(repository.segments.size, 4); // Two evidence segments, the overview, and summaries.
});
test('files changed during generation cannot publish an inconsistent revision', async () => {
  const { service, source, repository, provider } = setup();
  provider.beforeGenerate = async () => { source.revise('1', 'The writer changed the source during extraction.'); };
  await service.complete(event()); await service.idle();
  assert.equal((await repository.graph('ai')).nodes.length, 0);
  assert.match((await repository.job('ai/1/1'))!.error!, /changed during extraction/);
});
test('pending jobs resume after restart; published job recovery avoids paid extraction', async () => {
  const { service, source, repository, provider } = setup();
  await service.complete(event()); await service.idle();
  const job = (await repository.job('ai/1/1'))!;
  await repository.saveJob({ ...job, state: 'running' });
  const recovered = new GraphService(repository, source, provider);
  await recovered.recover(); await recovered.idle();
  assert.equal(provider.calls, 1); assert.equal((await repository.job(job.id))!.state, 'completed');
});
test('restart recovers queued jobs and cannot roll back a newer published revision', async () => {
  const { service, source, repository, provider } = setup();
  await service.complete(event('1', 2)); await service.idle();
  const newest = (await repository.job('ai/1/2'))!;
  await repository.saveJob({ ...newest, id: 'ai/1/1', revision: 1, state: 'queued' });
  const recovered = new GraphService(repository, source, provider);
  await recovered.recover(); await recovered.idle();
  assert.equal((await repository.graph('ai')).lectures[0].revision, 2);
  assert.equal(provider.calls, 1);
  assert.equal((await repository.job('ai/1/1'))!.state, 'failed');
  const input = await source.load('ai', '3');
  await repository.saveJob({ ...newest, id: 'ai/3/1', lectureId: '3', revision: 1, contentHash: input.contentHash, state: 'queued' });
  await recovered.recover(); await recovered.idle();
  assert.equal((await repository.job('ai/3/1'))!.state, 'completed');
  assert.equal(provider.calls, 2);
});
test('HTTP completion validates payloads, returns jobs, and source links reject stale evidence', async () => {
  const { service, source, repository } = setup();
  const app = createApp(service);
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/api/graph/lecture-completed', payload: { ...event(), revision: '1' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/graph/lecture-completed', payload: event() })).statusCode, 202);
    await service.idle();
    const result = await app.inject('/api/courses/ai/graph');
    assert.equal(result.statusCode, 200); assert.equal(result.json().nodes.length, 2);
    const ref = (await repository.graph('ai')).nodes[0].references[0];
    assert.equal((await app.inject(`/api/courses/ai/lectures/1/sources/malformed?hash=${ref.sourceHash}`)).statusCode, 400);
    const url = `/api/courses/ai/lectures/1/sources/${ref.sourceId}?hash=${ref.sourceHash}`;
    assert.equal((await app.inject(url)).statusCode, 200);
    source.revise('1', 'Changed source material.');
    assert.equal((await app.inject(url)).statusCode, 409);
  } finally { await app.close(); }
});
