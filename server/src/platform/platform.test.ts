import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { createFixtureProvider } from '../llm/fixture.ts';
import { createPlatformRepository, type PreparedNotes } from './repository.ts';
import { createUserLectureRuntimes } from './lectureRuntime.ts';
import type { FastifyRequest } from 'fastify';
import type { Moment, TranscriptChunk } from '../../../shared/contracts/lecture.ts';

test('Mongo accounts share prepared notes and preserve isolated lecture histories across restart', { timeout: 120_000 }, async t => {
  const mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
  const settings = { uri: mongo.getUri(), database: 'platform-test' };
  let repository = createPlatformRepository(settings);
  const provider = createFixtureProvider();
  let chatCalls = 0, modelCalls = 0;
  const generate = provider.generateStructured.bind(provider);
  provider.generateStructured = async request => { modelCalls++; if (request.task.includes('chat')) chatCalls++; return generate(request); };
  const decoder = { status: () => ({ installed: true, ready: true, busy: false, model: 'test', device: 'test' }), warmup: async () => {}, close() {}, transcribe: async () => 'Algorithms transform inputs into outputs. Binary search repeatedly divides a sorted list in half to find an item efficiently. Each step eliminates half of the remaining possibilities.' };
  const createApp = () => buildApp({ config: loadConfig({}), provider, repository, speechDecoder: decoder });
  let app = await createApp();
  const key = { courseId: 'cv', lectureId: '1' }, generationId = randomUUID();
  const span = { path: 'transcripts/recording-01.vtt', startTime: 0, endTime: 60 };
  const chunk: TranscriptChunk = { seq: 1, time: 0, endTime: 60, timeSource: 'transcript', span, text: 'An image is a grid of pixel values. A convolution combines neighboring pixels using a small filter.' };
  const moment: Moment = { id: 'cv/1/study/1', time: 0, label: '01', title: 'Pixels and convolution', short: 'Pixels', type: 'concept', summary: 'A convolution combines nearby pixels with a filter.', quote: chunk.text, quoteTime: '00:00', intuition: 'A filter examines a small image neighborhood.', slides: [], equations: [], artifacts: [], graph: null, revision: 1, status: 'closed', enrichment: 'ready', timeSource: 'transcript', chunkSeqs: [1], sources: [span] };
  const note: PreparedNotes = { _id: 'cv/1', ...key, generationId, title: 'Images and filters', basis: 'transcript', contentHash: 'test', promptVersion: 'test', provider: 'fixture', model: 'fixture', summary: 'Images contain pixels; filters combine their values.', moments: [moment], chunks: [chunk], sources: [{ id: 's1', title: 'Recording 1', path: span.path, kind: 'transcript', text: chunk.text, hash: 'test' }], createdAt: new Date() };
  let alice = '', bob = '', aliceId = '';
  let chatRequest: object, artifactRequest: object, artifactId = '', liveRunId = '';
  let slideRequest: object, slideNotes: unknown;
  const study = '/api/prepared/lectures/cv/1';
  async function signup(email: string, courses: string[]) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, role: 'student', password: 'test-password-123', courses } });
    assert.equal(response.statusCode, 201, response.body);
    assert.ok(!response.body.includes('passwordHash'));
    assert.match(String(response.headers['set-cookie']), /HttpOnly; SameSite=Lax/);
    return { cookie: String(response.headers['set-cookie']).split(';')[0]!, user: response.json().user };
  }
  try {
    await repository.saveNotes(note);
    await t.test('authentication, membership and source boundaries', async () => {
      const first = await signup('alice@example.edu', ['cv', 'cs50']); alice = first.cookie; aliceId = first.user.id;
      bob = (await signup('bob@example.edu', [])).cookie;
      assert.equal((await app.inject(study + '/moments')).statusCode, 401);
      assert.equal((await app.inject({ url: study + '/moments', headers: { cookie: bob } })).statusCode, 403);
      assert.equal((await app.inject({ method: 'POST', url: '/api/auth/courses', headers: { cookie: bob }, payload: { courseId: 'cv' } })).statusCode, 200);
      const catalog = (await app.inject('/api/courses/notes')).json();
      assert.equal(catalog.lectures.length, 1); assert.ok(!JSON.stringify(catalog).includes(chunk.text));
      assert.equal((await app.inject(study + '/sources/s1')).statusCode, 401);
      assert.equal((await app.inject('/api/datasets/cv/transcripts/recording-01.vtt')).statusCode, 401);
      assert.equal((await app.inject({ url: study + '/sources/s1', headers: { cookie: alice } })).body, chunk.text);
      const a = await app.inject({ url: study + '/moments', headers: { cookie: alice } });
      const b = await app.inject({ url: study + '/moments', headers: { cookie: bob } });
      assert.equal(a.json().runId, generationId); assert.deepEqual(a.json().moments, b.json().moments);
      assert.equal((await app.inject({ method: 'POST', url: study + '/session', headers: { cookie: alice }, payload: {} })).statusCode, 405);
      assert.equal((await app.inject({ method: 'POST', url: '/api/lectures/cs50/0/session', headers: { cookie: alice, origin: 'http://other.example' }, payload: {} })).statusCode, 403);
      assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.edu', role: 'student', password: 'wrong-password' } })).statusCode, 401);
    });
    await t.test('chat, doubts and generated visuals belong to their owner', async () => {
      chatRequest = { requestId: randomUUID(), runId: generationId, question: 'Explain this moment', context: { kind: 'moment', momentId: moment.id } };
      const chat = await app.inject({ method: 'POST', url: study + '/chat', headers: { cookie: alice }, payload: chatRequest });
      assert.equal(chat.statusCode, 200, chat.body); assert.equal(chat.json().citations[0].momentId, moment.id);
      const calls = chatCalls;
      assert.deepEqual((await app.inject({ method: 'POST', url: study + '/chat', headers: { cookie: alice }, payload: chatRequest })).json(), chat.json());
      assert.equal(chatCalls, calls);
      assert.equal((await app.inject({ url: study + '/chat/history?runId=' + generationId, headers: { cookie: bob } })).json().messages.length, 0);
      const doubt = { ...key, runId: generationId, momentId: moment.id, unclear: true };
      assert.equal((await app.inject({ method: 'PUT', url: '/api/doubts', headers: { cookie: alice }, payload: doubt })).json().doubts.length, 1);
      assert.equal((await app.inject({ url: '/api/doubts?courseId=cv', headers: { cookie: bob } })).json().doubts.length, 0);
      assert.equal((await app.inject({ method: 'PUT', url: '/api/doubts', headers: { cookie: alice }, payload: { ...doubt, momentId: 'invented' } })).statusCode, 404);
      artifactRequest = { requestId: randomUUID(), runId: generationId, momentId: moment.id, prompt: 'Show the evidence coverage', kind: 'chart' };
      const visual = await app.inject({ method: 'POST', url: study + '/artifacts', headers: { cookie: alice }, payload: artifactRequest });
      assert.equal(visual.statusCode, 201, visual.body); artifactId = visual.json().id;
      assert.equal((await app.inject({ url: study + '/artifacts/' + artifactId + '?runId=' + generationId, headers: { cookie: bob } })).statusCode, 404);
      const other = (await app.inject({ url: study + '/moments', headers: { cookie: bob } })).json();
      assert.equal(other.moments[0].artifacts.length, 0);
    });
    await t.test('microphone sessions and transcripts are private and durably saved', async () => {
      const headers = { cookie: alice, 'x-recall-microphone': '1' };
      const start = await app.inject({ method: 'POST', url: '/api/lectures/cs50/0/microphone', headers });
      assert.equal(start.statusCode, 200, start.body); liveRunId = start.json().runId;
      assert.ok(await repository.run(aliceId, liveRunId));
      const audio = await app.inject({ method: 'POST', url: '/api/lectures/cs50/0/microphone/audio', headers, payload: { runId: liveRunId, seq: 1, time: 0, endTime: 12, audio: 'a'.repeat(80) } });
      assert.equal(audio.statusCode, 200, audio.body);
      const finish = await app.inject({ method: 'POST', url: '/api/lectures/cs50/0/microphone/finish', headers, payload: { runId: liveRunId } });
      assert.equal(finish.statusCode, 200, finish.body);
      const run = await repository.run(aliceId, liveRunId);
      assert.ok(run?.chunks[0]?.text.includes('Binary search'));
      assert.equal(run?.kind, 'live'); assert.ok(!JSON.stringify(run).includes('audio'));
      slideRequest={runId:liveRunId,momentId:run!.snapshot.moments[0]!.id,page:4};
      const coaching=await app.inject({method:'POST',url:'/api/lectures/cs50/0/slide-coaching',headers:{cookie:alice},payload:slideRequest});
      assert.equal(coaching.statusCode,200,coaching.body);slideNotes=coaching.json();
      assert.equal((await app.inject({ url: '/api/account/runs/' + liveRunId, headers: { cookie: bob } })).statusCode, 404);
      assert.equal((await app.inject({ method: 'POST', url: '/api/auth/courses', headers: { cookie: bob }, payload: { courseId: 'cs50' } })).statusCode, 200);
      const empty = (await app.inject({ url: '/api/lectures/cs50/0/moments', headers: { cookie: bob } })).json();
      assert.equal(empty.runId, null); assert.equal(empty.moments.length, 0);
    });
    const replay = '/api/lectures/ai/3';
    let savedReplay: { runId: string; moments: Moment[] };
    await t.test('a completed transcript replay saves its generated notes', async () => {
      const headers = { cookie: alice };
      const joined = await app.inject({ method: 'POST', url: '/api/auth/courses', headers, payload: { courseId: 'ai' } });
      assert.equal(joined.statusCode, 200, joined.body);
      const started = await app.inject({ method: 'POST', url: replay + '/session', headers, payload: { start: 'instant', limit: 3 } });
      assert.equal(started.statusCode, 201, started.body);
      const runId = started.json().runId;
      for (let attempt = 0; attempt < 100; attempt++) {
        const run = await repository.run(aliceId, runId);
        if (run?.snapshot.moments.length && run.snapshot.moments.every(moment => moment.status === 'closed' && moment.enrichment === 'ready')) {
          assert.equal(run.kind, 'replay');
          savedReplay = { runId, moments: run.snapshot.moments };
          return;
        }
        await delay(25);
      }
      assert.fail('Completed replay notes were not saved');
    });
    await app.close(); await repository.close();
    repository = createPlatformRepository(settings); app = await createApp();
    await t.test('opening the completed transcript replay after restart makes no model calls', async () => {
      assert.ok(savedReplay);
      const headers = { cookie: alice };
      const calls = modelCalls;
      const session = await app.inject({ url: replay + '/session', headers });
      assert.equal(session.statusCode, 200, session.body);
      assert.equal(session.json().runId, savedReplay.runId);
      assert.equal(session.json().state, 'completed');
      const snapshot = await app.inject({ url: replay + '/moments', headers });
      assert.deepEqual(snapshot.json().moments, savedReplay.moments);
      assert.equal(modelCalls, calls);
    });
    await t.test('sessions, summaries, chat, doubts and visuals survive API/repository restart', async () => {
      assert.equal((await app.inject({ url: '/api/auth/session', headers: { cookie: alice } })).json().user.id, aliceId);
      const snapshot = (await app.inject({ url: study + '/moments', headers: { cookie: alice } })).json();
      assert.equal(snapshot.runId, generationId); assert.equal(snapshot.moments[0].summary, moment.summary);
      assert.equal(snapshot.moments[0].artifacts[0].id, artifactId);
      const history = (await app.inject({ url: study + '/chat/history?runId=' + generationId, headers: { cookie: alice } })).json();
      assert.equal(history.messages.length, 1); assert.equal(history.messages[0].request.question, 'Explain this moment');
      const calls = chatCalls;
      assert.equal((await app.inject({ method: 'POST', url: study + '/chat', headers: { cookie: alice }, payload: chatRequest })).statusCode, 200);
      assert.equal(chatCalls, calls);
      assert.equal((await app.inject({ url: study + '/artifacts/' + artifactId + '?runId=' + generationId, headers: { cookie: alice } })).json().id, artifactId);
      assert.equal((await app.inject({ method: 'POST', url: study + '/artifacts', headers: { cookie: alice }, payload: artifactRequest })).json().id, artifactId);
      assert.equal((await app.inject({ url: '/api/doubts?courseId=cv', headers: { cookie: alice } })).json().doubts.length, 1);
      const live = (await app.inject({ url: '/api/lectures/cs50/0/moments', headers: { cookie: alice } })).json();
      assert.equal(live.runId, liveRunId); assert.equal(live.session.state, 'completed'); assert.ok(live.moments.length > 0);
      assert.deepEqual((await app.inject({method:'POST',url:'/api/lectures/cs50/0/slide-coaching',headers:{cookie:alice},payload:slideRequest})).json(),slideNotes);
      assert.equal((await app.inject({ url: '/api/account/runs', headers: { cookie: bob } })).json().runs.every((run: { userId: string }) => run.userId !== aliceId), true);
      // An interrupted enrichment keeps its last good summary and enables transcript fallback.
      const saved = (await repository.run(aliceId, liveRunId))!;
      saved.snapshot.moments[0]!.enrichment = 'pending'; saved.snapshot.moments[0]!.summary = 'Last good summary';
      await repository.saveRun(saved);
      const runtimes = createUserLectureRuntimes(repository, provider);
      const user = (await repository.user(aliceId))!;
      const runtime = await runtimes.resolve({ params: { courseId: 'cs50', lectureId: '0' }, recallUser: user } as unknown as FastifyRequest);
      const restored = runtime.store.snapshot({ courseId: 'cs50', lectureId: '0' });
      assert.equal(restored.moments[0]!.enrichment, 'failed'); assert.equal(restored.moments[0]!.summary, 'Last good summary');
      await runtimes.close();
    });
    await t.test('passwords and session tokens are hashed; logout revokes access', async () => {
      const client = new MongoClient(settings.uri);
      try {
        const db = client.db(settings.database), user = await db.collection('users').findOne({ email: 'alice@example.edu' });
        assert.ok(user?.salt && user?.passwordHash); assert.ok(!JSON.stringify(user).includes('test-password-123'));
        assert.equal(await db.collection('auth_sessions').countDocuments({ _id: alice.split('=')[1] } as never), 0);
      } finally { await client.close(); }
      assert.equal((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: alice } })).statusCode, 200);
      assert.equal((await app.inject({ url: study + '/moments', headers: { cookie: alice } })).statusCode, 401);
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.edu', role: 'student', password: 'test-password-123' } });
      assert.equal(login.statusCode, 200); assert.equal(login.json().user.id, aliceId);
    });
  } finally { await app.close(); await repository.close(); await mongo.stop(); }
});
