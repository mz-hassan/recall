import type { Fixture } from '../../../llm/fixture.ts';
import type { ModelProvider } from '../../../llm/types.ts';
import type { ChatContext } from './context.ts';
import { CHAT_TASK } from './schema.ts';

export const chatFixture: Fixture = ({ evidence }) => {
  const item = evidence.find(value => value.id === 'lecture-context');
  const context: ChatContext = JSON.parse(item?.kind === 'text' ? item.text : '{}');
  const question = context.question.toLowerCase();
  const recap = /miss|recap|summari|catch.?up|this (moment|topic)|explain/.test(question);
  const words = question.match(/[a-z]{4,}/g)?.filter(word => !['what', 'does', 'about', 'please', 'could', 'would', 'which', 'there', 'this', 'that', 'with', 'from'].includes(word)) ?? [];
  const matches = context.moments.filter(moment => recap || words.some(word =>
    `${moment.title} ${moment.quote} ${moment.summary}`.toLowerCase().includes(word))).slice(-3);
  if (!matches.length) return {
    answer: 'The available lecture evidence does not answer that question. Try asking about the selected moment or a topic already covered.',
    momentIds: [], insufficientEvidence: true,
  };
  return {
    answer: matches.map(moment => `${moment.title}: ${(moment.summary || moment.quote).slice(0, 160)}`).join(' '),
    momentIds: matches.map(moment => moment.id), insufficientEvidence: false,
  };
};

export function registerChatFixture(provider: ModelProvider) {
  if ('register' in provider && typeof provider.register === 'function') provider.register(CHAT_TASK, chatFixture);
}
