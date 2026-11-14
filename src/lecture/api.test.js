import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLectureClient, createServerStream, createStreamController, openLectureSession } from './api.js';
import { initialStreamState, mergeMomentEvent } from './streamState.js';
import { recordMomentStream } from './fixtures/stream.js';
import { demoMoments } from './fixtures/lecture02.js';

const initial = recordMomentStream(demoMoments.slice(0, 2), 8).initialEvents;
const snapshot = { ...initial[0], moments: [initial[1].moment] };
const options = { words: 160, interval: 8, limit: 6 };

test('opening a lecture resumes an existing run without posting a new session', async () => {
  let starts = 0;
  const client = { session: async () => snapshot.session, start: async () => { starts++; }, snapshot: async () => snapshot };
  assert.equal(await openLectureSession(client, options), snapshot);
  assert.equal(starts, 0);
  await openLectureSession(client, options, { restart: true });
  assert.equal(starts, 1);
});

test('first visit starts paused and a full transcript omits the limit from JSON', async () => {
  let posted;
  const client = { session: async () => null, start: async input => { posted = input; }, snapshot: async () => snapshot };
  await openLectureSession(client, { ...options, limit: Infinity });
  assert.deepEqual(posted, { words: 160, interval: 8, start: 'paused' });
});

test('API commands target the existing routes and preserve useful server failures', async () => {
  const calls = [];
  const client = createLectureClient('ai', '2', async (url, init) => {
    calls.push([url, init.method]);
    return Response.json(snapshot.session);
  });
  await client.play(); await client.pause();
  assert.deepEqual(calls, [['/api/lectures/ai/2/session/play', 'POST'], ['/api/lectures/ai/2/session/pause', 'POST']]);
  const failed = createLectureClient('ai', '2', async () => Response.json({ error: 'Lecture restarted.' }, { status: 409 }));
  await assert.rejects(failed.play(), /Lecture restarted/);
});

test('server transport resumes from validated seq, ignores duplicates, and cancels reconnect on close', () => {
  const sockets = [];
  let retry;
  let cancelled = false;
  class FakeSource {
    handlers = new Map();
    constructor(url) { this.url = url; sockets.push(this); }
    addEventListener(type, handler) { this.handlers.set(type, handler); }
    close() { this.closed = true; }
    emit(event) { this.handlers.get(event.type)({ data: JSON.stringify(event) }); }
  }
  const source = createServerStream({ base: '/api/lectures/ai/2' }, snapshot, {
    EventSource: FakeSource, setTimeout: callback => { retry = callback; return 1; }, clearTimeout: () => { cancelled = true; },
  });
  let state = initialStreamState();
  let status;
  const controller = createStreamController(source, event => { state = mergeMomentEvent(state, event); }, value => { status = value; });
  controller.connect();
  sockets[0].emit(snapshot);
  sockets[0].emit(initial[1]);
  assert.equal(state.moments.length, 1);
  assert.equal(state.lastSeq, 2);
  sockets[0].onerror();
  assert.equal(status, 'reconnecting');
  retry();
  assert.match(sockets[1].url, /events\?after=2$/);
  controller.close();
  assert.equal(cancelled, true);
  retry();
  assert.equal(sockets.length, 2);
});

test('malformed stream data keeps existing moments and retry uses the last validated cursor', () => {
  const sockets = [];
  class FakeSource {
    handlers = new Map();
    constructor(url) { this.url = url; sockets.push(this); }
    addEventListener(type, handler) { this.handlers.set(type, handler); }
    close() {}
  }
  const source = createServerStream({ base: '/api/lectures/ai/2' }, snapshot, { EventSource: FakeSource });
  let state = initialStreamState();
  let status;
  const controller = createStreamController(source, event => { state = mergeMomentEvent(state, event); }, value => { status = value; });
  controller.connect();
  sockets[0].handlers.get('timeline.snapshot')({ data: JSON.stringify(snapshot) });
  sockets[0].handlers.get('moment.upsert')({ data: '{broken' });
  assert.equal(status, 'error');
  assert.equal(state.moments.length, 1);
  controller.reconnect();
  assert.match(sockets[1].url, /after=1$/);
  controller.close();
});
