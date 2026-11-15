import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildApp } from '../../app.ts';
import { loadConfig } from '../../config.ts';
import { createFixtureProvider } from '../../llm/fixture.ts';
import { ProviderError } from '../../llm/types.ts';
import { createPlatformRepository, type PreparedNotes } from '../../platform/repository.ts';
import type { Moment } from '../../../../shared/contracts/lecture.ts';

test('quizzes preserve first-attempt scores, hide keys and isolate course rankings across restart', { timeout: 120_000 }, async t => {
  const mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
  const settings = { uri: mongo.getUri(), database: 'quiz-test' };
  let repository = createPlatformRepository(settings);
  const provider = createFixtureProvider(), generate = provider.generateStructured.bind(provider);
  let generationCalls = 0, failGeneration = false;
  provider.generateStructured = async request => { if (request.task === 'lecture.quiz') { generationCalls++;if (failGeneration) throw new ProviderError('request_failed', 'Fixture failure'); }return generate(request); };
  const createApp = () => buildApp({ config: loadConfig({}), provider, repository });
  let app = await createApp();
  const generationId = randomUUID();
  const moments: Moment[] = ['ordinary', 'doubt', 'important', 'class'].map((name, i) => ({
    id: 'cv/1/study/' + name, title: 'Image filtering ' + name, short: name, time: i * 60, label: String(i), type: name === 'important' ? 'KEY CONCEPT' : 'CONCEPT',
    summary: `Topic ${name}: a filter combines neighboring pixels using a fixed set of weights.`, quote: `In topic ${name}, a convolution multiplies each local pixel by a filter weight and adds the products to form one output value.`,
    quoteTime: 'Transcript', intuition: '', slides: [], equations: [], graph: null, artifacts: [], revision: 1, status: 'closed', enrichment: 'ready', timeSource: 'transcript', chunkSeqs: [i + 1], sources: [{ path: 'recording.vtt', startTime: i * 60 }],
  }));
  const notes: PreparedNotes = { _id: 'cv/1', courseId: 'cv', lectureId: '1', title: 'Image filtering', basis: 'transcript', generationId, contentHash: 'test', promptVersion: 'test', provider: 'fixture', model: 'fixture', summary: 'How local filters transform images.', moments, sources: [], chunks: moments.map((moment, index) => ({ seq: index + 1, time: moment.time, endTime: moment.time + 60, timeSource: 'transcript', text: moment.quote, span: moment.sources[0]! })), createdAt: new Date() };
  const base = '/api/courses/cv/lectures/1/quizzes';
  let alice = '', bob = '', staff = '', outsider = '', aliceId = '', bobId = '', lectureQuizId = '', topicQuizId = '';
  const headers = (cookie: string) => ({ cookie });
  async function signup(email: string, courses: string[], role = 'student') {
    const response = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'quiz-test-password', role, courses } });
    assert.equal(response.statusCode, 201);return { cookie: String(response.headers['set-cookie']).split(';')[0]!, id: response.json().user.id };
  }
  async function start(cookie: string, scope: 'topic' | 'lecture', extra: object = {}) {
    return app.inject({ method: 'POST', url: base, headers: headers(cookie), payload: { scope, source: 'notes', requestId: randomUUID(), ...(scope === 'topic' ? { momentId: moments[1]!.id } : {}), ...extra } });
  }
  async function submit(cookie: string, userId: string, id: string, fraction = 1) {
    const quiz = (await repository.quizzes.owned(id, userId))!;
    const cutoff = Math.floor(quiz.questions.length * fraction);
    return app.inject({ method: 'POST', url: '/api/quizzes/' + id + '/submit', headers: headers(cookie), payload: { answers: quiz.questions.map((question, index) => ({ questionId: question.id, choice: index < cutoff ? question.correctIndex : (question.correctIndex + 1) % 4 })) } });
  }
  const board = async (cookie: string, suffix = '') => (await app.inject({ url: '/api/courses/cv/leaderboard' + suffix, headers: headers(cookie) })).json();
  try {
    await repository.saveNotes(notes);
    const a = await signup('alice@example.edu', ['cv']);alice = a.cookie;aliceId = a.id;
    const b = await signup('bob@example.edu', ['cv']);bob = b.cookie;bobId = b.id;
    staff = (await signup('teacher@example.edu', ['cv'], 'instructor')).cookie;
    outsider = (await signup('outsider@example.edu', ['ai'])).cookie;
    await repository.setDoubt({ _id: 'personal', userId: aliceId, courseId: 'cv', lectureId: '1', runId: generationId, momentId: moments[1]!.id, createdAt: new Date() }, true);
    await repository.setDoubt({ _id: 'class', userId: bobId, courseId: 'cv', lectureId: '1', runId: generationId, momentId: moments[3]!.id, createdAt: new Date() }, true);
    await t.test('membership, cached drafts and hidden answer keys', async () => {
      assert.equal((await app.inject({ method: 'POST', url: base, payload: { scope: 'lecture', requestId: randomUUID() } })).statusCode, 401);
      assert.equal((await start(outsider, 'lecture')).statusCode, 403);
      const responses = await Promise.all([start(alice, 'lecture'), start(alice, 'lecture')]);
      for (const response of responses) assert.equal(response.statusCode, 201, response.body);
      const quiz = responses[0]!.json();lectureQuizId = quiz.id;
      assert.equal(responses[1]!.json().id, quiz.id);assert.equal(generationCalls, 1);
      assert.ok(quiz.questions.length >= 8 && quiz.questions.length <= 15);assert.equal(quiz.maxPoints, 100);
      assert.ok(!JSON.stringify(quiz).includes('correctIndex'));assert.ok(!JSON.stringify(quiz).includes('sourceQuote'));
      assert.ok(quiz.coverage.find((topic: { personalDoubt: boolean }) => topic.personalDoubt));
      assert.ok(quiz.coverage.find((topic: { classDoubt: boolean }) => topic.classDoubt));
      assert.equal((await app.inject({ url: '/api/quizzes/' + quiz.id, headers: headers(bob) })).statusCode, 404);
      assert.equal((await board(alice)).rows.length, 0);
      assert.equal((await start(alice, 'lecture', { retake: true })).statusCode, 409);
      assert.equal((await app.inject({ method: 'POST', url: '/api/quizzes/' + quiz.id + '/submit', headers: headers(alice), payload: { answers: [] } })).statusCode, 400);
      const invalid = quiz.questions.map((question: {id:string}) => ({ questionId: question.id, choice: 0 }));invalid[0] = invalid[1];
      assert.equal((await app.inject({ method: 'POST', url: '/api/quizzes/' + quiz.id + '/submit', headers: headers(alice), payload: { answers: invalid } })).statusCode, 400);
    });
    await t.test('topic scores are out of 10, lectures out of 100, and repeated submissions cannot replace the first score', async () => {
      const first = await submit(alice, aliceId, lectureQuizId, .5);assert.equal(first.statusCode, 200);
      assert.equal(first.json().result.points, 50);assert.equal(first.json().result.review.length, first.json().questions.length);
      assert.equal((await submit(alice, aliceId, lectureQuizId, 1)).json().result.points, 50);
      const topic = await start(alice, 'topic');assert.equal(topic.statusCode, 201, topic.body);topicQuizId = topic.json().id;
      assert.ok(topic.json().questions.length >= 2 && topic.json().questions.length <= 10);assert.equal(topic.json().maxPoints, 10);
      assert.equal((await submit(alice, aliceId, topicQuizId)).json().result.points, 10);
      assert.equal((await board(alice)).yourEntry.points, 60);
    });
    await t.test('retakes and staff quizzes never add leaderboard points; course and student boundaries hold', async () => {
      const practice = (await start(alice, 'lecture', { retake: true })).json();assert.equal(practice.ranked, false);
      assert.equal((await submit(alice, aliceId, practice.id)).json().result.points, 100);
      assert.equal((await board(alice)).yourEntry.points, 60);
      const teacher = await repository.findUser('teacher@example.edu', 'instructor');
      const teacherQuiz = (await start(staff, 'lecture')).json();assert.equal(teacherQuiz.ranked, false);
      await submit(staff, teacher!.id, teacherQuiz.id);
      const bobQuiz = (await start(bob, 'lecture')).json();await submit(bob, bobId, bobQuiz.id);
      const ranks = await board(alice);assert.equal(ranks.totalStudents, 2);assert.equal(ranks.rows[0].label, 'bob');assert.equal(ranks.yourEntry.rank, 2);
      assert.equal((await app.inject({ url: '/api/courses/cv/leaderboard', headers: headers(outsider) })).statusCode, 403);
      assert.equal((await board(alice, '?scope=topic')).yourEntry.points, 10);
      assert.equal((await board(alice, '?lectureId=2')).rows.length, 0);
      // Metadata supplied by a client is never accepted as an earned score.
      assert.equal((await app.inject({ method: 'POST', url: '/api/quizzes/' + practice.id + '/submit', headers: headers(bob), payload: { points: 9999, answers: [] } })).statusCode, 404);
    });
    await t.test('generation errors leave the first attempt unused and support retry', async () => {
      failGeneration = true;
      const failed = await start(alice, 'topic', { momentId: moments[0]!.id });assert.equal(failed.statusCode, 503);
      assert.match(failed.json().error, /first attempt has not been used/);
      failGeneration = false;
      const retry = await start(alice, 'topic', { momentId: moments[0]!.id });assert.equal(retry.statusCode, 201);assert.equal(retry.json().firstAttempt, true);
    });
    await app.close();await repository.close();repository = createPlatformRepository(settings);app = await createApp();
    await t.test('answers, first attempts and rankings survive restart and note regeneration', async () => {
      const calls = generationCalls;
      await repository.saveNotes({ ...notes, generationId: randomUUID() });
      const quiz = (await start(alice, 'lecture')).json();assert.equal(quiz.id, lectureQuizId);assert.equal(quiz.result.points, 50);assert.equal(generationCalls, calls);
      assert.equal((await app.inject({ url: '/api/quizzes/' + topicQuizId, headers: headers(alice) })).json().result.points, 10);
      assert.equal((await board(alice)).yourEntry.points, 60);
      const answers = await Promise.all([submit(alice, aliceId, lectureQuizId, 1), submit(alice, aliceId, lectureQuizId, 0)]);
      assert.ok(answers.every(response => response.json().result.points === 50));
    });
    await t.test('curated lecture doubts and topic quizzes use validated saved material', async () => {
      await app.inject({ method: 'POST', url: '/api/auth/courses', headers: headers(alice), payload: { courseId: 'ai' } });
      const payload = { courseId: 'ai', lectureId: '2', runId: 'curated:ai:2', momentId: 'ai/2/curated/3', unclear: true };
      assert.equal((await app.inject({ method: 'PUT', url: '/api/doubts', headers: headers(alice), payload })).statusCode, 200);
      assert.equal((await app.inject({ method: 'PUT', url: '/api/doubts', headers: headers(alice), payload: { ...payload, momentId: 'invented' } })).statusCode, 404);
      const quiz = await app.inject({ method: 'POST', url: '/api/courses/ai/lectures/2/quizzes', headers: headers(alice), payload: { scope: 'topic', source: 'curated', momentId: payload.momentId, requestId: randomUUID() } });
      assert.equal(quiz.statusCode, 201, quiz.body);assert.equal(quiz.json().coverage[0].personalDoubt, true);
      const submissions=await Promise.all([submit(alice,aliceId,quiz.json().id,1),submit(alice,aliceId,quiz.json().id,0)]);
      assert.equal(submissions[0]!.json().result.points,submissions[1]!.json().result.points);
      const ranks=(await app.inject({url:'/api/courses/ai/leaderboard',headers:headers(alice)})).json();
      assert.equal(ranks.yourEntry.quizzes,1);assert.equal(ranks.yourEntry.points,submissions[0]!.json().result.points);
    });
    await t.test('students with equal earned points share a rank',async()=>{
      const charlie=await signup('charlie@example.edu',['cv']);
      const lecture=(await start(charlie.cookie,'lecture')).json();await submit(charlie.cookie,charlie.id,lecture.id,.5);
      const topic=(await start(charlie.cookie,'topic')).json();await submit(charlie.cookie,charlie.id,topic.id);
      const ranks=await board(alice),same=ranks.rows.filter((row:{points:number})=>row.points===60);
      assert.equal(same.length,2);assert.ok(same.every((row:{rank:number})=>row.rank===2));
    });
  } finally { await app.close();await repository.close();await mongo.stop(); }
});
