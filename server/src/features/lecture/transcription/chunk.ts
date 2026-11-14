import type { TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import type { TimedWord, TxtWord } from './parse.ts';

export type ChunkOptions = { words: number; interval: number };

/**
 * TXT transcripts have no reliable timing, so chunk times are simulated: chunk n starts at
 * n × interval seconds. Spans point at the exact characters in the source file.
 */
export function chunkTxtWords(words: TxtWord[], path: string, { words: size, interval }: ChunkOptions): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  for (let offset = 0; offset < words.length; offset += size) {
    const group = words.slice(offset, offset + size);
    const index = chunks.length;
    chunks.push({
      seq: index + 1,
      text: group.map(word => word.text).join(' '),
      time: index * interval,
      endTime: (index + 1) * interval,
      timeSource: 'simulated',
      span: { path, startChar: group[0]!.start, endChar: group.at(-1)!.end },
    });
  }
  return chunks;
}

/** VTT transcripts carry real lecture time, so chunks keep it. */
export function chunkTimedWords(words: TimedWord[], path: string, { words: size }: ChunkOptions): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  for (let offset = 0; offset < words.length; offset += size) {
    const group = words.slice(offset, offset + size);
    const time = group[0]!.time;
    const endTime = group.at(-1)!.endTime;
    chunks.push({
      seq: chunks.length + 1,
      text: group.map(word => word.text).join(' '),
      time,
      endTime,
      timeSource: 'transcript',
      span: { path, startTime: time, endTime },
    });
  }
  return chunks;
}
