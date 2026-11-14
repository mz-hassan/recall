import type { FastifyInstance } from 'fastify';
import type { LectureService } from './service.ts';
import type { LectureStore } from './store/types.ts';
import { streamRoutes } from './routes/stream.ts';

export { createLectureService } from './service.ts';
export { createMemoryStore } from './store/memory.ts';
export type { LectureStore } from './store/types.ts';

/** Registers every live lecture route. */
export async function lectureFeature(app: FastifyInstance, deps: { service: LectureService; store: LectureStore }) {
  await app.register(streamRoutes, deps);
  // Student-side routes (chat, artifacts) register here as one line: routes/interact.ts.
}
