import type { LectureKey, TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import { findLecture, readDatasetFile } from '../../../data/dataset.ts';
import { chunkTimedWords, chunkTxtWords, type ChunkOptions } from './chunk.ts';
import { parseTxtTranscript, parseVttTranscript } from './parse.ts';

/**
 * A transcript source produces ordered chunks for a lecture. The replay adapter below reads the
 * dataset; a speech-to-text adapter can later produce the same chunks from live audio.
 */
export type TranscriptSource = {
  path: string;
  format: 'vtt' | 'txt';
  chunks: TranscriptChunk[];
};

/** True when the manifest lists a transcript the replay adapter can read. */
export async function hasTranscript({ courseId, lectureId }: LectureKey): Promise<boolean> {
  const lecture = await findLecture(courseId, lectureId);
  return Boolean(lecture?.transcript.files.some(file => file.endsWith('.vtt') || file.endsWith('.txt')));
}

/** Loads a lecture's transcript from the dataset, preferring VTT for its real timestamps. */
export async function loadTranscriptChunks({ courseId, lectureId }: LectureKey, options: ChunkOptions): Promise<TranscriptSource | undefined> {
  const lecture = await findLecture(courseId, lectureId);
  if (!lecture) return undefined;
  const vtt = lecture.transcript.files.find(file => file.endsWith('.vtt'));
  if (vtt) {
    const words = parseVttTranscript(await readDatasetFile(courseId, vtt));
    return { path: vtt, format: 'vtt', chunks: chunkTimedWords(words, vtt, options) };
  }
  const txt = lecture.transcript.files.find(file => file.endsWith('.txt'));
  if (txt) {
    const words = parseTxtTranscript(await readDatasetFile(courseId, txt));
    return { path: txt, format: 'txt', chunks: chunkTxtWords(words, txt, options) };
  }
  return undefined;
}
