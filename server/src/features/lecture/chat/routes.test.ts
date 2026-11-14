import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../../../app.ts';
import { loadConfig } from '../../../config.ts';
import { createFixtureProvider } from '../../../llm/fixture.ts';
import { ChatAnswer } from '../../../../../shared/contracts/lectureInteractions.ts';
import { ProviderError } from '../../../llm/types.ts';
import { CHAT_TASK } from './schema.ts';

const base = '/api/lectures/ai/2';
test('registered chat route answers from a real replay store and rejects stale or invalid context', async () => {
  const app = await buildApp({ config: loadConfig({}), provider: createFixtureProvider() });
  try {
    const started = await app.inject({ method: 'POST', url: base + '/session', payload: { start: 'instant', limit: 6 } });
    const runId: string = started.json().runId;
    const input = { runId, question: 'What did I miss in the last 3 minutes?', context: { kind: 'recent', seconds: 180 } };
    const response = await app.inject({ method: 'POST', url: base + '/chat', payload: input });
    assert.equal(response.statusCode, 200);
    const answer = ChatAnswer.parse(response.json());
    assert.ok(answer.citations.length > 0);
    const moments = (await app.inject({ method: 'GET', url: base + '/moments' })).json().moments as { id: string }[];
    assert.ok(answer.citations.every(citation => moments.some(moment => moment.id === citation.momentId)));
    assert.equal(answer.provider, 'fixture');
    assert.equal((await app.inject({ method: 'POST', url: base + '/chat', payload: { ...input, question: '' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: base + '/chat', payload: { ...input, runId: 'old' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: base + '/chat', payload: { ...input, context: { kind: 'moment', momentId: 'unknown' } } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/api/lectures/ai/3/chat', payload: input })).statusCode, 404);
  } finally { await app.close(); }
});

test('chat failures are recoverable and oversized request bodies are rejected', async () => {
  const provider = createFixtureProvider();
  const app = await buildApp({ config: loadConfig({}), provider });
  try {
    const started = await app.inject({ method: 'POST', url: base + '/session', payload: { limit: 2 } });
    const input = { runId: started.json().runId, question: 'Explain this moment', context: { kind: 'recent', seconds: 180 } };
    provider.register(CHAT_TASK, () => { throw new ProviderError('request_failed', 'Provider failed'); });
    const failed = await app.inject({ method: 'POST', url: base + '/chat', payload: input });
    assert.equal(failed.statusCode, 503);
    assert.match(failed.json().error, /transcript is still available/);
    provider.register(CHAT_TASK, () => ({ answer: 'Invalid citation', momentIds: ['another-lecture'], insufficientEvidence: false }));
    assert.equal((await app.inject({ method: 'POST', url: base + '/chat', payload: input })).statusCode, 503);
    assert.equal((await app.inject({ method: 'POST', url: base + '/chat', payload: { ...input, question: 'x'.repeat(20_000) } })).statusCode, 413);
  } finally { await app.close(); }
});
