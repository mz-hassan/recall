import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { DeepSeekProvider } from './deepseek.ts';
import { StructuredOutputError } from './provider.ts';
import { extractionSchema } from '../../../shared/contracts/graph.ts';
const options = { key: 'test-only', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
const args = { task: 'graph.extract', instructions: 'Return JSON.', evidence: { text: 'Evidence' }, schema: z.object({ valid: z.boolean() }) };
const success = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"valid":true}' }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }));
test('DeepSeek adapter sends server credentials/JSON schema and retries transient errors', async () => {
  let calls = 0;
  const provider = new DeepSeekProvider(options, async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-only');
    return calls === 1 ? new Response('', { status: 429 }) : success();
  });
  const result = await provider.generateStructured(args);
  assert.equal(calls, 2); assert.deepEqual(result.data, { valid: true });
  assert.deepEqual(result.metadata.usage, { total_tokens: 10 });
});
test('DeepSeek adapter rejects missing credentials, invalid structured data, and truncated output', async () => {
  await assert.rejects(new DeepSeekProvider({ ...options, key: undefined }).generateStructured(args), /DEEPSEEK_API_KEY/);
  const invalid = new DeepSeekProvider(options, async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"valid":"wrong"}' }, finish_reason: 'stop' }] })));
  await assert.rejects(invalid.generateStructured(args), error => {
    assert.ok(error instanceof StructuredOutputError);
    assert.equal(error.metadata.attempts, 3);
    assert.ok(error.metadata.validationFailures?.[0].issues[0].includes('boolean'));
    assert.ok(!error.message.includes('invalid_type'));
    return true;
  });
  const truncated = new DeepSeekProvider(options, async () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'length' }] })));
  await assert.rejects(truncated.generateStructured(args), /truncated/);
});
test('invalid relationship enums are repaired with exact field feedback instead of failing before the retry', async () => {
  let calls = 0;
  const schema = z.object({ edges: z.array(z.object({ relation: extractionSchema.shape.edges.element.shape.relation })) });
  const provider = new DeepSeekProvider(options, async (_url, init) => {
    calls++;
    const request = JSON.parse(String(init?.body));
    if (calls === 2) {
      const feedback = request.messages.at(-1).content;
      assert.match(feedback, /edges\.1\.relation/);
      assert.match(feedback, /is_a/);
      assert.match(feedback, /omit that edge/);
      assert.equal(request.messages.at(-2).role, 'assistant');
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      edges: calls === 1 ? [{ relation: 'uses' }, { relation: 'causes' }] : [{ relation: 'uses' }],
    }) }, finish_reason: 'stop' }] }));
  });
  const result = await provider.generateStructured({ ...args, schema });
  assert.equal(calls, 2);
  assert.deepEqual(result.data.edges, [{ relation: 'uses' }]);
  assert.equal(result.metadata.validationFailures?.length, 1);
});
test('unrecoverable relation errors stay strict and return a concise message with diagnostics', async () => {
  let calls = 0;
  const provider = new DeepSeekProvider(options, async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"relation":"invented"}' }, finish_reason: 'stop' }] }));
  });
  await assert.rejects(provider.generateStructured({ ...args, schema: z.object({ relation: extractionSchema.shape.edges.element.shape.relation }) }), error => {
    assert.ok(error instanceof StructuredOutputError);
    assert.match(error.message, /unsupported relationship type/);
    assert.equal(error.metadata.validationFailures?.length, 3);
    return true;
  });
  assert.equal(calls, 3);
});
test('malformed JSON can be corrected on a bounded second attempt', async () => {
  let calls = 0;
  const provider = new DeepSeekProvider(options, async () => ++calls === 1
    ? new Response(JSON.stringify({ choices: [{ message: { content: 'not json' }, finish_reason: 'stop' }] }))
    : success());
  const result = await provider.generateStructured(args);
  assert.deepEqual(result.data, { valid: true }); assert.equal(calls, 2);
});
test('DeepSeek adapter respects cancellation before sending any request', async () => {
  let calls = 0;
  const provider = new DeepSeekProvider(options, async () => { calls++; return success(); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(provider.generateStructured({ ...args, signal: controller.signal }));
  assert.equal(calls, 0);
});
