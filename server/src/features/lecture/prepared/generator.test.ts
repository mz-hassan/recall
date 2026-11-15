import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFixtureProvider } from '../../../llm/fixture.ts';
import { generatePreparedNotes, prepareEvidence } from './generator.ts';

test('prepared notes validate citations, keep summaries concise and never use material offsets as recording times', async () => {
  const evidence = {
    key: { courseId: 'cv', lectureId: '1' }, lecture: { title: 'Imported recording 1' }, basis: 'transcript', contentHash: 'test',
    sources: [{ id: 's1', kind: 'transcript', title: 'Recording', path: 'recording.vtt', hash: '1', text: 'A convolution combines neighboring pixels.' },
      { id: 's2', kind: 'slides', title: 'Slides', path: 'slides.txt', hash: '2', text: 'A filter uses local weights.' }],
    chunks: [{ seq: 1, text: 'A convolution combines neighboring pixels.', time: 120, endTime: 150, timeSource: 'transcript', span: { path: 'recording.vtt', startTime: 120, endTime: 150 } },
      { seq: 2, text: 'A filter uses local weights.', time: 16, endTime: 24, timeSource: 'simulated', span: { path: 'slides.txt', startChar: 0, endChar: 30 } }],
    deck: { pdfPath: 'slides.pdf', pages: [{ page: 2, text: 'Filter weights' }], slide: (page: number) => ({ page, kind: 'pdf', url: '/slides.pdf#page=' + page }) },
  } as Awaited<ReturnType<typeof prepareEvidence>>;
  const output = { title: 'Convolution filters', summary: 'Images can be processed with local filters.', topics: [{ title: 'Local filtering', summary: 'Useful '.repeat(100), intuition: null, type: 'CONCEPT', evidenceIds: ['s1', 's2'], slides: [2, 999], equations: null, diagram: null }] };
  const provider = createFixtureProvider({ 'lecture.prepared-notes': () => output });
  const notes = await generatePreparedNotes(evidence, provider);
  assert.equal(notes.title, 'Convolution filters'); assert.equal(notes.moments[0]!.time, 120);
  assert.equal(notes.moments[0]!.timeSource, 'transcript');
  assert.deepEqual(notes.moments[0]!.slides.map(slide => slide.page), [2]);
  assert.ok(notes.moments[0]!.summary.split(/\s+/).length <= 70);
  assert.deepEqual(notes.moments[0]!.equations, []);
  assert.equal(notes.moments[0]!.intuition, '');
  output.topics[0]!.evidenceIds = ['invented'];
  await assert.rejects(generatePreparedNotes(evidence, provider), /validation/);
});

test('a lecture without a transcript uses materials as clearly identified preparation evidence', async () => {
  const evidence = await prepareEvidence('ai', '0');
  assert.equal(evidence.basis, 'materials'); assert.ok(evidence.sources.length > 0);
  assert.ok(evidence.sources.every(source => source.kind !== 'transcript'));
  assert.ok(evidence.chunks.every(chunk => chunk.timeSource === 'simulated'));
});
