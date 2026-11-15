import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { makeTranscriptMoments, replayOptions, replayPath } from './replay.js';

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
  assert.deepEqual(replayOptions('?words=-2&interval=1.5'), { lectureId: '2', courseId: 'ai', microphone: false, prepared:false, live: false, words: 160, interval: 8, limit: 6 });
  assert.equal(replayOptions('?limit=all').limit, Infinity);
  assert.deepEqual(makeTranscriptMoments('  ', '2', { words: 160, interval: 5 }), []);
});

test('course-qualified lecture links keep microphone capture separate from reference replay', () => {
  const capture = replayPath('0', false, 'cs50', true);
  assert.equal(capture, 'lecture.html?lecture=0&course=cs50&mode=microphone');
  assert.equal(replayOptions(capture.split('?')[1]).courseId, 'cs50');
  assert.equal(replayOptions(capture.split('?')[1]).microphone, true);
  assert.equal(replayOptions(replayPath('0', true, 'cs50').split('?')[1]).microphone, false);
  assert.equal(replayPath('2', true), 'lecture.html?lecture=2&mode=live');
});
