import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { createFixtureProvider } from '../llm/index.ts';

test('serves dataset slide PDFs and refuses anything outside the dataset', async () => {
  const app = await buildApp({ config: loadConfig({}), provider: createFixtureProvider() });
  try {
    const pdf = await app.inject({ url: '/api/datasets/ai/lectures/02_2026-09-15_limitations-of-behavior-cloning/slides/limitbc-slides.pdf' });
    assert.equal(pdf.statusCode, 200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
    assert.equal(pdf.rawPayload.subarray(0, 5).toString(), '%PDF-');

    assert.equal((await app.inject({ url: '/api/datasets/ai/lectures/missing.pdf' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/api/datasets/ai/manifest.json' })).statusCode, 404, 'only known file types');
    assert.equal((await app.inject({ url: '/api/datasets/ai/..%2F..%2Fpackage.json' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/api/datasets/ai/../../.env.txt' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/api/datasets/zz/lectures/x.pdf' })).statusCode, 404, 'unknown course');
  } finally {
    await app.close();
  }
});
