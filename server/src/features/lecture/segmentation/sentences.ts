export type Sentence = { text: string; words: number };

const MAX_SENTENCE_WORDS = 60;
const PIECE_WORDS = 40;

const countWords = (text: string) => text.match(/\S+/g)?.length ?? 0;

/**
 * Splits transcript text into sentences the model can point at by number. Speech often runs on
 * without punctuation, so very long "sentences" are cut into 40-word pieces to keep boundaries precise.
 */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  for (const raw of text.split(/(?<=[.!?])\s+(?=\S)/)) {
    const words = raw.match(/\S+/g) ?? [];
    if (!words.length) continue;
    if (words.length <= MAX_SENTENCE_WORDS) {
      sentences.push({ text: words.join(' '), words: words.length });
      continue;
    }
    for (let offset = 0; offset < words.length; offset += PIECE_WORDS) {
      const piece = words.slice(offset, offset + PIECE_WORDS);
      sentences.push({ text: piece.join(' '), words: piece.length });
    }
  }
  return sentences;
}

/** The last `count` words of a text, for giving the model recent context cheaply. */
export function lastWords(text: string, count: number): string {
  const words = text.match(/\S+/g) ?? [];
  return words.slice(-count).join(' ');
}

export { countWords };
