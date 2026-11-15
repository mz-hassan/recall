import type { Moment } from '../../../../shared/contracts/lecture.ts';
import type { Doubt } from '../../platform/repository.ts';

export type QuizTopic = Pick<Moment, 'id' | 'title' | 'summary' | 'quote' | 'type' | 'equations'> & { aliases?: string[] };
export type PlannedTopic = QuizTopic & { count: number; weight: number; personalDoubt: boolean; classDoubt: boolean; important: boolean };
export const plain = (text: string) => text.replace(/<\/?(?:b|strong|i|em|span|br|div|p|small|sup|sub)(?:\s[^>]*)?\s*\/?>/gi, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const words = (text: string) => plain(text).split(/\s+/).filter(Boolean).length;

export function questionCount(scope: 'topic' | 'lecture', topics: QuizTopic[]) {
  const unique = [...new Set(topics.map(topic => plain(topic.quote || topic.summary)))].join(' ');
  const size = words(unique);
  return scope === 'topic' ? Math.max(2, Math.min(10, 1 + Math.ceil(size / 400)))
    : Math.max(8, Math.min(15, 7 + Math.ceil(size / 1400)));
}

export function planQuiz(topics: QuizTopic[], count: number, doubts: Doubt[], userId: string): PlannedTopic[] {
  const weighted = topics.map(topic => {
    const ids = new Set([topic.id, ...(topic.aliases ?? [])]);
    const matching = doubts.filter(doubt => ids.has(doubt.momentId) || Boolean(doubt.pastTopicId && ids.has(doubt.pastTopicId)));
    const personalDoubt = matching.some(doubt => doubt.userId === userId);
    const classCount = new Set(matching.filter(doubt => doubt.userId !== userId).map(doubt => doubt.userId)).size;
    const important = /FOUNDATION|KEY|THEORY|ALGORITHM|BIG PICTURE/i.test(topic.type) || topic.equations.length > 0
      || /\b(key (?:idea|concept)|fundamental|important principle|central idea|theorem)\b/i.test(topic.summary + ' ' + topic.quote);
    return { ...topic, count: 0, personalDoubt, classDoubt: classCount > 0, important,
      weight: 1 + (important ? 2 : 0) + (personalDoubt ? 4 : 0) + Math.min(3, Math.log2(1 + classCount)) };
  }).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  // Cover as many topics as possible before allocating extra questions by weighted share.
  for (const topic of weighted.slice(0, count)) topic.count = 1;
  for (let remaining = count - Math.min(count, weighted.length); remaining > 0; remaining--) {
    const best = weighted.reduce((a, b) => a.weight / (a.count + 1) >= b.weight / (b.count + 1) ? a : b);
    best.count++;
  }
  return weighted.filter(topic => topic.count > 0);
}
