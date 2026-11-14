import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createProvider } from './llm/index.ts';
import { GraphService } from './features/graph/service.ts';
import { MemoryRepository, TestProvider, TestSource } from './features/graph/testSupport.ts';
import { startGraphRuntime } from './features/graph/runtime.ts';

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

test('a missing graph database does not disable live lecture or health routes', async () => {
  const config = loadConfig({ MONGODB_URI: 'mongodb://127.0.0.1:1' });
  const warnings: string[] = [];
  const runtime = startGraphRuntime(config.mongo, new TestProvider(), message => warnings.push(message));
  const app = await buildApp({ config, provider: createProvider(config.llm), graphService: runtime.getService });
  try {
    assert.equal((await app.inject('/api/health')).statusCode, 200);
    const graph = await app.inject('/api/courses/ai/graph');
    assert.equal(graph.statusCode, 503);
    assert.match(graph.json().error, /MongoDB/);
    const session = await app.inject({ method: 'POST', url: '/api/lectures/ai/2/session', payload: {} });
    assert.equal(session.statusCode, 201);
    assert.equal(session.json().published, 1);
    const pdf = await app.inject('/api/datasets/ai/lectures/02_2026-09-15_limitations-of-behavior-cloning/slides/limitbc-slides.pdf');
    assert.equal(pdf.statusCode, 200);
    await runtime.ready;
    assert.match(warnings.join(' '), /Knowledge graph unavailable/);
    assert.equal((await app.inject('/api/lectures/ai/2/session')).statusCode, 200);
    assert.equal((await app.inject('/api/courses/ai/graph')).statusCode, 503);
  } finally { await app.close(); await runtime.close(); }
});

test('the shared server supports live sessions and graph completion together', async () => {
  const config = loadConfig({});
  const service = new GraphService(new MemoryRepository(), new TestSource(), new TestProvider());
  const app = await buildApp({ config, provider: createProvider(config.llm), graphService: service, graphProviderConfigured: true });
  try {
    const session = await app.inject({ method: 'POST', url: '/api/lectures/ai/2/session', payload: {} });
    assert.equal(session.statusCode, 201);
    const completion = await app.inject({ method: 'POST', url: '/api/graph/lecture-completed', payload: { courseId: 'ai', lectureId: '1', revision: 1 } });
    assert.equal(completion.statusCode, 202);
    await service.idle();
    const graph = await app.inject('/api/courses/ai/graph');
    assert.equal(graph.statusCode, 200);
    assert.equal(graph.json().nodes.length, 2);
    assert.equal((await app.inject('/api/lectures/ai/2/session')).json().published, 1);
  } finally { await app.close(); await service.close(); }
});
