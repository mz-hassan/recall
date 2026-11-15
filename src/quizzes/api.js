import { QuizAttempt, CourseLeaderboard } from '../../shared/contracts/quizzes.ts';

async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch('/api' + path, { method, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(150_000)]) : AbortSignal.timeout(150_000),
    ...(body && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'The quiz service is unavailable. Please retry.');
  return data;
}
export async function startQuiz(options, requestId, retake, signal) {
  const { courseId, lectureId, ...input } = options;
  return QuizAttempt.parse(await request(`/courses/${encodeURIComponent(courseId)}/lectures/${encodeURIComponent(lectureId)}/quizzes`,
    { method: 'POST', body: { ...input, requestId, retake }, signal }));
}
export async function submitQuiz(id, answers, signal) {
  return QuizAttempt.parse(await request(`/quizzes/${id}/submit`, { method: 'POST', body: { answers: Object.entries(answers).map(([questionId, choice]) => ({ questionId, choice })) }, signal }));
}
export async function leaderboard(courseId, filter, signal) {
  const query = new URLSearchParams(Object.entries(filter).filter(([, value]) => value));
  return CourseLeaderboard.parse(await request(`/courses/${encodeURIComponent(courseId)}/leaderboard?${query}`, { signal }));
}
