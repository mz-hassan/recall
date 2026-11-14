import type { Fixture } from '../../../llm/fixture.ts';
import type { SegmentationDecision } from './schema.ts';

const titleFrom = (text: string, words: number) => text.replace(/^\[\d+\]\s*/, '').split(/\s+/).slice(0, words).join(' ').replace(/[^\p{L}\p{N}' -]/gu, '') || 'Untitled';

/**
 * Offline stand-in for the segmentation model, used when LLM_PROVIDER=fixture. Deterministic:
 * a new topic starts once the open topic passes ~400 words, titled from its first words.
 */
export const segmentationFixture: Fixture = ({ evidence }): SegmentationDecision => {
  const newText = evidence.find(item => item.id === 'new-text');
  const openTopic = evidence.find(item => item.id === 'open-topic');
  const firstSentence = newText?.kind === 'text' ? newText.text.split('\n')[0] ?? '' : '';
  const openText = openTopic?.kind === 'text' ? openTopic.text : '';
  const title = /^Title: (.*)$/m.exec(openText)?.[1];
  const label = /^Label: (.*)$/m.exec(openText)?.[1];
  const length = Number(/^Length so far: (\d+)/m.exec(openText)?.[1] ?? 0);

  if (!title) return { current_topic_title: titleFrom(firstSentence, 6), current_topic_label: titleFrom(firstSentence, 2), new_topics: [] };
  const fresh = length >= 400
    ? [{ starts_at_sentence: 1, title: titleFrom(firstSentence, 6), label: titleFrom(firstSentence, 2) }]
    : [];
  return { current_topic_title: title, current_topic_label: label ?? title, new_topics: fresh };
};
