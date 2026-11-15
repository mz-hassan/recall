import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wav16, encodeAudio } from './capture.js';

test('device audio is downsampled to bounded mono 16 kHz PCM WAV without changing duration', () => {
  const samples = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 10) * .2);
  const wav = wav16(samples, 48000), view = new DataView(wav.buffer);
  assert.equal(wav.length, 32044);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.deepEqual(Buffer.from(encodeAudio(wav), 'base64'), Buffer.from(wav));
});
