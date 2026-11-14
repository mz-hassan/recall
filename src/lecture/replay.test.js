import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { makeTranscriptMoments, replayOptions } from './replay.js';

test('transcript chunks retain the transcript in order and use a configurable clock', () => {
  const options = replayOptions('?lecture=2&mode=live&words=30&interval=8');
  const transcript = readFileSync(new URL('../../datasets/cs690s/lectures/02_2026-09-15_limitations-of-behavior-cloning/transcripts/2026-09-15-transcript.txt', import.meta.url), 'utf8');
  const moments = makeTranscriptMoments(transcript, options.lectureId, options);
  assert.equal(moments.map(moment => moment.quote).join(' '), transcript.match(/\S+/g).join(' '));
  assert.equal(moments[0].time, 0);
  assert.equal(moments[1].time, 8);
  assert.equal(new Set(moments.map(moment => moment.id)).size, moments.length);
});

test('invalid query options fall back to usable defaults', () => {
  assert.deepEqual(replayOptions('?words=-2&interval=1.5'), { lectureId: '2', live: false, words: 160, interval: 5 });
  assert.deepEqual(makeTranscriptMoments('  ', '2', { words: 160, interval: 5 }), []);
});
