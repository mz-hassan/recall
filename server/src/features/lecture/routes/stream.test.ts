import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { TimelineEvent } from '../../../../../shared/contracts/lecture.ts';
import { buildApp } from '../../../app.ts';
import { loadConfig } from '../../../config.ts';
import { createFixtureProvider } from '../../../llm/index.ts';

const base = '/api/lectures/ai/2';

async function withApp(run: (app: FastifyInstance) => Promise<void>) {
  const app = await buildApp({ config: loadConfig({}), provider: createFixtureProvider() });
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

/** Reads SSE events from a live server until `count` events have arrived. */
async function readEvents(url: string, count: number, init: RequestInit = {}): Promise<TimelineEvent[]> {
  const controller = new AbortController();
  const response = await fetch(url, { ...init, signal: controller.signal });
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  const events: TimelineEvent[] = [];
  let buffer = '';
  while (events.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block.split('\n').find(line => line.startsWith('data: '));
      if (data) events.push(TimelineEvent.parse(JSON.parse(data.slice(6))));
    }
  }
  controller.abort();
  return events;
}

test('starting a session returns its state and publishes the first moment', () => withApp(async app => {
  const started = await app.inject({ method: 'POST', url: base + '/session', payload: {} });
  assert.equal(started.statusCode, 201);
  assert.equal(started.json().state, 'paused');
  assert.equal(started.json().published, 1);

  const snapshot = TimelineEvent.parse((await app.inject({ method: 'GET', url: base + '/moments' })).json());
  assert.equal(snapshot.type, 'timeline.snapshot');
  assert.equal(snapshot.type === 'timeline.snapshot' && snapshot.moments.length, 1);
}));

test('play and pause change the session state', () => withApp(async app => {
  await app.inject({ method: 'POST', url: base + '/session', payload: { interval: 60 } });
  assert.equal((await app.inject({ method: 'POST', url: base + '/session/play' })).json().state, 'playing');
  assert.equal((await app.inject({ method: 'POST', url: base + '/session/pause' })).json().state, 'paused');
  assert.equal((await app.inject({ method: 'GET', url: base + '/session' })).json().state, 'paused');
}));

test('bad requests are rejected with clear status codes', () => withApp(async app => {
  assert.equal((await app.inject({ method: 'POST', url: '/api/lectures/ai/0/session', payload: {} })).statusCode, 404, 'no transcript');
  assert.equal((await app.inject({ method: 'POST', url: '/api/lectures/zz/2/session', payload: {} })).statusCode, 404, 'unknown course');
  assert.equal((await app.inject({ method: 'POST', url: base + '/session', payload: { words: 5 } })).statusCode, 400, 'invalid options');
  assert.equal((await app.inject({ method: 'POST', url: '/api/lectures/ai/3/session/play' })).statusCode, 404, 'no session yet');
}));

test('a lecture without a transcript reads as an empty timeline, ready for live capture', () => withApp(async app => {
  const response = await app.inject({ method: 'GET', url: '/api/lectures/ai/0/moments' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().moments, []);
}));

test('the event stream sends a snapshot, then live moments; a reconnect resumes without duplicates', () => withApp(async app => {
  const origin = await app.listen({ port: 0, host: '127.0.0.1' });
  await app.inject({ method: 'POST', url: base + '/session', payload: { interval: 0.05, limit: 3 } });

  const live = readEvents(origin + base + '/events', 6);
  await app.inject({ method: 'POST', url: base + '/session/play' });
  const events = await live;
  assert.equal(events[0]!.type, 'timeline.snapshot');
  const seqs = events.map(event => event.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'events arrive in order');
  assert.ok(events.some(event => event.type === 'moment.upsert'));

  // Reconnect from the third event: only later events come back, never the ones already seen.
  const resumeFrom = events[2]!.seq;
  const resumed = await readEvents(origin + base + '/events?after=' + resumeFrom, 1);
  assert.ok(resumed[0]!.seq > resumeFrom);
  assert.notEqual(resumed[0]!.type, 'timeline.snapshot');

  // Last-Event-ID works the same way, which is what browsers send on automatic reconnect.
  const viaHeader = await readEvents(origin + base + '/events', 1, { headers: { 'last-event-id': String(resumeFrom) } });
  assert.equal(viaHeader[0]!.seq, resumed[0]!.seq);
}));
