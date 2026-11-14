// Live pipeline evaluation: replays a lecture through segmentation and enrichment with the configured
// model, then prints each topic's notes and the call statistics.
// Usage: npm run eval:lecture -- --lecture 2 [--chunks 20] [--words 160] [--out results.json]
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { ReplayOptions } from '../../../../shared/contracts/lecture.ts';
import { loadConfig } from '../../config.ts';
import { createProvider } from '../../llm/index.ts';
import { createModelEnricher, type EnrichmentCall } from './enrichment/harness.ts';
import { ENRICHMENT_PROMPT_VERSION } from './enrichment/prompts/v2.ts';
import { registerLectureFixtures } from './index.ts';
import { createModelSegmenter, type SegmentationCall } from './segmentation/harness.ts';
import { SEGMENTATION_PROMPT_VERSION } from './segmentation/prompts/v2.ts';
import { createLectureService } from './service.ts';
import { createMemoryStore } from './store/memory.ts';

const { values } = parseArgs({
  options: {
    course: { type: 'string', default: 'ai' },
    lecture: { type: 'string', default: '2' },
    chunks: { type: 'string' },
    words: { type: 'string', default: '160' },
    out: { type: 'string' },
  },
});

const config = loadConfig();
const provider = createProvider(config.llm);
registerLectureFixtures(provider);
const store = createMemoryStore();
const segmentation: SegmentationCall[] = [];
const enrichment: EnrichmentCall[] = [];
const service = createLectureService({
  store,
  createSegmenter: () => createModelSegmenter({ provider, onCall: call => segmentation.push(call) }),
  createEnricher: () => createModelEnricher({ provider, onCall: call => enrichment.push(call) }),
  onError: error => console.error(error),
});
const key = { courseId: values.course, lectureId: values.lecture };
const options = ReplayOptions.parse({ start: 'instant', words: Number(values.words), ...(values.chunks && { limit: Number(values.chunks) }) });

console.log(`Lecture ${key.courseId}/${key.lectureId} with ${provider.name} (${provider.model}): ${SEGMENTATION_PROMPT_VERSION}, ${ENRICHMENT_PROMPT_VERSION}\n`);
const started = performance.now();
await service.startReplay(key, options);
await service.idle(key);
service.close();
const seconds = Math.round((performance.now() - started) / 1000);

const moments = store.getMoments(key);
for (const [index, moment] of moments.entries()) {
  console.log(`${String(index + 1).padStart(2)}. ${moment.label}  ${moment.type}  ${moment.title}  [${moment.enrichment}]`);
  if (moment.summary) console.log(`    Summary: ${moment.summary}`);
  if (moment.intuition) console.log(`    Intuition: ${moment.intuition}`);
  for (const equation of moment.equations) console.log(`    Equation: ${equation.expression}  (${equation.explanation})`);
  if (moment.slides.length) console.log(`    Slides: ${moment.slides.map(slide => slide.page + (slide.confidence === 'low' ? ' (probably)' : '')).join(', ')}`);
  if (moment.graph) console.log(`    Diagram: ${moment.graph.edges.map(edge => `${moment.graph!.nodes.find(node => node.id === edge.from)?.label} —${edge.relation}→ ${moment.graph!.nodes.find(node => node.id === edge.to)?.label}`).join('; ')}`);
}
console.log(`\nLecture so far: ${store.getRunningSummary(key) ?? '(none)'}\n`);

function stats(name: string, calls: Array<{ outcome: string; inputTokens?: number; outputTokens?: number; latencyMs?: number }>) {
  const ok = calls.filter(call => call.outcome === 'ok');
  const tokensIn = ok.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0);
  const tokensOut = ok.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0);
  const latencies = ok.map(call => call.latencyMs ?? 0).sort((a, b) => a - b);
  const outcomes = [...new Set(calls.map(call => call.outcome))].map(outcome => `${calls.filter(call => call.outcome === outcome).length} ${outcome}`).join(', ');
  console.log(`${name}: ${outcomes || 'no calls'}; tokens ${tokensIn} in / ${tokensOut} out; latency median ${latencies[Math.floor(latencies.length / 2)] ?? 0} ms, max ${latencies.at(-1) ?? 0} ms`);
}
console.log(`${moments.length} topics in ${seconds}s`);
stats('Segmentation', segmentation);
stats('Enrichment', enrichment);
for (const call of [...segmentation, ...enrichment]) if (call.error) console.log(`Error: ${call.error}`);

if (values.out) {
  await writeFile(values.out, JSON.stringify({ key, provider: provider.name, model: provider.model, prompts: [SEGMENTATION_PROMPT_VERSION, ENRICHMENT_PROMPT_VERSION], moments, summary: store.getRunningSummary(key), segmentation, enrichment }, null, 2));
  console.log(`Wrote ${values.out}`);
}
