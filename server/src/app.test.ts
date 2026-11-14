import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createProvider } from './llm/index.ts';

test('GET /api/health reports the active provider', async () => {
  const config = loadConfig({});
  const app = await buildApp({ config, provider: createProvider(config.llm) });
  try {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, provider: 'fixture', model: 'fixture' });
  } finally {
    await app.close();
  }
});

test('unknown routes return 404', async () => {
  const config = loadConfig({});
  const app = await buildApp({ config, provider: createProvider(config.llm) });
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/nope' })).statusCode, 404);
  } finally {
    await app.close();
  }
});
