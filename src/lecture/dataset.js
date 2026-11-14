import manifest from '../../datasets/cs690s/manifest.json';

const transcripts = import.meta.glob('../../datasets/cs690s/lectures/*/transcripts/*.txt', {
  query: '?raw', import: 'default',
});

export const datasetLectures = manifest.lectures.map(lecture => {
  const transcript = lecture.transcript.files.find(file => file.endsWith('.txt'));
  return {
    ...lecture,
    id: String(lecture.number),
    replay: Boolean(transcript),
    transcriptPath: transcript,
    readings: [
      ...lecture.required.map(reading => ({ ...reading, kind: 'Required' })),
      ...lecture.optional.map(reading => ({ ...reading, kind: 'Optional' })),
    ],
  };
});

export const courseUrl = manifest.course_url;

export async function loadTranscript(lecture) {
  const load = transcripts['../../datasets/cs690s/' + lecture.transcriptPath];
  if (!load) throw new Error('This lecture has no transcript in the dataset.');
  return load();
}
