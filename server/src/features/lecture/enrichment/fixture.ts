import type { Fixture } from '../../../llm/fixture.ts';
import type { EnrichmentResult } from './schema.ts';

/**
 * Offline stand-in for the enrichment model, used when LLM_PROVIDER=fixture. Deterministic: the
 * summary is the topic's first sentence, the first candidate slide is chosen, and the running summary
 * lists topic titles.
 */
export const enrichmentFixture: Fixture = ({ evidence }): EnrichmentResult => {
  const topic = evidence.find(item => item.id === 'topic');
  const text = topic?.kind === 'text' ? topic.text : '';
  const title = /^Title: (.*)$/m.exec(text)?.[1] ?? 'Topic';
  const transcript = /^Transcript: ([\s\S]*)$/m.exec(text)?.[1] ?? '';
  const firstSentence = (transcript.split(/(?<=[.!?])\s/)[0] ?? transcript).slice(0, 300) || title;
  const previous = evidence.find(item => item.id === 'lecture-so-far');
  const slide = evidence.find(item => item.id.startsWith('slide-page-'));
  return {
    summary: firstSentence,
    intuition: '',
    type: 'CONCEPT',
    equations: [],
    slides: slide ? [{ page: Number(slide.id.slice('slide-page-'.length)), confidence: 'high' }] : [],
    diagram: null,
    lecture_so_far: [previous?.kind === 'text' ? previous.text : '', title].filter(Boolean).join(' → ').slice(-1400),
  };
};
