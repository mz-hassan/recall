import { createFixtureStream } from '../api.js';

// Only used for our trusted authored fixtures. Runtime stream text is never parsed as HTML.
const plainFixtureText = text => (text ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
const labelTime = time => [Math.floor(time / 60), time % 60].map(n => String(n).padStart(2, '0')).join(':');

export function recordMomentStream(moments, interval) {
  const runId = 'fixture-ai-2';
  const duration = moments.length * interval;
  const session = { runId, state: 'paused', elapsed: 0, words: 160, interval, published: 1, total: moments.length };
  const recording = [{ at: 0, event: { type: 'timeline.snapshot', runId, moments: [], session } }];
  moments.forEach((original, index) => {
    const time = index * interval;
    const moment = {
      id: original.id, revision: 1, status: 'open', enrichment: 'pending', time, timeSource: 'simulated',
      chunkSeqs: [index + 1], sources: [],
      title: original.title, short: original.short, label: labelTime(time), type: 'TRANSCRIPT',
      quote: original.quote, quoteTime: original.quoteTime,
      summary: '', intuition: '', slides: [], equations: [], artifacts: [], graph: null,
    };
    const enriched = {
        ...moment, revision: 2, enrichment: 'ready', type: original.type,
        summary: plainFixtureText(original.summary), intuition: plainFixtureText(original.intuition),
        slides: original.slides, equations: original.equations, artifacts: original.artifacts, graph: original.graph,
    };
    recording.push(
      { at: time, event: { type: 'moment.upsert', runId, moment } },
      { at: time + Math.min(2, interval / 2), event: { type: 'moment.upsert', runId, moment: enriched } },
      { at: time + interval, event: { type: 'moment.upsert', runId, moment: { ...enriched, revision: 3, status: 'closed' } } },
    );
  });
  recording.push({ at: duration, event: { type: 'session.state', runId,
    session: { ...session, state: 'completed', elapsed: duration, published: moments.length } } });
  recording.sort((a, b) => a.at - b.at);
  return createFixtureStream(recording.map((item, index) => ({
    ...item, event: { ...item.event, seq: index + 1 },
  })), duration);
}
