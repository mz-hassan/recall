import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planQuiz, questionCount, type QuizTopic } from './planner.ts';
import type { Doubt } from '../../platform/repository.ts';

const topic = (id: string, size = 100): QuizTopic => ({ id, title: id, summary: '', quote: 'evidence '.repeat(size), type: 'CONCEPT', equations: [] });
const doubt = (id: string, userId: string): Doubt => ({ _id: id + userId, courseId: 'ai', lectureId: '1', runId: 'run', momentId: id, userId, createdAt: new Date() });
test('quiz size grows with distinct source material while respecting both requested ranges', () => {
  assert.equal(questionCount('topic', [topic('tiny', 15)]), 2);
  assert.equal(questionCount('topic', [topic('medium', 1800)]), 6);
  assert.equal(questionCount('topic', [topic('large', 9000)]), 10);
  assert.equal(questionCount('lecture', [topic('tiny', 15)]), 8);
  assert.equal(questionCount('lecture', [topic('large', 20000)]), 15);
  assert.equal(questionCount('lecture', [topic('same', 800), topic('repeat', 800)]), 8);
});
test('coverage prioritizes personal doubts, distinct class trends and important topics without counting repeat marks twice', () => {
  const topics = ['ordinary', 'personal', 'class', 'key'].map(id => topic(id));topics[3]!.type = 'KEY CONCEPT';
  const marks = [doubt('personal', 'me'), doubt('class', 'other'), doubt('class', 'other')];
  const plan = planQuiz(topics, 15, marks, 'me');
  assert.equal(plan.reduce((sum, item) => sum + item.count, 0), 15);
  assert.ok(plan.every(item => item.count > 0));
  const byId = new Map(plan.map(item => [item.id, item]));
  assert.ok(byId.get('personal')!.count > byId.get('ordinary')!.count);
  assert.ok(byId.get('key')!.count > byId.get('ordinary')!.count);
  assert.ok(byId.get('class')!.count >= byId.get('ordinary')!.count);
  assert.equal(byId.get('class')!.weight, 2);
  assert.deepEqual(planQuiz(topics, 15, marks.slice(0, 2), 'me'), plan);
});
