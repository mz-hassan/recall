import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from './config.ts';

test('defaults to the fixture provider on localhost with no keys', () => {
  const config = loadConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 8787);
  assert.equal(config.llm.provider, 'fixture');
});

test('blank values from .env.example count as unset', () => {
  const config = loadConfig({ PORT: '', LLM_PROVIDER: '', DEEPSEEK_API_KEY: '' });
  assert.equal(config.port, 8787);
  assert.equal(config.llm.provider, 'fixture');
});

test('a real provider requires its API key', () => {
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'deepseek' }), /DEEPSEEK_API_KEY/);
  assert.equal(loadConfig({ LLM_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-key' }).llm.provider, 'deepseek');
});

test('rejects an invalid port', () => {
  assert.throws(() => loadConfig({ PORT: '70000' }), /PORT/);
});
