import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceSpans, extractLecture } from './harness.ts';
import { TestProvider, TestSource } from './testSupport.ts';

test('evidence span IDs resolve to verbatim text including transcript repetitions and punctuation', async () => {
  const source = new TestSource();
  const text = "So what is RL and, and how's it different from imitation learning? Uh, that's, that's like what we call reward hacking generally.";
  source.revise('1', text);
  const indexed = await extractLecture(await source.load('ai', '1'), new TestProvider(), []);
  for (const item of [...indexed.extractions[0].concepts, ...indexed.extractions[0].edges]) {
    assert.equal(item.citations[0].quote, text);
  }
  assert.ok(evidenceSpans(text.repeat(20)).every(span => text.repeat(20).includes(span.quote) && span.quote.length <= 800));
});
test('unknown evidence IDs get a bounded repair attempt and cannot enter the graph', async () => {
  const source = new TestSource(), provider = new TestProvider();
  provider.invalid = true;
  await assert.rejects(extractLecture(await source.load('ai', '1'), provider, []), /unavailable source or evidence span/);
  assert.equal(provider.calls, 2);
  const repaired = new TestProvider(); repaired.invalid = true;
  repaired.beforeGenerate = async () => { if (repaired.calls === 2) repaired.invalid = false; };
  const result = await extractLecture(await source.load('ai', '1'), repaired, []);
  assert.equal(repaired.calls, 2);
  assert.equal(result.extractions.length, 1);
  assert.equal(result.metadata.length, 2);
});
