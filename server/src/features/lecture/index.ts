import type { FastifyInstance } from 'fastify';
import type { ModelProvider } from '../../llm/index.ts';
import type { LectureService } from './service.ts';
import type { LectureStore } from './store/types.ts';
import { streamRoutes } from './routes/stream.ts';
import { segmentationFixture } from './segmentation/fixture.ts';
import { SEGMENTATION_TASK } from './segmentation/schema.ts';

export { createLectureService } from './service.ts';
export { createMemoryStore } from './store/memory.ts';
export { createModelSegmenter } from './segmentation/harness.ts';
export type { LectureStore } from './store/types.ts';

/** Registers every live lecture route. */
export async function lectureFeature(app: FastifyInstance, deps: { service: LectureService; store: LectureStore }) {
  await app.register(streamRoutes, deps);
  // Student-side routes (chat, artifacts) register here as one line: routes/interact.ts.
}

/** Gives the offline fixture provider deterministic answers for this feature's model tasks. */
export function registerLectureFixtures(provider: ModelProvider) {
  if ('register' in provider && typeof provider.register === 'function') {
    provider.register(SEGMENTATION_TASK, segmentationFixture);
  }
}
