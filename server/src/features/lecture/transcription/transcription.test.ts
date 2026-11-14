import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import { hasTranscript, loadTranscriptChunks } from './index.ts';
import { parseTxtTranscript, parseVttTranscript } from './parse.ts';

test('TXT parsing skips speaker and timestamp lines and keeps exact character offsets', () => {
  const source = 'SPEAKER 0\nHello there, class.\n00:01:29\nScott Niekum\nWe start now.\n';
  const words = parseTxtTranscript(source);
  assert.deepEqual(words.map(word => word.text), ['Hello', 'there,', 'class.', 'We', 'start', 'now.']);
  for (const word of words) assert.equal(source.slice(word.start, word.end), word.text);
});

test('VTT parsing drops notes and voice tags and spreads cue time across words', () => {
  const source = 'WEBVTT\n\n00:00:10.000 --> 00:00:12.000\n<v Speaker 0>Two words</v>\n\nNOTE CONF {"raw":[1]}\n\n01:00:00.000 --> 01:00:04.000\n<v Speaker 1>One two three four.';
  const words = parseVttTranscript(source);
  assert.deepEqual(words.map(word => word.text), ['Two', 'words', 'One', 'two', 'three', 'four.']);
  assert.deepEqual(words.slice(0, 2).map(word => [word.time, word.endTime]), [[10, 11], [11, 12]]);
  assert.equal(words[2]!.time, 3600);
});

test('Lecture 02 (TXT) chunks keep every spoken word in order with simulated time', async () => {
  const source = await loadTranscriptChunks({ courseId: 'ai', lectureId: '2' }, { words: 160, interval: 8 });
  assert.equal(source?.format, 'txt');
  const chunks = source!.chunks;
  chunks.forEach(chunk => TranscriptChunk.parse(chunk));
  assert.deepEqual(chunks.map(chunk => chunk.seq), chunks.map((_, index) => index + 1));
  assert.deepEqual([chunks[0]!.time, chunks[1]!.time], [0, 8]);
  assert.equal(chunks[0]!.timeSource, 'simulated');
  const file = readFileSync(new URL('../../../../../datasets/cs690s/' + source!.path, import.meta.url), 'utf8');
  const first = chunks[0]!;
  assert.ok(file.slice(first.span.startChar, first.span.endChar).startsWith(first.text.split(' ')[0]!));
  assert.ok(!chunks.some(chunk => /Scott Niekum|\b00:01:29\b/.test(chunk.text)), 'speaker names and timestamps are removed');
});

test('Lectures with a VTT file use real lecture time', async () => {
  const source = await loadTranscriptChunks({ courseId: 'ai', lectureId: '7' }, { words: 160, interval: 8 });
  assert.equal(source?.format, 'vtt');
  const [first, second] = source!.chunks;
  assert.equal(first!.timeSource, 'transcript');
  assert.ok(first!.time > 140 && first!.time < 150, 'first cue starts at 00:02:27.600');
  assert.ok(second!.time >= first!.endTime - 1e-9);
});

test('Lecture 11 replays the transcript it shares with lecture 10', async () => {
  const source = await loadTranscriptChunks({ courseId: 'ai', lectureId: '11' }, { words: 160, interval: 8 });
  assert.match(source!.path, /^lectures\/10_/);
});

test('lectures without a transcript, and unknown courses, report none', async () => {
  assert.equal(await hasTranscript({ courseId: 'ai', lectureId: '0' }), false);
  assert.equal(await hasTranscript({ courseId: 'nope', lectureId: '2' }), false);
  assert.equal(await hasTranscript({ courseId: 'ai', lectureId: '2' }), true);
});
