import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { createFixtureProvider } from './fixture.ts';
import { ProviderError } from './types.ts';

const TitleSchema = z.object({ title: z.string().min(1) });
const request = { task: 'demo.title', instructions: 'Give a title.', evidence: [], schema: TitleSchema };

test('returns validated fixture output with provider metadata', async () => {
  const provider = createFixtureProvider({ 'demo.title': () => ({ title: 'Distribution shift' }) });
  const result = await provider.generateStructured(request);
  assert.deepEqual(result.data, { title: 'Distribution shift' });
  assert.equal(result.provider, 'fixture');
  assert.deepEqual(result.usage, { inputTokens: 0, outputTokens: 0 });
});

test('fixtures can read the evidence they were given', async () => {
  const provider = createFixtureProvider();
  provider.register('demo.title', ({ evidence }) => ({ title: evidence.map(item => item.id).join(',') }));
  const result = await provider.generateStructured({ ...request, evidence: [{ id: 'chunk-1', kind: 'text', text: 'hello' }] });
  assert.equal(result.data.title, 'chunk-1');
});

test('an unregistered task fails loudly', async () => {
  await assert.rejects(createFixtureProvider().generateStructured(request),
    (error: unknown) => error instanceof ProviderError && error.code === 'no_fixture');
});

test('output that breaks the schema is rejected, not returned', async () => {
  const provider = createFixtureProvider({ 'demo.title': () => ({ title: '' }) });
  await assert.rejects(provider.generateStructured(request),
    (error: unknown) => error instanceof ProviderError && error.code === 'invalid_output');
});

test('a cancelled request does not run', async () => {
  const provider = createFixtureProvider({ 'demo.title': () => ({ title: 'x' }) });
  await assert.rejects(provider.generateStructured({ ...request, signal: AbortSignal.abort() }),
    (error: unknown) => error instanceof ProviderError && error.code === 'aborted');
});
