import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeNotesCatalog, noteSources } from './notesCatalog.js';

test('prepared catalogue replaces CV placeholders without inventing dates and enables material-only AI notes', () => {
  const base = [{ id: 'cv', name: 'Computer Vision', code: '670', lectures: [{ id: '1', title: 'Placeholder', date: '2026-09-10' }] }, { id: 'ai', lectures: [{ id: '0', title: 'Introduction', replay: false }] }];
  const records = [{ courseId: 'cv', lectureId: '1', title: 'Image filtering', basis: 'transcript' }, { courseId: 'cv', lectureId: '2', title: 'Edges', basis: 'transcript' }, { courseId: 'ai', lectureId: '0', basis: 'materials' }];
  const [cv, ai] = mergeNotesCatalog(base, records);
  assert.equal(cv.lectures.length, 2); assert.equal(cv.lectures[0].date, ''); assert.equal(cv.lectures[0].title, 'Image filtering');
  assert.equal(ai.lectures[0].notesAvailable, true); assert.equal(ai.lectures[0].notesBasis, 'materials');
  assert.equal(base[0].lectures[0].title, 'Placeholder');
});

test('source links deduplicate chunks and retain authenticated source routes', () => {
  const records = [{ courseId: 'cv', lectureId: '1', sources: [{ id: 's1', path: 'recording.vtt', title: 'Recording', kind: 'transcript' }, { id: 's2', path: 'recording.vtt', title: 'Recording', kind: 'transcript' }] }];
  const sources = noteSources(records, []);
  assert.equal(sources.length, 1); assert.equal(sources[0].url, '/api/prepared/lectures/cv/1/sources/s1');
});
