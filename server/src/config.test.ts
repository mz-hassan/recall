import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from './config.ts';

test('defaults to the fixture provider on localhost with no keys', () => {
  const config = loadConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3001);
  assert.equal(config.llm.provider, 'fixture');
});

test('blank values from .env.example count as unset', () => {
  const config = loadConfig({ API_PORT: '', LLM_PROVIDER: '', DEEPSEEK_API_KEY: '' });
  assert.equal(config.port, 3001);
  assert.equal(config.llm.provider, 'fixture');
});

test('a real provider requires its API key', () => {
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'deepseek' }), /DEEPSEEK_API_KEY/);
  assert.equal(loadConfig({ LLM_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'test-key' }).llm.provider, 'deepseek');
});

test('rejects an invalid port', () => {
  assert.throws(() => loadConfig({ API_PORT: '70000' }), /API_PORT/);
});

test('the API port comes from API_PORT, never the generic PORT other tools set', () => {
  assert.equal(loadConfig({ API_PORT: '8787' }).port, 8787);
  assert.equal(loadConfig({ PORT: '5180' }).port, 3001);
});

test('MongoDB and model settings preserve the shared local configuration', () => {
  const config = loadConfig({ LLM_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: ' test-key ', API_PORT: '3001', MONGODB_DB: 'recall' });
  assert.equal(config.llm.deepseekApiKey, 'test-key');
  assert.deepEqual(config.mongo, { uri: 'mongodb://127.0.0.1:27017', database: 'recall' });
});

test('deployment requires a complete TLS pair and the exact browser origin', () => {
  assert.throws(() => loadConfig({ TLS_CERT_FILE: 'cert.pem' }), /TLS_CERT_FILE/);
  assert.throws(() => loadConfig({ APP_ORIGIN: 'https://recall.example.edu/path' }), /APP_ORIGIN/);
  assert.throws(() => loadConfig({ TLS_CERT_FILE: 'cert.pem', TLS_KEY_FILE: 'key.pem' }), /APP_ORIGIN/);
  assert.throws(() => loadConfig({ TRUST_LOOPBACK_PROXY: '1', HOST: '0.0.0.0' }), /HOST/);
  const config = loadConfig({ TLS_CERT_FILE: 'cert.pem', TLS_KEY_FILE: 'key.pem', APP_ORIGIN: 'https://recall.example.edu' });
  assert.equal(config.deployment.origin, 'https://recall.example.edu');
});
