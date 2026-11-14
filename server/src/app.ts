import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import { datasetRoutes } from './data/routes.ts';
import type { ModelProvider } from './llm/index.ts';
import {
  createLectureService, createMemoryStore, createModelEnricher, createModelSegmenter, lectureFeature, registerLectureFixtures,
  type LectureStore,
} from './features/lecture/index.ts';
import type { LectureService } from './features/lecture/service.ts';
import { readingsFeature, registerReadingsFixtures } from './features/readings/index.ts';

export type AppDependencies = {
  config: Config;
  provider: ModelProvider;
  logger?: boolean;
  /** Overridable for tests; defaults to in-memory storage with model-backed segmentation and enrichment. */
  lectureStore?: LectureStore;
  lectureService?: LectureService;
};

/**
 * Builds the API without starting it, so tests can call routes with app.inject().
 * Each feature registers its own routes as a plugin under /api; keep this file to wiring only.
 */
export async function buildApp({ provider, logger = false, lectureStore, lectureService }: AppDependencies): Promise<FastifyInstance> {
  // Open event streams must not keep the server alive on shutdown.
  const app = Fastify({ logger, forceCloseConnections: true });

  registerLectureFixtures(provider);
  registerReadingsFixtures(provider);
  const store = lectureStore ?? createMemoryStore();
  const service = lectureService ?? createLectureService({
    store,
    createSegmenter: () => createModelSegmenter({ provider, onCall: call => app.log.info({ segmentation: call }, 'segmentation') }),
    createEnricher: () => createModelEnricher({ provider, onCall: call => app.log.info({ enrichment: call }, 'enrichment') }),
    onError: error => app.log.error(error),
  });
  app.addHook('onClose', async () => service.close());

  await app.register(async api => {
    api.get('/health', async () => ({ ok: true, provider: provider.name, model: provider.model }));
    await api.register(datasetRoutes);
    await api.register(lectureFeature, { service, store, provider });
    await api.register(readingsFeature, { provider });
  }, { prefix: '/api' });

  return app;
}
