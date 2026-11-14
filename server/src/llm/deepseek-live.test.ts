import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { createDeepSeekProvider } from './deepseek.ts';
import { ProviderError } from './types.ts';

const Schema = z.object({ title: z.string().min(1) });
const request = { task: 'demo', instructions: 'Title it.', evidence: [{ id: 'e1', kind: 'text' as const, text: 'hello' }], schema: Schema };

function scripted(responses: Array<() => Response>) {
  const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next();
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}
const chat = (content: string | null, usage = { prompt_tokens: 120, completion_tokens: 15 }) =>
  () => Response.json({ model: 'deepseek-flash', choices: [{ message: { content }, finish_reason: 'stop' }], usage });
const provider = (fetch: typeof globalThis.fetch) => createDeepSeekProvider({ apiKey: 'test-key', fetch, sleep: async () => {} });

test('sends a JSON-mode chat request and returns validated data with usage', async () => {
  const { fetch, calls } = scripted([chat('{"title":"Distribution shift"}')]);
  const result = await provider(fetch).generateStructured(request);
  assert.deepEqual(result.data, { title: 'Distribution shift' });
  assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 15 });
  assert.equal(result.provider, 'deepseek');
  const [call] = calls;
  assert.equal(call!.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(call!.headers.authorization, 'Bearer test-key');
  assert.equal(call!.body.model, 'deepseek-flash');
  assert.deepEqual(call!.body.response_format, { type: 'json_object' });
  assert.match(call!.body.messages[0].content, /json/, 'JSON mode requires the word json in the prompt');
  assert.match(call!.body.messages[1].content, /<evidence id="e1">\nhello\n<\/evidence>/);
});

test('retries once on blank content, then succeeds', async () => {
  const { fetch, calls } = scripted([chat(''), chat('{"title":"Ok"}')]);
  assert.equal((await provider(fetch).generateStructured(request)).data.title, 'Ok');
  assert.equal(calls.length, 2);
});

test('retries on 429 and 5xx', async () => {
  const { fetch, calls } = scripted([() => new Response('busy', { status: 503 }), chat('{"title":"Ok"}')]);
  await provider(fetch).generateStructured(request);
  assert.equal(calls.length, 2);
});

test('retries unexpected API response shapes', async () => {
  const { fetch, calls } = scripted([() => Response.json({ choices: [{}] }), chat('{"title":"Ok"}')]);
  assert.equal((await provider(fetch).generateStructured(request)).data.title, 'Ok');
  assert.equal(calls.length, 2);
});

test('preserves live lecture reasoning and output budget options', async () => {
  const { fetch, calls } = scripted([chat('{"title":"Ok"}'), chat('{"title":"Ok"}')]);
  const model = provider(fetch);
  await model.generateStructured({ ...request, options: { reasoning: 'off', maxOutputTokens: 400, temperature: 0.1 } });
  assert.deepEqual(calls[0]!.body.thinking, { type: 'disabled' });
  assert.equal(calls[0]!.body.max_tokens, 400);
  assert.equal(calls[0]!.body.temperature, 0.1);
  await model.generateStructured({ ...request, options: { reasoning: 'low', maxOutputTokens: 1500 } });
  assert.deepEqual(calls[1]!.body.thinking, { type: 'enabled' });
  assert.equal(calls[1]!.body.reasoning_effort, 'low');
  assert.equal(calls[1]!.body.max_tokens, 1500 + 6144);
});

test('output that keeps failing the schema becomes invalid_output', async () => {
  const { fetch } = scripted([chat('{"title":""}'), chat('{"wrong":1}')]);
  await assert.rejects(provider(fetch).generateStructured(request),
    (error: unknown) => error instanceof ProviderError && error.code === 'invalid_output');
});

test('a 401 is not retried and never echoes the key', async () => {
  const { fetch, calls } = scripted([() => new Response('{"error":{"message":"Bearer sk-secret123 invalid"}}', { status: 401 })]);
  await assert.rejects(provider(fetch).generateStructured(request), (error: unknown) =>
    error instanceof ProviderError && error.code === 'request_failed' && !error.message.includes('sk-secret123'));
  assert.equal(calls.length, 1);
});

test('image evidence is refused instead of silently dropped', async () => {
  const { fetch, calls } = scripted([chat('{"title":"x"}')]);
  await assert.rejects(provider(fetch).generateStructured({ ...request, evidence: [{ id: 'p1', kind: 'image', mimeType: 'image/png', data: '' }] }),
    (error: unknown) => error instanceof ProviderError && error.code === 'unsupported_modality');
  assert.equal(calls.length, 0);
});

test('a cancelled request stops before calling the API', async () => {
  const { fetch, calls } = scripted([chat('{"title":"x"}')]);
  await assert.rejects(provider(fetch).generateStructured({ ...request, signal: AbortSignal.abort() }),
    (error: unknown) => error instanceof ProviderError && error.code === 'aborted');
  assert.equal(calls.length, 0);
});
