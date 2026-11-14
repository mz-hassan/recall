export const replayPath = (lectureId, live = false) =>
  'lecture.html?lecture=' + encodeURIComponent(lectureId) + (live ? '&mode=live' : '');

export function replayOptions(search) {
  const query = new URLSearchParams(search);
  const bounded = (key, fallback, min, max) => {
    const value = Number(query.get(key));
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  };
  return {
    lectureId: query.get('lecture') ?? '2',
    live: query.get('mode') === 'live',
    words: bounded('words', 160, 30, 1000),
    interval: bounded('interval', 8, 1, 60),
    limit: query.get('limit') === 'all' ? Infinity : bounded('limit', 6, 1, 100),
  };
}

export function makeTranscriptMoments(transcript, lectureId, { words, interval }) {
  const tokens = transcript.match(/\S+/g) ?? [];
  const moments = [];
  for (let offset = 0; offset < tokens.length; offset += words) {
    const index = moments.length;
    const time = index * interval;
    const quote = tokens.slice(offset, offset + words).join(' ');
    const title = 'Transcript chunk ' + (index + 1);
    moments.push({
      id: 'ai/' + lectureId + '/chunk/' + (index + 1), time, title, short: title,
      label: [Math.floor(time / 60), time % 60].map(n => String(n).padStart(2, '0')).join(':'),
      type: 'TRANSCRIPT', summary: '', quote, quoteTime: 'Simulation time',
      slides: [], equations: [], artifacts: [], intuition: '', graph: null,
    });
  }
  return moments;
}
