// Live segmentation evaluation: replays a lecture through the configured model and prints the topics.
// Usage: npm run eval:segmentation -- --lecture 2 [--chunks 20] [--words 160]
// Uses LLM_PROVIDER / LLM_MODEL / keys from .env (override inline, e.g. LLM_PROVIDER=deepseek npm run ...).
import { parseArgs } from 'node:util';
import { ReplayOptions } from '../../../../../shared/contracts/lecture.ts';
import { loadConfig } from '../../../config.ts';
import { createProvider } from '../../../llm/index.ts';
import { registerLectureFixtures } from '../index.ts';
import { formatLectureTime } from './passthrough.ts';
import { createLectureService } from '../service.ts';
import { createMemoryStore } from '../store/memory.ts';
import { createModelSegmenter, type SegmentationCall } from './harness.ts';
import { SEGMENTATION_PROMPT_VERSION } from './prompts/v2.ts';

const { values } = parseArgs({
  options: {
    course: { type: 'string', default: 'ai' },
    lecture: { type: 'string', default: '2' },
    chunks: { type: 'string' },
    words: { type: 'string', default: '160' },
  },
});

const config = loadConfig();
const provider = createProvider(config.llm);
registerLectureFixtures(provider);
const store = createMemoryStore();
const calls: SegmentationCall[] = [];
const service = createLectureService({
  store,
  createSegmenter: () => createModelSegmenter({ provider, onCall: call => calls.push(call) }),
  onError: error => console.error(error),
});
const key = { courseId: values.course, lectureId: values.lecture };
const options = ReplayOptions.parse({ start: 'instant', words: Number(values.words), ...(values.chunks && { limit: Number(values.chunks) }) });

console.log(`Segmenting ${key.courseId}/${key.lectureId} with ${provider.name} (${provider.model}), ${SEGMENTATION_PROMPT_VERSION}, ${options.words} words per chunk\n`);
const started = performance.now();
await service.startReplay(key, options);
service.close();

const moments = store.getMoments(key);
for (const [index, moment] of moments.entries()) {
  const words = moment.quote.split(/\s+/).length;
  console.log(`${String(index + 1).padStart(2)}. ${moment.label.padStart(6)}  ${moment.title}  [${moment.short}]  · ${moment.chunkSeqs.length} chunk(s), ${words} words`);
}

const by = (outcome: SegmentationCall['outcome']) => calls.filter(call => call.outcome === outcome);
const ok = by('ok');
const tokensIn = ok.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0);
const tokensOut = ok.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0);
const latencies = ok.map(call => call.latencyMs ?? 0).sort((a, b) => a - b);
console.log(`\n${moments.length} topics from ${store.getTranscriptRange(key, { from: 0, to: Infinity }).length} chunks in ${formatLectureTime((performance.now() - started) / 1000)} (mm:ss)`);
console.log(`Calls: ${ok.length} ok, ${by('skipped').length} skipped, ${by('fallback').length} fallback`);
if (ok.length) {
  console.log(`Tokens: ${tokensIn} in, ${tokensOut} out (avg ${Math.round(tokensIn / ok.length)} in / ${Math.round(tokensOut / ok.length)} out per call)`);
  console.log(`Latency: median ${latencies[Math.floor(latencies.length / 2)]} ms, max ${latencies.at(-1)} ms`);
}
for (const call of by('fallback')) console.log(`Fallback on chunk ${call.chunkSeq}: ${call.error}`);
