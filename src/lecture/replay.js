export const replayPath = (lectureId, live = false, courseId = 'ai', microphone = false) =>
  'lecture.html?lecture=' + encodeURIComponent(lectureId) + (courseId !== 'ai' ? '&course=' + encodeURIComponent(courseId) : '')
    + (microphone ? '&mode=microphone' : live ? '&mode=live' : '');

export function replayOptions(search) {
  const query = new URLSearchParams(search);
  const bounded = (key, fallback, min, max) => {
    const value = Number(query.get(key));
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  };
  return {
    lectureId: query.get('lecture') ?? '2',
    courseId: query.get('course') ?? 'ai',
    microphone: query.get('mode') === 'microphone',
    prepared: query.get('view') === 'notes',
    live: query.get('mode') === 'live',
    words: bounded('words', 160, 30, 1000),
    interval: bounded('interval', 8, 1, 60),
    limit: query.get('limit') === 'all' ? Infinity : bounded('limit', 6, 1, 100),
  };
}

export function makeTranscriptMoments(transcript, lectureId, { words, interval, courseId = 'ai' }) {
  const tokens = transcript.match(/\S+/g) ?? [];
  const moments = [];
  for (let offset = 0; offset < tokens.length; offset += words) {
    const index = moments.length;
    const time = index * interval;
    const quote = tokens.slice(offset, offset + words).join(' ');
    const title = 'Transcript chunk ' + (index + 1);
    moments.push({
      id: courseId + '/' + lectureId + '/chunk/' + (index + 1), time, title, short: title,
      label: [Math.floor(time / 60), time % 60].map(n => String(n).padStart(2, '0')).join(':'),
      type: 'TRANSCRIPT', summary: '', quote, quoteTime: 'Simulation time',
      slides: [], equations: [], artifacts: [], intuition: '', graph: null,
    });
  }
  return moments;
}
