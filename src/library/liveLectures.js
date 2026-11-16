const pad = value => String(value).padStart(2, '0');
const localDate = (value = new Date()) => { const day = new Date(value); return day.getFullYear() + '-' + pad(day.getMonth() + 1) + '-' + pad(day.getDate()); };

/** Default name of a lecture captured live outside the course schedule, from its capture date. */
export const liveLectureTitle = (value = new Date()) => { const day = new Date(value); return 'Live Lecture - ' + pad(day.getMonth() + 1) + '/' + pad(day.getDate()); };

// The lecture a live session belongs to: CS50's pilot lecture, else today's or the next dated lecture,
// else a new lecture after the last one (so courses without a schedule can still be captured).
export function upcomingLecture(lectures, today = localDate()) {
  const scheduled = lectures.find(item => item.microphone) ?? lectures.find(item => item.date && item.date >= today);
  if (scheduled) return scheduled;
  const number = Math.max(0, ...lectures.map(item => Number(item.id)).filter(Number.isFinite)) + 1;
  return { id: String(number), number, title: 'Lecture ' + number };
}

// Lectures captured live are listed even when the course schedule does not include them. Those are
// the student's own lectures: named by capture date unless they renamed them, and editable.
export function mergeLiveRuns(course, runs, titles = []) {
  const captured = new Set(runs.filter(run => run.courseId === course.id && run.kind === 'live').map(run => run.lectureId));
  if (!captured.size) return course;
  const lectures = course.lectures.map(item => captured.has(item.id) ? { ...item, captured: true } : item);
  for (const lectureId of captured) if (!lectures.some(item => item.id === lectureId)) {
    // Runs arrive newest first, so this is the latest capture of the lecture.
    const run = runs.find(item => item.lectureId === lectureId && item.courseId === course.id);
    const named = titles.find(item => item.lectureId === lectureId)?.title;
    lectures.push({ id: lectureId, number: Number(lectureId), title: named || liveLectureTitle(run.updatedAt), date: localDate(run.updatedAt),
      courseId: course.id, courseName: course.name, courseCode: course.code, teacher: course.teacher, captured: true, editable: true, replay: false });
  }
  return { ...course, lectures: lectures.sort((a, b) => Number(a.id) - Number(b.id)) };
}
