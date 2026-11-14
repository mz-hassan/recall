import test from 'node:test';
import assert from 'node:assert/strict';
import { daggerBundle } from './data/dagger.js';
import { makePaperCatalog, papers } from './catalog.js';
import { initialReader, readerReducer, relativeRect, saveReader } from './state.js';
import { ReadingBundle } from '../../shared/contracts/readings.ts';

test('DAgger bundle has valid source anchors and all prepared highlights', () => {
  const parsed = ReadingBundle.safeParse(daggerBundle);
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 5)));
  assert.equal(daggerBundle.pageCount, 9);
  assert.equal(daggerBundle.highlights.length, 13);
  for (const h of daggerBundle.highlights) {
    assert.ok(h.quote.length > 20);
    for (const r of h.rects) { assert.ok(r.x + r.width <= 1.001); assert.ok(r.y + r.height <= 1.001); }
    assert.ok(daggerBundle.sections.some(s => s.id === h.sectionId));
  }
});
test('prepared claims retain qualifications and OCR results', () => {
  const find = id => daggerBundle.highlights.find(h => h.id === id);
  assert.match(find('ocr').quote, /85\.5/);
  assert.match(find('ocr').explanation, /this OCR experiment/);
  assert.match(find('assumptions').explanation, /strongly convex/);
  assert.match(find('limits').explanation, /not an unconditional/);
  assert.match(find('algorithm').explanation, /expert.*label.*append.*retrain/i);
  assert.equal(find('algorithm').page, 4);
  assert.equal(find('no-regret').page, 5);
});
test('paper identity is independent of lecture number and preserves assignments', () => {
  const reading = { title: 'Test paper', source_url: 'https://example.com/paper.pdf' };
  const catalog = makePaperCatalog('test', [{ number: 2, required: [reading] }, { number: 9, optional: [reading] }]);
  assert.equal(catalog.length, 1); assert.equal(catalog[0].assignments.length, 2);
  assert.equal(catalog[0].id, makePaperCatalog('test', [{ number: 5, optional: [reading] }])[0].id);
  assert.ok(papers.some(p => p.id === 'ai-dagger'));
});
test('selection snapshot does not change when the active passage changes', () => {
  const state = readerReducer(initialReader('test', '1'), { type: 'select', context: { page: 1, quote: 'First' } });
  const snapshot = structuredClone(state.context);
  const next = readerReducer(state, { type: 'select', context: { page: 4, quote: 'Second' } });
  assert.equal(snapshot.quote, 'First'); assert.equal(next.context.page, 4);
});
test('teaching aids clear independently of prepared annotations and chat', () => {
  const state = { ...initialReader('test', '2'), annotations: [{ id: 'a' }], diagrams: [{ id: 'd' }], messages: [{ text: 'Keep' }] };
  const next = readerReducer(state, { type: 'clear' });
  assert.equal(next.annotations.length, 0); assert.equal(next.messages.length, 1); assert.equal(daggerBundle.highlights.length, 13);
});
test('paper sessions are isolated and invalidated by a changed fingerprint', () => {
  saveReader('one', { ...initialReader('one', 'a'), page: 4 });
  assert.equal(initialReader('one', 'a').page, 4);
  assert.equal(initialReader('two', 'a').page, 1);
  assert.equal(initialReader('one', 'b').page, 1);
});
test('selection rectangle clips to a page and is invariant under viewport scaling', () => {
  const a = relativeRect({ left: 20, top: 30, right: 60, bottom: 50 }, { left: 10, top: 10, right: 110, bottom: 210, width: 100, height: 200 });
  const b = relativeRect({ left: 40, top: 60, right: 120, bottom: 100 }, { left: 20, top: 20, right: 220, bottom: 420, width: 200, height: 400 });
  assert.deepEqual(a, b);
  assert.equal(relativeRect({ left: 500, top: 500, right: 600, bottom: 600 }, { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }), null);
});
