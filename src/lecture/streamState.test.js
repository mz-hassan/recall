import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialStreamState, mergeMomentEvent, targetAfterArrival } from './streamState.js';
import { demoMoments } from './fixtures/lecture02.js';
import { recordMomentStream } from './fixtures/stream.js';
import { createStreamController } from './api.js';
import { TimelineEvent } from '../../shared/contracts/lecture.ts';

function event(seq, overrides = {}) {
  return {
    seq, type: 'moment.upsert', runId: 'run-1',
    moment: {
      id: 'ai/2/fixture/1', revision: 1, status: 'open', enrichment: 'pending', time: 0,
      timeSource: 'simulated', chunkSeqs: [1], sources: [],
      title: 'Policy', short: 'Policy', label: '00:00', type: 'TRANSCRIPT',
      quote: 'Learn a policy from an expert.', quoteTime: '01:41', summary: '', intuition: '',
      slides: [], equations: [], artifacts: [], graph: null, ...overrides,
    },
  };
}

test('upserts retain newest revision and consume stale revisions without duplicating a moment', () => {
  let state = mergeMomentEvent(initialStreamState(), event(1));
  state = mergeMomentEvent(state, event(2, { revision: 3, enrichment: 'ready', summary: 'Notes.' }));
  const previous = state;
  assert.equal(mergeMomentEvent(state, event(1)), previous);
  state = mergeMomentEvent(state, event(3, { revision: 2, summary: 'Old notes.' }));
  assert.equal(state.moments.length, 1);
  assert.equal(state.moments[0].summary, 'Notes.');
  assert.equal(state.lastEventId, '3');
});

test('invalid or moving updates retain the last usable state', () => {
  const state = mergeMomentEvent(initialStreamState(), event(1));
  for (const update of [
    event(2, { revision: 2, time: 8 }),
    event(2, { revision: 2, status: 'invalid' }),
    event(2, { revision: 2, slides: [{ page: 1, url: 'javascript:alert(1)' }] }),
    event(2, { revision: 2, artifacts: [{ id: 'x', kind: 'reading', title: 'x', url: 'data:text/html,bad' }] }),
    event(2, { id: 'new', sources: [{ path: 'transcript.txt' }] }),
  ]) assert.throws(() => mergeMomentEvent(state, update));
  assert.equal(state.lastEventId, '1');
  assert.equal(state.moments[0].quote, 'Learn a policy from an expert.');
});

test('streamed text stays plain and cannot opt into trusted authored HTML or SVG', () => {
  const input = event(1, {
    headline: '<img src=x onerror=alert(1)>', artIndex: 3,
    title: '<script>alert(1)</script>', summary: '<b>Raw text</b>',
  });
  const { moments: [moment] } = mergeMomentEvent(initialStreamState(), input);
  assert.equal(moment.headline, undefined);
  assert.equal(moment.artIndex, undefined);
  assert.equal(moment.title, input.moment.title);
  assert.equal(moment.summary, '<b>Raw text</b>');
});

test('pending and failed notes keep readable transcript text', () => {
  let state = mergeMomentEvent(initialStreamState(), event(1));
  assert.equal(state.moments[0].summary || state.moments[0].quote, 'Learn a policy from an expert.');
  state = mergeMomentEvent(state, event(2, { revision: 2, enrichment: 'failed' }));
  assert.equal(state.moments[0].quote, 'Learn a policy from an expert.');
  assert.equal(state.moments[0].enrichment, 'failed');
});

test('arrivals follow the live edge but preserve rewound, expanded and fractional selections', () => {
  assert.equal(targetAfterArrival(2, 3, 4, false), 3);
  assert.equal(targetAfterArrival(0, 3, 4, false), 0);
  assert.equal(targetAfterArrival(2, 3, 4, true), 2);
  assert.equal(targetAfterArrival(.2, 3, 4, false), .2);
  assert.equal(targetAfterArrival(2, 3, 3, false), 2);
});

for (const interval of [1, 8, 60]) {
  test(`recorded fixture replays in order at ${interval}s, resumes from cursor, and cleans up`, () => {
    const source = recordMomentStream(demoMoments.slice(0, 6), interval);
    let state = initialStreamState();
    let arrivals = 0;
    let status;
    const controller = createStreamController(source, update => {
      arrivals += 1;
      assert.equal(TimelineEvent.safeParse(update).success, true, 'fixture must use main shared contracts');
      state = mergeMomentEvent(state, update);
    }, value => { status = value; });
    controller.connect();
    assert.equal(state.moments.length, 1);
    assert.equal(state.moments[0].enrichment, 'pending');
    controller.advanceTo(interval / 2);
    assert.equal(state.moments[0].enrichment, 'ready');
    const firstId = state.moments[0].id;
    const beforeReconnect = arrivals;
    controller.reconnect();
    assert.equal(arrivals, beforeReconnect);
    controller.advanceTo(interval * 2);
    assert.equal(state.moments.length, 3);
    assert.equal(state.moments[0].id, firstId);
    controller.advanceTo(source.duration);
    assert.equal(status, 'complete');
    assert.deepEqual(state.moments.map(moment => moment.id), demoMoments.slice(0, 6).map(moment => moment.id));
    assert.deepEqual(state.moments.map(moment => moment.time), [0, 1, 2, 3, 4, 5].map(n => n * interval));
    assert.ok(state.moments.every(moment => moment.revision === 3 && moment.status === 'closed'));
    assert.equal(state.session.state, 'completed');
    assert.ok(state.moments.every(moment => !/<[^>]+>/.test(moment.summary)));
    controller.close();
    controller.advanceTo(10000);
    assert.equal(arrivals, 20);
  });
}

test('rejected events do not advance the reconnect cursor', () => {
  const cursors = [];
  const source = { connect({ afterSeq, onEvent }) {
    cursors.push(afterSeq);
    return { close() {}, advanceTo() { onEvent(event(1, { status: 'invalid' })); } };
  } };
  const controller = createStreamController(source, update => mergeMomentEvent(initialStreamState(), update), () => {});
  assert.throws(() => controller.connect());
  assert.throws(() => controller.reconnect());
  assert.deepEqual(cursors, [null, null]);
});

test('snapshots restore the timeline, preserve newer revisions, and accept a server restart', () => {
  let state = mergeMomentEvent(initialStreamState(), event(1));
  state = mergeMomentEvent(state, event(2, { revision: 3, enrichment: 'ready', summary: 'Newest notes' }));
  const snapshot = { type: 'timeline.snapshot', seq: 4, runId: 'run-1', moments: [event(1).moment], session: null };
  state = mergeMomentEvent(state, snapshot);
  assert.equal(state.moments[0].summary, 'Newest notes');
  assert.equal(state.lastSeq, 4);
  assert.equal(mergeMomentEvent(state, { ...snapshot, seq: 3 }), state);
  state = mergeMomentEvent(state, { ...snapshot, seq: 0, runId: null, moments: [] });
  assert.deepEqual(state.moments, []);
  assert.equal(state.runId, null);
  assert.equal(state.lastSeq, 0);
  state = mergeMomentEvent(state, { ...event(1), runId: 'run-2' });
  assert.equal(state.runId, 'run-2');
});

test('snapshots reject reordered published moments and duplicate IDs', () => {
  const first = event(1).moment;
  const second = { ...first, id: 'second', time: 8 };
  let state = mergeMomentEvent(initialStreamState(), event(1));
  state = mergeMomentEvent(state, { ...event(2), moment: second });
  for (const moments of [[second, first], [first, first], [first]]) {
    assert.throws(() => mergeMomentEvent(state, { type: 'timeline.snapshot', seq: 3, runId: 'run-1', moments, session: null }));
  }
});

test('session events advance the cursor and retain moments without pretending to be notes', () => {
  let state = mergeMomentEvent(initialStreamState(), event(1));
  const session = { runId: 'run-1', state: 'paused', elapsed: 0, words: 160, interval: 8, published: 1, total: 6 };
  state = mergeMomentEvent(state, { type: 'session.state', seq: 2, runId: 'run-1', session });
  assert.equal(state.lastSeq, 2);
  assert.equal(state.moments.length, 1);
  assert.deepEqual(state.session, session);
  assert.throws(() => mergeMomentEvent(state, { type: 'session.state', seq: 3, runId: 'run-1', session: { ...session, runId: 'wrong' } }));
});
