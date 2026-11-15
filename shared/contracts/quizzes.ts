import { z } from 'zod';

export const QuizStart = z.object({
  scope: z.enum(['topic', 'lecture']),
  source: z.enum(['notes', 'run', 'curated', 'transcript']).default('notes'),
  momentId: z.string().min(1).max(220).optional(),
  runId: z.string().min(1).max(220).optional(),
  retake: z.boolean().default(false),
  requestId: z.uuid(),
}).refine(value => value.scope !== 'topic' || Boolean(value.momentId), 'Choose a topic.');
export type QuizStart = z.infer<typeof QuizStart>;

export const QuizQuestion = z.object({
  id: z.string(), topicId: z.string(), topicTitle: z.string(),
  prompt: z.string(), options: z.array(z.string()).length(4),
});
export const QuizReview = z.object({
  questionId: z.string(), selected: z.number().int().min(0).max(3),
  correctIndex: z.number().int().min(0).max(3), correct: z.boolean(),
  explanation: z.string(), sourceQuote: z.string(),
});
export const QuizAttempt = z.object({
  id: z.uuid(), courseId: z.string(), lectureId: z.string(), quizKey: z.string(),
  title: z.string(), scope: z.enum(['topic', 'lecture']),
  status: z.enum(['draft', 'submitted']), firstAttempt: z.boolean(), ranked: z.boolean(),
  maxPoints: z.union([z.literal(10), z.literal(100)]),
  questions: z.array(QuizQuestion).min(2).max(15),
  coverage: z.array(z.object({ topicId: z.string(), title: z.string(), questions: z.number().int(), personalDoubt: z.boolean(), classDoubt: z.boolean(), important: z.boolean() })),
  createdAt: z.string(), provider: z.string(), model: z.string(),
  result: z.object({ correct: z.number().int(), total: z.number().int(), points: z.number(), percentage: z.number(), submittedAt: z.string(), review: z.array(QuizReview) }).optional(),
});
export type QuizAttempt = z.infer<typeof QuizAttempt>;
export const QuizSubmit = z.object({ answers: z.array(z.object({ questionId: z.string().min(1), choice: z.number().int().min(0).max(3) }).strict()).min(2).max(15) }).strict();

export const CourseLeaderboard = z.object({
  courseId: z.string(), totalStudents: z.number().int(),
  rows: z.array(z.object({ userId: z.string(), label: z.string(), rank: z.number().int(), points: z.number(), quizzes: z.number().int(), topicQuizzes: z.number().int(), lectureQuizzes: z.number().int(), isYou: z.boolean() })),
  yourEntry: z.object({ rank: z.number().int(), points: z.number(), quizzes: z.number().int() }).nullable(),
});
