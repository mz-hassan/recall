import type { LectureKey, Moment } from '../../../../../shared/contracts/lecture.ts';
import { ProviderError, type Evidence, type ModelProvider } from '../../../llm/index.ts';
import type { LectureStore, MomentDraft } from '../store/types.ts';
import { ENRICHMENT_INSTRUCTIONS, ENRICHMENT_PROMPT_VERSION } from './prompts/v2.ts';
import { ENRICHMENT_TASK, EnrichmentResult } from './schema.ts';
import { findCandidateSlides, loadSlideDeck, type SlideDeck } from './slides.ts';

export type EnricherContext = { key: LectureKey; store: LectureStore; signal: AbortSignal };

/** Fills in finished topics with notes. Runs beside segmentation, one topic at a time, in order. */
export interface Enricher {
  start(context: EnricherContext): void;
  stop(): void;
  /** Resolves once every topic closed so far has been enriched (or has failed). */
  idle(): Promise<void>;
}

/** One model call's metadata, for logs and evaluations. Never contains transcript text. */
export type EnrichmentCall = {
  task: string;
  promptVersion: string;
  momentId: string;
  outcome: 'ok' | 'failed';
  provider?: string;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  candidateSlides?: number[];
  chosenSlides?: number[];
  lowConfidenceSlides?: number[];
  error?: string;
};

export type ModelEnricherOptions = {
  provider: ModelProvider;
  loadDeck?: (key: LectureKey) => Promise<SlideDeck>;
  /** Long topics are trimmed to this many words (start and end kept) before sending. */
  maxTopicWords?: number;
  maxCandidateSlides?: number;
  onCall?: (call: EnrichmentCall) => void;
};

const EMPTY_DECK: SlideDeck = { pdfPath: null, pages: [], slide: page => ({ page, url: '', kind: 'pdf' }) };
const withoutRevision = ({ revision: _revision, ...draft }: Moment): MomentDraft => draft;

/** One short line per page ("8: The DAgger Algorithm DAgger: Dataset Aggregation …"), cheap enough to send whole. */
function slideIndex(pages: SlideDeck['pages'], wordsPerPage = 12): string {
  return pages.map(page => {
    const words = page.text.split(/\s+/);
    return `${page.page}: ${words.slice(0, wordsPerPage).join(' ')}${words.length > wordsPerPage ? ' …' : ''}`;
  }).join('\n');
}

function trimWords(text: string, max: number): string {
  const words = text.match(/\S+/g) ?? [];
  if (words.length <= max) return words.join(' ');
  const head = Math.round(max * 0.6);
  return [...words.slice(0, head), '[…]', ...words.slice(words.length - (max - head))].join(' ');
}

/**
 * Model-backed enrichment. When a topic closes it asks for a summary, intuition, equations, matching
 * slides and a small diagram, plus an updated "lecture so far" that segmentation and chat reuse.
 * The model sees a one-line index of every slide page, the previous topic's slides, and the full text
 * of the likeliest pages; it may choose any real page and marks each choice high or low confidence.
 * A failed call marks the moment 'failed' and keeps its raw transcript.
 */
export function createModelEnricher({
  provider, loadDeck = loadSlideDeck, maxTopicWords = 2500, maxCandidateSlides = 4, onCall = () => {},
}: ModelEnricherOptions): Enricher {
  let queue: Promise<void> = Promise.resolve();
  let unsubscribe: (() => void) | null = null;

  return {
    start({ key, store, signal }) {
      const seen = new Set<string>();
      const deck = loadDeck(key).catch(() => EMPTY_DECK);

      async function enrich(momentId: string) {
        if (signal.aborted) return;
        const moment = store.updateMoment(key, momentId, current => ({ ...withoutRevision(current), enrichment: 'pending' }));
        if (!moment) return;
        const slides = await deck;
        const earlierMoments = store.getMoments(key).filter(item => item.time < moment.time && item.id !== moment.id);
        const earlier = earlierMoments.map(item => item.title);
        const previousSlides = earlierMoments.findLast(item => item.slides.length)?.slides.map(slide => slide.page) ?? [];
        const summary = store.getRunningSummary(key);

        // Full text for the likeliest pages: best vocabulary matches plus the pages right after the
        // previous topic's slides (lectures usually move forward). Every page is listed in the index.
        const byPage = new Map(slides.pages.map(page => [page.page, page]));
        const matched = findCandidateSlides(slides.pages, moment.title + ' ' + moment.quote, maxCandidateSlides);
        const lastShown = Math.max(0, ...previousSlides);
        const following = lastShown ? [lastShown, lastShown + 1, lastShown + 2].map(page => byPage.get(page)).filter(page => page !== undefined) : [];
        const candidates = [...new Map([...matched, ...following].map(page => [page.page, page])).values()]
          .slice(0, maxCandidateSlides + 2)
          .sort((a, b) => a.page - b.page);

        const evidence: Evidence[] = [
          { id: 'topic', kind: 'text', text: `Title: ${moment.title}\nLabel: ${moment.short}\nTranscript: ${trimWords(moment.quote, maxTopicWords)}` },
          ...(summary ? [{ id: 'lecture-so-far', kind: 'text' as const, text: summary }] : []),
          ...(earlier.length ? [{ id: 'earlier-topics', kind: 'text' as const, text: earlier.map((title, index) => `${index + 1}. ${title}`).join('\n') }] : []),
          ...(slides.pages.length ? [{ id: 'slide-index', kind: 'text' as const, text: slideIndex(slides.pages) }] : []),
          ...(previousSlides.length ? [{ id: 'previous-slides', kind: 'text' as const, text: `The previous topic was matched to slide page(s) ${previousSlides.join(', ')}.` }] : []),
          ...candidates.map(page => ({ id: `slide-page-${page.page}`, kind: 'text' as const, text: page.text.slice(0, 900) })),
        ];

        try {
          const result = await provider.generateStructured({
            task: ENRICHMENT_TASK,
            instructions: ENRICHMENT_INSTRUCTIONS,
            evidence,
            schema: EnrichmentResult,
            signal,
            options: { reasoning: 'low', maxOutputTokens: 1500 },
          });
          if (signal.aborted) return;
          const notes = result.data;
          // The model may pick any real page of the deck, never a page that does not exist.
          const chosen = notes.slides
            .filter((slide, index, all) => byPage.has(slide.page) && all.findIndex(other => other.page === slide.page) === index);
          const nodeIds = new Set(notes.diagram?.nodes.map(node => node.id) ?? []);
          const edges = (notes.diagram?.edges ?? []).filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);

          store.updateMoment(key, momentId, current => ({
            ...withoutRevision(current),
            summary: notes.summary,
            intuition: notes.intuition,
            type: notes.type,
            equations: notes.equations,
            slides: chosen.map(slide => ({ ...slides.slide(slide.page), confidence: slide.confidence })),
            graph: notes.diagram && edges.length
              ? { origin: 'generated', nodes: notes.diagram.nodes, edges: edges.map((edge, index) => ({ id: `e${index + 1}`, ...edge })) }
              : null,
            enrichment: 'ready',
          }));
          store.setRunningSummary(key, notes.lecture_so_far);
          onCall({
            task: ENRICHMENT_TASK, promptVersion: ENRICHMENT_PROMPT_VERSION, momentId, outcome: 'ok',
            provider: result.provider, model: result.model, latencyMs: Math.round(result.latencyMs),
            inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
            candidateSlides: candidates.map(page => page.page), chosenSlides: chosen.map(slide => slide.page),
            lowConfidenceSlides: chosen.filter(slide => slide.confidence === 'low').map(slide => slide.page),
          });
        } catch (error) {
          if (signal.aborted) return;
          store.updateMoment(key, momentId, current => ({ ...withoutRevision(current), enrichment: 'failed' }));
          onCall({
            task: ENRICHMENT_TASK, promptVersion: ENRICHMENT_PROMPT_VERSION, momentId, outcome: 'failed',
            candidateSlides: candidates.map(page => page.page),
            error: error instanceof ProviderError ? `${error.code}: ${error.message}` : String(error),
          });
        }
      }

      unsubscribe = store.subscribe(key, event => {
        if (event.type !== 'moment.upsert') return;
        const { id, status, enrichment } = event.moment;
        if (status !== 'closed' || enrichment !== 'none' || seen.has(id)) return;
        seen.add(id);
        queue = queue.then(() => enrich(id)).catch(() => {});
      });
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
    },
    idle() {
      return queue;
    },
  };
}
