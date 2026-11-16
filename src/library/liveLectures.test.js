import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveLectureTitle, mergeLiveRuns, upcomingLecture } from './liveLectures.js';

const lectures = [{ id: '0', date: '2026-09-08' }, { id: '17', date: '2026-11-12' }, { id: '18', date: '2026-11-17' }];

test('a live session opens CS50’s pilot lecture, else today’s or the next dated lecture', () => {
  assert.equal(upcomingLecture([{ id: '0', microphone: true }], '2026-11-16').id, '0');
  assert.equal(upcomingLecture(lectures, '2026-11-16').id, '18');
  assert.equal(upcomingLecture(lectures, '2026-11-17').id, '18');
});

test('courses without upcoming lectures, including new empty courses, get a new lecture to capture', () => {
  assert.deepEqual(upcomingLecture(lectures, '2026-12-25'), { id: '19', number: 19, title: 'Lecture 19' });
  assert.deepEqual(upcomingLecture([], '2026-11-16'), { id: '1', number: 1, title: 'Lecture 1' });
});

test('saved live captures mark listed lectures and add unlisted ones in order', () => {
  const course = { id: 'mine', name: 'My course', code: 'MINE', lectures: [{ id: '2', title: 'Two' }] };
  const runs = [
    { courseId: 'mine', lectureId: '2', kind: 'live', updatedAt: '2026-11-15T15:00:00Z' },
    { courseId: 'mine', lectureId: '1', kind: 'live', updatedAt: '2026-11-16T15:00:00Z' },
    { courseId: 'mine', lectureId: '3', kind: 'replay', updatedAt: '2026-11-16T15:00:00Z' },
    { courseId: 'other', lectureId: '4', kind: 'live', updatedAt: '2026-11-16T15:00:00Z' },
  ];
  const merged = mergeLiveRuns(course, runs).lectures;
  assert.deepEqual(merged.map(item => [item.id, item.captured]), [['1', true], ['2', true]]);
  assert.equal(merged[0].title, 'Live Lecture - 11/16');
  assert.equal(merged[0].date, '2026-11-16');
  assert.equal(merged[0].editable, true);
  assert.equal(merged[1].editable, undefined, 'scheduled lectures keep their course title');
  assert.equal(mergeLiveRuns(course, []), course);
});

test('a renamed live lecture keeps its name, and scheduled lectures cannot be renamed', () => {
  const course = { id: 'mine', lectures: [{ id: '2', title: 'Two' }] };
  const runs = [{ courseId: 'mine', lectureId: '1', kind: 'live', updatedAt: '2026-03-04T15:00:00Z' }, { courseId: 'mine', lectureId: '2', kind: 'live', updatedAt: '2026-03-04T15:00:00Z' }];
  const merged = mergeLiveRuns(course, runs, [{ lectureId: '1', title: 'Midterm review' }, { lectureId: '2', title: 'Ignored' }]).lectures;
  assert.deepEqual(merged.map(item => item.title), ['Midterm review', 'Two']);
  assert.equal(liveLectureTitle('2026-03-04T15:00:00Z'), 'Live Lecture - 03/04');
});
