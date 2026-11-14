import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachSummaries, summarizeConcepts } from './summaries.ts';
import { TestProvider, TestSource } from './testSupport.ts';
import { extractLecture } from './harness.ts';
import { mainConcepts } from './overview.ts';

test('summaries are generated once, preserve evidence and keys, and reuse their checkpoint', async () => {
  const source = await new TestSource().load('ai', '1'), provider = new TestProvider();
  const candidates = await extractLecture(source, provider, []);
  const overview = await mainConcepts(candidates, 'ai', provider);
  let saved: Awaited<ReturnType<import('./harness.ts').Checkpoints['load']>> = null;
  const checkpoints = { load: async () => saved, save: async (_key: string, value: NonNullable<typeof saved>) => { saved = value; } };
  const enriched = await summarizeConcepts(overview, provider, undefined, checkpoints);
  const again = await summarizeConcepts(overview, provider, undefined, checkpoints);
  assert.equal(provider.summaryCalls, 1);
  assert.deepEqual(again.extractions, enriched.extractions);
  for (let i = 0; i < overview.extractions[0].concepts.length; i++) {
    const before = overview.extractions[0].concepts[i], after = enriched.extractions[0].concepts[i];
    assert.equal(after.key, before.key); assert.deepEqual(after.citations, before.citations);
    assert.ok(after.summary && after.summary.length >= 40);
  }
});
test('missing, duplicate, unknown, or empty concept summaries cannot be published', async () => {
  const indexed = await extractLecture(await new TestSource().load('ai', '1'), new TestProvider(), []);
  const extraction = indexed.extractions[0];
  assert.throws(() => attachSummaries(extraction, { summaries: [] }), /exactly one/);
  const summary = 'A short explanation supported by the lecture evidence that describes this main idea.';
  assert.throws(() => attachSummaries(extraction, { summaries: [{ conceptKey: 'unknown', summary }] }), /exactly one/);
  assert.throws(() => attachSummaries(extraction, { summaries: extraction.concepts.map(node => ({ conceptKey: node.key, summary: '' })) }));
});
