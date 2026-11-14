import type { LectureKey, TranscriptChunk } from '../../../../../shared/contracts/lecture.ts';
import { ProviderError, type Evidence, type ModelProvider } from '../../../llm/index.ts';
import type { MomentDraft } from '../store/types.ts';
import { formatLectureTime } from './passthrough.ts';
import { SEGMENTATION_INSTRUCTIONS, SEGMENTATION_PROMPT_VERSION } from './prompts/v2.ts';
import { SEGMENTATION_TASK, SegmentationDecision } from './schema.ts';
import { countWords, lastWords, splitSentences, type Sentence } from './sentences.ts';
import type { Segmenter, SegmenterContext } from './types.ts';

/** One model call's metadata, for logs and evaluations. Never contains transcript text. */
export type SegmentationCall = {
  task: string;
  promptVersion: string;
  chunkSeq: number;
  outcome: 'ok' | 'skipped' | 'fallback';
  provider?: string;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  newTopics?: number;
  error?: string;
};

export type ModelSegmenterOptions = {
  provider: ModelProvider;
  /** Chunks with fewer new words than this extend the open topic without a model call. */
  minWords?: number;
  /** How many recent words of the open topic to send as context. */
  contextWords?: number;
  /** A title may still be refined while its topic is shorter than this many words. */
  refineTitleBelowWords?: number;
  maxNewTopicsPerChunk?: number;
  onCall?: (call: SegmentationCall) => void;
};

/** `continues` = these sentences belong to the topic that was open before this chunk. */
type Segment = { sentences: Sentence[]; firstWord: number; title: string; label: string; continues: boolean };

const FALLBACK_TITLE = 'Lecture in progress';

/**
 * Model-backed segmentation. For each chunk it asks: does this continue the open topic, or does a
 * new topic start (and where)? Moments only grow or close; a failed or invalid answer keeps the raw
 * transcript by extending the open topic, so the timeline never breaks.
 */
export function createModelSegmenter({
  provider, minWords = 50, contextWords = 200, refineTitleBelowWords = 300, maxNewTopicsPerChunk = 3, onCall = () => {},
}: ModelSegmenterOptions): Segmenter {
  let open: MomentDraft | null = null;
  let count = 0;
  // Topics opened by a fallback get a placeholder title the model may replace at any length.
  const provisional = new Set<string>();

  function newMoment(key: LectureKey, chunk: TranscriptChunk, segment: Segment, totalWords: number): MomentDraft {
    count += 1;
    const span = Math.max(0, chunk.endTime - chunk.time);
    const time = chunk.time + (totalWords ? span * segment.firstWord / totalWords : 0);
    const label = formatLectureTime(time);
    return {
      id: `${key.courseId}/${key.lectureId}/moment/${count}`,
      time, label, title: segment.title, short: segment.label, type: 'TOPIC',
      summary: '', quote: segment.sentences.map(sentence => sentence.text).join(' '),
      quoteTime: chunk.timeSource === 'transcript' ? label + ' in the recording' : 'Simulation time',
      intuition: '', slides: [], equations: [], artifacts: [], graph: null,
      status: 'open', enrichment: 'none', timeSource: chunk.timeSource,
      chunkSeqs: [chunk.seq], sources: [chunk.span],
    };
  }

  function extend(moment: MomentDraft, chunk: TranscriptChunk, text: string, title?: string, label?: string): MomentDraft {
    const refine = title !== undefined && (provisional.has(moment.id) || countWords(moment.quote) < refineTitleBelowWords);
    if (refine && title !== FALLBACK_TITLE) provisional.delete(moment.id);
    return {
      ...moment,
      quote: moment.quote ? moment.quote + ' ' + text : text,
      ...(refine && { title, short: label ?? moment.short }),
      chunkSeqs: moment.chunkSeqs.at(-1) === chunk.seq ? moment.chunkSeqs : [...moment.chunkSeqs, chunk.seq],
      sources: moment.chunkSeqs.at(-1) === chunk.seq ? moment.sources : [...moment.sources, chunk.span],
    };
  }

  /** Turns the model's decision into ordered segments over this chunk's sentences. */
  function toSegments(decision: SegmentationDecision, sentences: Sentence[], openTopic: MomentDraft | null): Segment[] {
    const hasOpen = openTopic !== null;
    const starts = decision.new_topics
      .filter(topic => topic.starts_at_sentence <= sentences.length)
      .sort((a, b) => a.starts_at_sentence - b.starts_at_sentence)
      .filter((topic, index, all) => index === 0 || topic.starts_at_sentence !== all[index - 1]!.starts_at_sentence)
      .slice(0, maxNewTopicsPerChunk);
    const boundaries = [
      { start: 1, title: decision.current_topic_title, label: decision.current_topic_label, continues: hasOpen },
      ...starts.map(topic => ({ start: topic.starts_at_sentence, title: topic.title, label: topic.label, continues: false })),
    ];
    // A "new" topic named like the one before it is the same topic: merge it instead of splitting.
    const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const same = (a: { title: string; label: string }, b: { title: string; label: string }) =>
      normalize(a.title) === normalize(b.title) || normalize(a.label) === normalize(b.label);
    for (let index = boundaries.length - 1; index >= 1; index -= 1) {
      const previous = index === 1 && openTopic ? [boundaries[0]!, { title: openTopic.title, label: openTopic.short }] : [boundaries[index - 1]!];
      if (previous.some(item => same(boundaries[index]!, item))) boundaries.splice(index, 1);
    }
    // A new topic at sentence 1 means nothing continues the current one. Without an open topic,
    // the first segment is the lecture's first topic either way.
    if (boundaries[1]?.start === 1) boundaries.shift();
    if (!hasOpen && boundaries[0]!.start !== 1) boundaries[0]!.start = 1;

    const wordOffsets = sentences.reduce<number[]>((offsets, sentence, index) => [...offsets, (offsets[index] ?? 0) + sentence.words], [0]);
    return boundaries.map((boundary, index) => {
      const end = (boundaries[index + 1]?.start ?? sentences.length + 1) - 1;
      return {
        sentences: sentences.slice(boundary.start - 1, end),
        firstWord: wordOffsets[boundary.start - 1]!,
        title: boundary.title,
        label: boundary.label,
        continues: boundary.continues,
      };
    }).filter(segment => segment.sentences.length > 0);
  }

  function evidenceFor(context: SegmenterContext, sentences: Sentence[]): Evidence[] {
    const evidence: Evidence[] = [];
    const summary = context.store.getRunningSummary(context.key);
    if (summary) evidence.push({ id: 'lecture-so-far', kind: 'text', text: summary });
    if (open) {
      evidence.push({
        id: 'open-topic', kind: 'text',
        text: `Title: ${open.title}\nLabel: ${open.short}\nLength so far: ${countWords(open.quote)} words\nMost recent words: ${lastWords(open.quote, contextWords)}`,
      });
    }
    evidence.push({ id: 'new-text', kind: 'text', text: sentences.map((sentence, index) => `[${index + 1}] ${sentence.text}`).join('\n') });
    return evidence;
  }

  return {
    async onChunk(chunk, context) {
      const { key, store, signal } = context;
      const sentences = splitSentences(chunk.text);
      if (!sentences.length) return;
      const totalWords = sentences.reduce((sum, sentence) => sum + sentence.words, 0);

      if (open && totalWords < minWords) {
        open = extend(open, chunk, chunk.text);
        store.saveMoment(key, open);
        onCall({ task: SEGMENTATION_TASK, promptVersion: SEGMENTATION_PROMPT_VERSION, chunkSeq: chunk.seq, outcome: 'skipped' });
        return;
      }

      let decision: SegmentationDecision;
      try {
        const result = await provider.generateStructured({
          task: SEGMENTATION_TASK,
          instructions: SEGMENTATION_INSTRUCTIONS,
          evidence: evidenceFor(context, sentences),
          schema: SegmentationDecision,
          signal,
          options: { reasoning: 'off', temperature: 0.2, maxOutputTokens: 400 },
        });
        decision = result.data;
        onCall({
          task: SEGMENTATION_TASK, promptVersion: SEGMENTATION_PROMPT_VERSION, chunkSeq: chunk.seq, outcome: 'ok',
          provider: result.provider, model: result.model, latencyMs: Math.round(result.latencyMs),
          inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, newTopics: result.data.new_topics.length,
        });
      } catch (error) {
        if (signal.aborted) return;
        onCall({
          task: SEGMENTATION_TASK, promptVersion: SEGMENTATION_PROMPT_VERSION, chunkSeq: chunk.seq, outcome: 'fallback',
          error: error instanceof ProviderError ? `${error.code}: ${error.message}` : String(error),
        });
        // Keep the words visible: extend the open topic, or start a plainly titled one.
        decision = { current_topic_title: open?.title ?? FALLBACK_TITLE, current_topic_label: open?.short ?? 'In progress', new_topics: [] };
      }
      if (signal.aborted) return;

      const segments = toSegments(decision, sentences, open);
      for (const segment of segments) {
        const text = segment.sentences.map(sentence => sentence.text).join(' ');
        if (segment.continues && open) {
          open = extend(open, chunk, text, segment.title, segment.label);
          store.saveMoment(key, open);
          continue;
        }
        if (open) store.saveMoment(key, { ...open, status: 'closed' });
        open = newMoment(key, chunk, segment, totalWords);
        if (open.title === FALLBACK_TITLE) provisional.add(open.id);
        store.saveMoment(key, open);
      }
    },
    finish({ key, store }) {
      if (open) store.saveMoment(key, { ...open, status: 'closed' });
      open = null;
    },
  };
}
