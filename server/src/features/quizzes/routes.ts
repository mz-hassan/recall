import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { QuizStart, QuizSubmit, type QuizAttempt } from '../../../../shared/contracts/quizzes.ts';
import { requireCourse, requireUser, AccountError } from '../../platform/auth.ts';
import type { PlatformRepository } from '../../platform/repository.ts';
import type { UserLectureRuntimes } from '../../platform/lectureRuntime.ts';
import { ProviderError, type ModelProvider } from '../../llm/types.ts';
import { generateQuiz } from './generator.ts';
import { planQuiz, questionCount } from './planner.ts';
import type { StoredQuiz } from './repository.ts';
import { quizSource } from './sources.ts';

const Params = z.object({ courseId: z.string().regex(/^[a-z0-9-]{1,40}$/i), lectureId: z.string().regex(/^\d{1,4}$/) });
const keyFor = (scope: 'lecture' | 'topic', momentId?: string) => scope === 'lecture' ? 'lecture' : 'topic:' + createHash('sha256').update(momentId!).digest('hex').slice(0, 24);
function publicQuiz(quiz: StoredQuiz): QuizAttempt {
  const { _id, userId, pointsUnits, sourceRunId, ...safe } = quiz;
  return { ...safe, questions: quiz.questions.map(({ id, topicId, topicTitle, prompt, options }) => ({ id, topicId, topicTitle, prompt, options })) };
}

export async function quizRoutes(app: FastifyInstance, { repository, runtimes, provider }: { repository: PlatformRepository; runtimes: UserLectureRuntimes; provider: ModelProvider }) {
  const generating = new Map<string, Promise<StoredQuiz>>();
  app.post('/courses/:courseId/lectures/:lectureId/quizzes', async (request, reply) => {
    const key = Params.parse(request.params), input = QuizStart.parse(request.body);
    const user = await requireCourse(request, repository, key.courseId);
    const quizKey = keyFor(input.scope, input.momentId);
    const firstSlot = [user.id, key.courseId, key.lectureId, quizKey, 'first'].join('/');
    const first = await repository.quizzes.slot(firstSlot);
    if (first && !input.retake) return publicQuiz(first);
    if (input.retake && first?.status !== 'submitted') throw new AccountError(409, 'Submit the first attempt before starting a practice retake.');
    const slot = input.retake ? firstSlot + '/' + input.requestId : firstSlot;
    const existing = await repository.quizzes.slot(slot);
    if (existing) return publicQuiz(existing);
    let pending = generating.get(slot);
    if (!pending) {
      pending = (async () => {
        const source = await quizSource(request, input, user, repository, runtimes);
        const [doubts, chats] = await Promise.all([
          repository.doubts(key.courseId, key.lectureId),
          source.runId ? repository.chats(user.id, key.courseId, key.lectureId, source.runId) : Promise.resolve([]),
        ]);
        const count = questionCount(input.scope, source.topics);
        const plan = planQuiz(source.topics, count, doubts, user.id);
        const topicIds = new Set(source.topics.map(topic => topic.id));
        const personalQuestions = chats.filter(chat => chat.request.context.kind === 'recent' || topicIds.has(chat.request.context.momentId)).map(chat => chat.request.question);
        const generated = await generateQuiz(provider, plan, personalQuestions);
        const quiz: StoredQuiz = { _id: slot, id: randomUUID(), userId: user.id, ...key, quizKey,
          title: source.title, scope: input.scope, status: 'draft', firstAttempt: !input.retake, ranked: !input.retake && user.role === 'student',
          maxPoints: input.scope === 'topic' ? 10 : 100, createdAt: new Date().toISOString(),
          ...generated, ...(source.runId ? { sourceRunId: source.runId } : {}),
          coverage: plan.map(topic => ({ topicId: topic.id, title: topic.title, questions: topic.count, personalDoubt: topic.personalDoubt, classDoubt: topic.classDoubt, important: topic.important })),
        };
        return repository.quizzes.saveInitial(quiz);
      })();
      generating.set(slot, pending);
      void pending.finally(() => generating.delete(slot)).catch(() => {});
    }
    try { return reply.code(201).send(publicQuiz(await pending)); }
    catch (error) { if (error instanceof ProviderError) return reply.code(503).send({error:'The quiz could not be prepared from the lecture. Your first attempt has not been used; please retry.'}); throw error; }
  });
  app.get('/quizzes/:quizId', async request => {
    const { quizId } = z.object({ quizId: z.uuid() }).parse(request.params), user = await requireUser(request, repository);
    const quiz = await repository.quizzes.owned(quizId, user.id);
    if (!quiz) throw new AccountError(404, 'Quiz not found in your account.');
    await requireCourse(request, repository, quiz.courseId); return publicQuiz(quiz);
  });
  app.post('/quizzes/:quizId/submit', async request => {
    const { quizId } = z.object({ quizId: z.uuid() }).parse(request.params), user = await requireUser(request, repository);
    const quiz = await repository.quizzes.owned(quizId, user.id);
    if (!quiz) throw new AccountError(404, 'Quiz not found in your account.');
    await requireCourse(request, repository, quiz.courseId);
    if (quiz.status === 'submitted') return publicQuiz(quiz);
    const input = QuizSubmit.parse(request.body), answers = new Map(input.answers.map(answer => [answer.questionId, answer.choice]));
    if (input.answers.length !== quiz.questions.length || answers.size !== quiz.questions.length || quiz.questions.some(question => !answers.has(question.id))) throw new AccountError(400, 'Answer every question once before submitting.');
    const review = quiz.questions.map(question => ({ questionId: question.id, selected: answers.get(question.id)!, correctIndex: question.correctIndex,
      correct: answers.get(question.id) === question.correctIndex, explanation: question.explanation, sourceQuote: question.sourceQuote }));
    const correct = review.filter(answer => answer.correct).length, total = quiz.questions.length;
    const pointsUnits = Math.round(correct / total * quiz.maxPoints * 100);
    const saved = await repository.quizzes.submit(quiz.id, user.id, { correct, total, points: pointsUnits / 100, percentage: Math.round(correct / total * 10000) / 100,
      review, submittedAt: new Date().toISOString() }, pointsUnits);
    return publicQuiz(saved!);
  });
  app.get('/courses/:courseId/leaderboard', async request => {
    const { courseId } = z.object({ courseId: z.string().min(1) }).parse(request.params), user = await requireCourse(request, repository, courseId);
    const filter = z.object({ lectureId: z.string().regex(/^\d{1,4}$/).optional(), scope: z.enum(['topic', 'lecture']).optional(), quizKey: z.string().max(80).optional() }).parse(request.query);
    const scores = await repository.quizzes.leaderboard(courseId, filter);
    let rank = 0, previous: number | undefined;
    const rows = scores.map((score, index) => {
      if (score.pointsUnits !== previous) rank = index + 1;
      previous = score.pointsUnits;
      return { userId: score.userId, label: score.label, rank, points: score.pointsUnits / 100, quizzes: score.quizzes, topicQuizzes: score.topicQuizzes, lectureQuizzes: score.lectureQuizzes, isYou: score.userId === user.id };
    });
    const own = rows.find(row => row.isYou);
    return { courseId, totalStudents: rows.length, rows: rows.slice(0, 100), yourEntry: own ? { rank: own.rank, points: own.points, quizzes: own.quizzes } : null };
  });
}
