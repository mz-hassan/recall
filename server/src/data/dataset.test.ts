import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatasetSource } from './dataset.ts';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('dataset adapter reads both lectures, cleans slide markup, and returns stable source references', async () => {
  const source = new DatasetSource();
  const bc = await source.load('ai', '1'), rl = await source.load('ai', '3');
  assert.match(bc.sources[0].text, /Behavioral cloning/);
  assert.ok(!bc.sources[0].text.includes('<latexit'));
  assert.ok(rl.sources.some(item => item.title.endsWith('transcript')));
  assert.ok(rl.sources.some(item => item.title.endsWith('slides')));
  assert.equal((await source.load('ai', '1')).contentHash, bc.contentHash);
  await assert.rejects(source.load('cv', '1'), /No dataset/);
  await assert.rejects(source.load('ai', '9999'), /not found/);
});
test('PDF-only slide handoff yields real page citations and dataset paths cannot escape their root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'recall-dataset-test-'));
  try {
    await copyFile(new URL('../../../datasets/cs690s/lectures/01_2026-09-10_behavior-cloning/slides/bc-slides.pdf', import.meta.url), join(root, 'slides.pdf'));
    const manifest = { lectures: [{ number: 1, title: 'Behavior cloning', transcript: { files: [] as string[] }, slides: { files: ['slides.pdf'] } }] };
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    const source = new DatasetSource(root), lecture = await source.load('ai', '1');
    assert.ok(lecture.sources.length > 1);
    assert.ok(lecture.sources.every(source => source.page && source.page > 0));
    assert.ok(lecture.sources.some(source => /cloning/i.test(source.text)));
    // A real outside file with a supported extension must also be rejected.
    const outside = join(root, '..', `recall-outside-${Date.now()}.txt`);
    try {
      await writeFile(outside, 'This file is outside the dataset root.');
      manifest.lectures[0].transcript.files = [outside];
      await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
      await assert.rejects(source.load('ai', '1'), /inside the dataset folder/);
    } finally { await rm(outside, { force: true }); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
