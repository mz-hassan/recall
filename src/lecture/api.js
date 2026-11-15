import { SessionState, TimelineSnapshotEvent } from '../../shared/contracts/lecture.ts';
import { ArtifactRequest, GeneratedArtifact, ChatAnswer, ChatRequest } from '../../shared/contracts/lectureInteractions.ts';

export function createLectureClient(courseId, lectureId, fetchImpl = fetch, prefix = '/api') {
  const base = prefix + '/lectures/' + encodeURIComponent(courseId) + '/' + encodeURIComponent(lectureId);
  async function request(path, { method = 'GET', body, signal, allowMissing = false } = {}) {
    const response = await fetchImpl(base + path, {
      method, ...(body !== undefined && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    });
    if (allowMissing && response.status === 404) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'The lecture API is unavailable. Please retry.');
    return data;
  }
  return {
    base,
    async session(signal) { const data = await request('/session', { signal, allowMissing: true }); return data && SessionState.parse(data); },
    async snapshot(signal) { return TimelineSnapshotEvent.parse(await request('/moments', { signal })); },
    async start(options, signal) { return SessionState.parse(await request('/session', { method: 'POST', body: options, signal })); },
    async play(signal) { return SessionState.parse(await request('/session/play', { method: 'POST', signal })); },
    async pause(signal) { return SessionState.parse(await request('/session/pause', { method: 'POST', signal })); },
    async chat(input, signal) { return ChatAnswer.parse(await request('/chat', { method: 'POST', body: ChatRequest.parse(input), signal })); },
    async chatHistory(runId,signal){return request('/chat/history?runId='+encodeURIComponent(runId),{signal});},
    async info(signal){return request('/info',{signal});},
    async createArtifact(input, signal) { return GeneratedArtifact.parse(await request('/artifacts', { method: 'POST', body: ArtifactRequest.parse(input), signal })); },
    async artifact(id, runId, signal) { return GeneratedArtifact.parse(await request('/artifacts/' + encodeURIComponent(id) + '?runId=' + encodeURIComponent(runId), { signal })); },
  };
}

export async function openLectureSession(client, options, { restart = false, signal } = {}) {
  if (restart || !await client.session(signal)) {
    await client.start({ words: options.words, interval: options.interval,
      ...(Number.isFinite(options.limit) && { limit: options.limit }), start: 'paused' }, signal);
  }
  return client.snapshot(signal);
}

export function createServerStream(client, snapshot, {
  EventSource: EventSourceImpl = globalThis.EventSource,
  setTimeout: schedule = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout,
} = {}) {
  return {
    kind: 'server', client, initialEvents: [snapshot],
    connect({ afterSeq = null, onEvent, onStatus }) {
      let cursor = afterSeq;
      let runId = snapshot.runId;
      let socket;
      let retry;
      let closed = false;
      function open() {
        if (closed) return;
        socket = new EventSourceImpl(client.base + '/events' + (cursor === null ? '' : '?after=' + cursor));
        socket.onopen = () => onStatus('connected');
        for (const type of ['timeline.snapshot', 'moment.upsert', 'session.state']) {
          socket.addEventListener(type, message => {
            if (closed) return;
            try {
              const event = JSON.parse(message.data);
              onEvent(event);
              if ((event.type === 'timeline.snapshot' && event.runId !== runId) || cursor === null || event.seq > cursor) {
                cursor = event.seq;
                runId = event.runId;
              }
              onStatus('connected');
            } catch {
              socket.close();
              onStatus('error', 'Could not read a lecture update. Your existing timeline is preserved; retry the stream.');
            }
          });
        }
        socket.onerror = () => {
          socket.close();
          if (closed) return;
          onStatus('reconnecting');
          retry = schedule(open, 2000);
        };
      }
      open();
      return {
        advanceTo() {}, // Server session events own the clock.
        close() { closed = true; cancel(retry); socket?.close(); },
      };
    },
  };
}

// Recorded transport remains available for H1 without requiring an API.
export function createFixtureStream(recording, duration) {
  return {
    kind: 'fixture',
    duration,
    initialEvents: recording.filter(item => item.at === 0).map(item => item.event),
    connect({ afterSeq = null, onEvent, onStatus }) {
      const cursor = afterSeq === null ? -1 : recording.findIndex(item => item.event.seq === afterSeq);
      if (afterSeq !== null && cursor < 0) throw new Error('Unknown fixture stream cursor.');
      let next = cursor + 1;
      let closed = false;
      onStatus('connected');
      return {
        advanceTo(elapsed) {
          if (closed) return;
          while (next < recording.length && recording[next].at <= elapsed) {
            onEvent(recording[next].event);
            next += 1;
          }
          if (elapsed >= duration && next === recording.length) onStatus('complete');
        },
        close() { closed = true; },
      };
    },
  };
}

// Retains the last accepted cursor across connections. The React hook owns clocks
// and lifecycle; this small controller is also exercised by deterministic replay tests.
export function createStreamController(source, receive, status) {
  let connection;
  let lastSeq = null;
  let runId = null;
  let elapsed = 0;
  function connect() {
    connection?.close();
    connection = source.connect({
      afterSeq: lastSeq,
      onEvent(event) {
        receive(event);
        if ((event.type === 'timeline.snapshot' && event.runId !== runId) || lastSeq === null || event.seq > lastSeq) {
          lastSeq = event.seq;
          runId = event.runId;
        }
      },
      onStatus: status,
    });
    connection.advanceTo(elapsed);
  }
  return {
    connect,
    advanceTo(time) { elapsed = time; connection?.advanceTo(time); },
    reconnect() { status('reconnecting'); connect(); },
    close() { connection?.close(); },
  };
}
