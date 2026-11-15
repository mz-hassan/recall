import type { Collection, Document } from 'mongodb';
import type { PrivateQuestion } from './generator.ts';
import type { QuizAttempt } from '../../../../shared/contracts/quizzes.ts';

export type StoredQuiz = Omit<QuizAttempt, 'questions' | 'createdAt'> & {
  _id: string; userId: string; questions: PrivateQuestion[]; createdAt: string;
  sourceRunId?: string; pointsUnits?: number;
};
export type QuizFilter = { lectureId?: string; scope?: 'lecture' | 'topic'; quizKey?: string };
export function createQuizRepository(collection: <T extends Document>(name: string) => Promise<Collection<T>>) {
  const quizzes = () => collection<StoredQuiz>('quiz_attempts');
  return {
    async slot(id: string) { return (await quizzes()).findOne({ _id: id }); },
    async owned(id: string, userId: string) { return (await quizzes()).findOne({ id, userId }); },
    async saveInitial(quiz: StoredQuiz) {
      return (await (await quizzes()).findOneAndUpdate({ _id: quiz._id }, { $setOnInsert: quiz }, { upsert: true, returnDocument: 'after' }))!;
    },
    async submit(id: string, userId: string, result: NonNullable<QuizAttempt['result']>, pointsUnits: number) {
      const store = await quizzes();
      await store.updateOne({ id, userId, status: 'draft' }, { $set: { status: 'submitted', result, pointsUnits } });
      return store.findOne({ id, userId });
    },
    async leaderboard(courseId: string, filter: QuizFilter) {
      return (await quizzes()).aggregate<{ userId: string; label: string; pointsUnits: number; quizzes: number; topicQuizzes: number; lectureQuizzes: number }>([
        { $match: { courseId, ranked: true, firstAttempt: true, status: 'submitted', ...filter } },
        { $group: { _id: '$userId', pointsUnits: { $sum: '$pointsUnits' }, quizzes: { $sum: 1 }, topicQuizzes: { $sum: { $cond: [{ $eq: ['$scope', 'topic'] }, 1, 0] } }, lectureQuizzes: { $sum: { $cond: [{ $eq: ['$scope', 'lecture'] }, 1, 0] } } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'account' } },
        { $unwind: '$account' }, { $match: { 'account.role': 'student', 'account.courses': courseId } },
        { $project: { _id: 0, userId: '$_id', label: { $arrayElemAt: [{ $split: ['$account.email', '@'] }, 0] }, pointsUnits: 1, quizzes: 1, topicQuizzes: 1, lectureQuizzes: 1 } },
        { $sort: { pointsUnits: -1, userId: 1 } },
      ]).toArray();
    },
  };
}
