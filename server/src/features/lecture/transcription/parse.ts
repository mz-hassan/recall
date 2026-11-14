// Turns transcript files into words that keep track of where they came from.

/** A word from a TXT transcript, with its character offsets in the original file. */
export type TxtWord = { text: string; start: number; end: number };

/** A word from a VTT transcript, with an estimated time inside its cue (seconds). */
export type TimedWord = { text: string; time: number; endTime: number };

// Lines that label the transcript rather than being spoken words.
const SPEAKER_LABEL = /^SPEAKER \d+$/i;
const TIMESTAMP = /^\d{1,2}:\d{2}(:\d{2})?$/;
// A bare name on its own line, e.g. "Scott Niekum": 2–4 capitalised words, no punctuation.
const NAME_LINE = /^\p{Lu}[\p{L}'-]*( \p{Lu}[\p{L}'-]*){1,3}$/u;

export function isLabelLine(line: string): boolean {
  const trimmed = line.trim();
  return SPEAKER_LABEL.test(trimmed) || TIMESTAMP.test(trimmed) || NAME_LINE.test(trimmed);
}

/** Splits a TXT transcript into spoken words, skipping speaker-name and timestamp lines. */
export function parseTxtTranscript(source: string): TxtWord[] {
  const words: TxtWord[] = [];
  const lines = /[^\n]*\n?/g;
  for (const match of source.matchAll(lines)) {
    const line = match[0];
    if (!line) break;
    if (isLabelLine(line)) continue;
    const offset = match.index;
    for (const word of line.matchAll(/\S+/g)) {
      words.push({ text: word[0], start: offset + word.index, end: offset + word.index + word[0].length });
    }
  }
  return words;
}

function parseCueTime(value: string): number {
  const parts = value.trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) throw new Error(`Bad VTT timestamp: ${value}`);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * Splits a WebVTT transcript into words. Each cue's duration is shared evenly between its words,
 * which is close enough to place chunk boundaries. NOTE blocks and voice tags are dropped.
 */
export function parseVttTranscript(source: string): TimedWord[] {
  const words: TimedWord[] = [];
  for (const block of source.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex(line => line.includes('-->'));
    if (timingIndex === -1) continue;
    const [startText, endText] = lines[timingIndex]!.split('-->');
    const start = parseCueTime(startText!);
    const end = parseCueTime(endText!.trim().split(/\s+/)[0]!);
    const text = lines.slice(timingIndex + 1).join(' ').replace(/<[^>]*>/g, ' ');
    const tokens = text.match(/\S+/g) ?? [];
    const step = tokens.length ? Math.max(0, end - start) / tokens.length : 0;
    tokens.forEach((token, index) => {
      words.push({ text: token, time: start + step * index, endTime: start + step * (index + 1) });
    });
  }
  return words;
}
