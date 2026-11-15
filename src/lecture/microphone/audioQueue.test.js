import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioQueue } from './audioQueue.js';
import { wav16, encodeAudio } from './capture.js';

const packet = (seq, amplitude = .1) => ({ seq, time: (seq - 1) * 12, endTime: seq * 12,
  audio: encodeAudio(wav16(new Float32Array(16000 * 12).fill(amplitude), 16000)) });

test('slow recognition combines waiting audio, preserves every sample and clock, and drains without stopping', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const sent = [], errors = [];
  let stopped = false;
  const queue = createAudioQueue({ send: async input => { sent.push(input); if (sent.length === 1) await gate; }, onError: error => errors.push(error), onSlow: () => { stopped = true; } });
  queue.push(packet(1)); queue.push(packet(2, .2)); queue.push(packet(3, .3));
  assert.equal(sent.length, 1);
  release(); await queue.drain();
  assert.deepEqual(sent.map(input => [input.seq, input.time, input.endTime]), [[1,0,12],[2,12,36]]);
  const joined = Buffer.from(sent[1].audio, 'base64');
  assert.equal(joined.length, 44 + 24 * 16000 * 2);
  assert.equal(joined.readInt16LE(44), Math.round(.2 * 32767));
  assert.equal(joined.readInt16LE(44 + 12 * 16000 * 2), Math.round(.3 * 32767));
  assert.equal(joined.readUInt32LE(40), joined.length - 44);
  assert.deepEqual(errors, []); assert.equal(stopped, false);
});

test('failed or cancelled recognition releases drain waiters and does not replay packets into a new run', async () => {
  const errors = [];
  const failed = createAudioQueue({ send: async () => { throw new Error('Decoder unavailable'); }, onError: error => errors.push(error.message) });
  failed.push(packet(1)); failed.push(packet(2)); await failed.drain();
  assert.deepEqual(errors, ['Decoder unavailable']);
  const cancelled = createAudioQueue({ send: (_, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled')))), onError: () => assert.fail('Navigation is not a decoder failure') });
  cancelled.push(packet(1)); cancelled.cancel(); await cancelled.drain();
});
