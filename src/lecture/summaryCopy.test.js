import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryCopy, summaryFailed } from './summaryCopy.js';

test('pending topics never expose their raw transcript; the last good summary remains while updating', () => {
  const topic = { summary: '', quote: 'PRIVATE RAW WORDS', enrichment: 'pending' };
  assert.equal(summaryCopy(topic), 'Summarizing this topic…');
  assert.equal(summaryFailed(topic), false);
  assert.equal(summaryCopy({ ...topic, summary: 'A short cumulative explanation.' }), 'A short cumulative explanation.');
  assert.equal(summaryFailed({ ...topic, enrichment: 'ready' }), false);
  assert.equal(summaryFailed({ ...topic, enrichment: 'failed' }), true);
  assert(!summaryCopy({ ...topic, enrichment: 'failed' }).includes(topic.quote));
});
