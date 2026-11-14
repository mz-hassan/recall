import type { FastifyInstance } from 'fastify';
import type { ModelProvider } from '../../llm/index.ts';
import { readingsFixtures } from './fixture.ts';
import { GUIDE_TASK } from './generate.ts';
import { TEACHER_TASK } from './harness.ts';
import { readingRoutes } from './routes.ts';

/** Registers every paper reader route. */
export async function readingsFeature(app: FastifyInstance, deps: { provider: ModelProvider }) {
  await app.register(readingRoutes, deps);
}

/** Gives the offline fixture provider deterministic answers for this feature's model tasks. */
export function registerReadingsFixtures(provider: ModelProvider) {
  if ('register' in provider && typeof provider.register === 'function') {
    provider.register(TEACHER_TASK, readingsFixtures.teacher);
    provider.register(GUIDE_TASK, readingsFixtures.guide);
  }
}
