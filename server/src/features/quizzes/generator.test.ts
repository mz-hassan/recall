import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ModelProvider } from '../../llm/types.ts';
import { generateQuiz } from './generator.ts';
import { planQuiz, type QuizTopic } from './planner.ts';

const topic: QuizTopic = { id: 'filter', title: 'Local filters', summary: 'A convolution combines neighboring pixels with fixed filter weights.', quote: 'A filter is applied to a local image neighborhood.', type: 'CONCEPT', equations: [] };
const question = (prompt: string) => ({ topicId: 'filter', prompt, options: ['Fixed filter weights', 'Only random values', 'Only the image filename', 'The number of students'], correctIndex: 0, explanation: 'A convolution combines neighboring pixels using filter weights.', sourceQuote: topic.summary });
function provider(output: unknown): ModelProvider { return { name: 'validation-test', model: 'test', modalities: ['text'], async generateStructured(request) { return { data: request.schema.parse(output), provider: 'test', model: 'test', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 }; } }; }
const plan = () => planQuiz([topic], 2, [], 'student');
test('shuffled MCQ options retain the correct key and the supporting lecture quote', async () => {
  const result = await generateQuiz(provider({ questions: [question('What weights are used by convolution?'), question('What combines neighboring image pixels?')] }), plan(), []);
  assert.equal(result.questions.length, 2);
  for (const item of result.questions) { assert.equal(item.options[item.correctIndex], 'Fixed filter weights'); assert.equal(item.sourceQuote, topic.summary); }
});
test('unsupported evidence and duplicate questions/options are rejected instead of becoming a graded quiz', async () => {
  const first = question('What weights are used by convolution?'), second = question('What combines neighboring image pixels?');
  await assert.rejects(generateQuiz(provider({ questions: [first, { ...second, sourceQuote: 'Invented details outside this lecture.' }] }), plan(), []), /grounded/);
  await assert.rejects(generateQuiz(provider({ questions: [first, { ...second, prompt: first.prompt.toUpperCase() }] }), plan(), []), /grounded/);
  await assert.rejects(generateQuiz(provider({ questions: [first, { ...second, options: ['Same', 'same', 'Third', 'Fourth'] }] }), plan(), []), /grounded/);
});
test('a model cannot silently move questions away from the required topic allocation', async () => {
  const other = { ...topic, id: 'edges', title: 'Edges' };
  const allocation = planQuiz([topic, other], 2, [], 'student');
  await assert.rejects(generateQuiz(provider({ questions: [question('What weights are used by convolution?'), question('What combines neighboring image pixels?')] }), allocation, []), /coverage/);
});
