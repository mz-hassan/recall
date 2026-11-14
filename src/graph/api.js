async function json(url, options) {
  const response = await fetch(url, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The graph service is unavailable. Start the backend and try again.');
  return result;
}
export const loadGraph = (courseId, signal) => json(`/api/courses/${encodeURIComponent(courseId)}/graph`, { signal });
export const retryIndexing = job => json('/api/graph/lecture-completed', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId: job.courseId, lectureId: job.lectureId, revision: job.revision }),
});
export const sourcePath = (courseId, ref) => `/api/courses/${encodeURIComponent(courseId)}/lectures/${encodeURIComponent(ref.lectureId)}/sources/${encodeURIComponent(ref.sourceId)}?hash=${encodeURIComponent(ref.sourceHash)}`;
