import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { loadConfig } from '../config.ts';
import { createGraphProvider, createProvider } from './index.ts';

test('selecting Gemini routes both lecture and graph requests to Google and validates its JSON', async t => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json({
      candidates: [{ content: { parts: [{ text: 'internal', thought: true }, { text: '{"title":"Distribution shift"}' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 },
    });
  });
  const keys = { GEMINI_API_KEY: 'gemini-test', DEEPSEEK_API_KEY: 'deepseek-test' };
  const config = loadConfig({ ...keys, LLM_PROVIDER: 'gemini' }).llm;
  const args = { task: 'test', instructions: 'Extract a title.', schema: z.object({ title: z.string() }) };
  const live = await createProvider(config).generateStructured({ ...args, evidence: [{ kind: 'text', id: 's1', text: 'Lecture text' }] });
  const graph = await createGraphProvider(config).generateStructured({ ...args, evidence: { text: 'Lecture text' } });
  assert.equal(live.provider, 'gemini');
  assert.deepEqual(live.usage, { inputTokens: 12, outputTokens: 8 });
  assert.equal(graph.metadata.provider, 'gemini');
  assert.deepEqual(live.data, { title: 'Distribution shift' });
  assert.deepEqual(graph.data, live.data);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent');
    const headers = new Headers(call.init?.headers);
    assert.equal(headers.get('x-goog-api-key'), keys.GEMINI_API_KEY);
    assert.equal(headers.has('authorization'), false);
    const { generationConfig } = JSON.parse(String(call.init?.body));
    assert.equal(generationConfig.responseMimeType, 'application/json');
    assert.equal(generationConfig.thinkingConfig.thinkingLevel, 'low');
  }
  const deepseek = loadConfig({ ...keys, LLM_PROVIDER: 'deepseek' }).llm;
  assert.equal(createProvider(deepseek).name, 'deepseek');
  assert.match(createGraphProvider(deepseek).identity, /^deepseek\//);
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'gemini', DEEPSEEK_API_KEY: keys.DEEPSEEK_API_KEY }), /GEMINI_API_KEY/);
});
