import type { FastifyInstance } from 'fastify';
import type { ModelProvider } from '../../llm/index.ts';
import type { LectureService } from './service.ts';
import type { LectureStore } from './store/types.ts';
import { streamRoutes } from './routes/stream.ts';
import { enrichmentFixture } from './enrichment/fixture.ts';
import { ENRICHMENT_TASK } from './enrichment/schema.ts';
import { interactRoutes } from './routes/interact.ts';
import { segmentationFixture } from './segmentation/fixture.ts';
import { SEGMENTATION_TASK } from './segmentation/schema.ts';
import { microphoneRoutes } from './microphone/routes.ts';
import { coachingRoutes } from './microphone/coaching.ts';
import type { RuntimeResolver } from '../../platform/lectureRuntime.ts';
import type { PlatformRepository } from '../../platform/repository.ts';

export { createLectureService } from './service.ts';
export { createMemoryStore } from './store/memory.ts';
export { createModelSegmenter } from './segmentation/harness.ts';
export { createModelEnricher } from './enrichment/harness.ts';
export type { LectureStore } from './store/types.ts';

/** Registers every live lecture route. */
export async function lectureFeature(app: FastifyInstance, deps: { service: LectureService; store: LectureStore; provider: ModelProvider; decoder?: import('./microphone/worker.ts').SpeechDecoder; resolve?:RuntimeResolver;repository?:PlatformRepository }) {
  await app.register(streamRoutes, deps);
  await app.register(interactRoutes, deps);
  await app.register(microphoneRoutes, deps);
  await app.register(coachingRoutes, deps);
}

/** Gives the offline fixture provider deterministic answers for this feature's model tasks. */
export function registerLectureFixtures(provider: ModelProvider) {
  if ('register' in provider && typeof provider.register === 'function') {
    provider.register(SEGMENTATION_TASK, segmentationFixture);
    provider.register(ENRICHMENT_TASK, enrichmentFixture);
  }
}
