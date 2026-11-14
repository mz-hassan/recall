const [lectureId, revision, courseId = 'ai'] = process.argv.slice(2);
if (!/^\d+$/.test(lectureId ?? '') || !Number.isSafeInteger(Number(revision)) || Number(revision) < 1) {
  console.error('Usage: npm run graph:complete -- <lecture-number> <positive-revision-number> [course-id]');
  process.exit(1);
}
const base = `http://127.0.0.1:${process.env.API_PORT || 3001}`;
const response = await fetch(`${base}/api/graph/lecture-completed`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId, lectureId, revision: Number(revision) }),
});
const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exitCode = 1;
