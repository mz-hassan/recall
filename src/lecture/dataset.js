import manifest from '../../datasets/cs690s/manifest.json';
import cs50 from '../../datasets/cs50/manifest.json';

const transcripts = import.meta.glob('../../datasets/cs690s/lectures/*/transcripts/*.txt', {
  query: '?raw', import: 'default',
});

function lecturesFor(manifest, courseId, folder) { return manifest.lectures.map(lecture => {
  const transcript = lecture.transcript.files.find(file => file.endsWith('.txt'));
  return {
    ...lecture,
    courseId, datasetFolder: folder,
    courseName: manifest.title, courseCode: manifest.course,
    teacher: courseId === 'cs50' ? 'David J. Malan' : 'Prof. Scott Niekum',
    microphone: courseId === 'cs50',
    id: String(lecture.number),
    replay: Boolean(transcript),
    transcriptPath: transcript,
    readings: [
      ...lecture.required.map(reading => ({ ...reading, kind: 'Required' })),
      ...lecture.optional.map(reading => ({ ...reading, kind: 'Optional' })),
    ],
  };
}); }
export const datasetLectures = lecturesFor(manifest, 'ai', 'cs690s');
export const cs50Lectures = lecturesFor(cs50, 'cs50', 'cs50');
export const getCourseLectures = courseId => courseId === 'cs50' ? cs50Lectures : courseId === 'ai' ? datasetLectures : [];

export const courseUrl = manifest.course_url;

export async function loadTranscript(lecture) {
  if (lecture.courseId === 'cs50') return (await import('../../datasets/cs50/lecture0/transcript.txt?raw')).default;
  const load = transcripts['../../datasets/cs690s/' + lecture.transcriptPath];
  if (!load) throw new Error('This lecture has no transcript in the dataset.');
  return load();
}
