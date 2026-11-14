import { TimelineEvent } from '../../shared/contracts/lecture.ts';

export const initialStreamState = () => ({
  moments: [], lastEventId: null, lastSeq: 0, runId: null, session: null,
});

export function validateMomentEvent(input) {
  // Shared schema parsing drops unknown fields such as headline and artIndex,
  // keeping streamed data out of the trusted, authored HTML/SVG rendering path.
  const event = TimelineEvent.parse(input);
  const moments = event.type === 'moment.upsert' ? [event.moment]
    : event.type === 'timeline.snapshot' ? event.moments : [];
  for (const moment of moments) {
    if (!moment.slides.every(slide => isSafeAsset(slide.url)) ||
        !moment.artifacts.every(item => isSafeAsset(item.url))) {
      throw new Error('Invalid lecture attachment URL.');
    }
    if (moment.graph && !moment.graph.edges.every(edge =>
      moment.graph.nodes.some(node => node.id === edge.from) && moment.graph.nodes.some(node => node.id === edge.to))) {
      throw new Error('Invalid topic diagram.');
    }
  }
  if ((event.type === 'session.state' && event.session.runId !== event.runId) ||
      (event.type === 'timeline.snapshot' && event.session && event.session.runId !== event.runId)) {
    throw new Error('Session and event runs must match.');
  }
  return event;
}

function isSafeAsset(url) {
  try { return ['http:', 'https:'].includes(new URL(url, 'http://lecture.local/').protocol); }
  catch { return false; }
}

export function mergeMomentEvent(state, input) {
  const event = validateMomentEvent(input);
  const cursor = { lastEventId: String(event.seq), lastSeq: event.seq };
  if (event.type === 'timeline.snapshot') {
    const sameRun = state.runId === event.runId;
    if (sameRun && state.lastEventId !== null && event.seq <= state.lastSeq) return state;
    if (new Set(event.moments.map(moment => moment.id)).size !== event.moments.length ||
        event.moments.some((moment, index) => index > 0 && moment.time < event.moments[index - 1].time)) {
      throw new Error('Invalid snapshot moment order.');
    }
    if (sameRun && state.moments.some((moment, index) =>
      event.moments[index]?.id !== moment.id || event.moments[index].time !== moment.time)) {
      throw new Error('A published moment cannot move in the timeline.');
    }
    const moments = event.moments.map((moment, index) =>
      sameRun && state.moments[index]?.revision > moment.revision ? state.moments[index] : moment);
    return { moments, ...cursor, runId: event.runId, session: event.session };
  }
  if (event.seq <= state.lastSeq) return state;
  if (state.runId !== null && event.runId !== state.runId) throw new Error('A new lecture run requires a snapshot.');
  if (event.type === 'session.state') return { ...state, ...cursor, runId: event.runId, session: event.session };
  const incoming = event.moment;
  const previous = state.moments.find(moment => moment.id === incoming.id);
  if (previous && incoming.revision <= previous.revision) return { ...state, ...cursor };
  if ((previous && previous.time !== incoming.time) ||
      (!previous && state.moments.some(moment => moment.time > incoming.time))) {
    throw new Error('A published moment cannot move in the timeline.');
  }
  const moments = previous
    ? state.moments.map(moment => moment.id === incoming.id ? incoming : moment)
    : [...state.moments, incoming];
  return { ...state, moments, ...cursor, runId: event.runId };
}

export function targetAfterArrival(target, previousCount, nextCount, expanded) {
  if (!expanded && nextCount > previousCount && Math.round(target) === previousCount - 1) return nextCount - 1;
  return target;
}
