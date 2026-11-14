import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import type { ModelProvider } from './llm/index.ts';
import {
  createLectureService, createMemoryStore, createModelSegmenter, lectureFeature, registerLectureFixtures, type LectureStore,
} from './features/lecture/index.ts';
import type { LectureService } from './features/lecture/service.ts';

export type AppDependencies = {
  config: Config;
  provider: ModelProvider;
  logger?: boolean;
  /** Overridable for tests; defaults to in-memory storage and model-backed segmentation. */
  lectureStore?: LectureStore;
  lectureService?: LectureService;
};

/**
 * Builds the API without starting it, so tests can call routes with app.inject().
 * Each feature registers its own routes as a plugin under /api; keep this file to wiring only.
 */
export async function buildApp({ config, provider, logger = false, lectureStore, lectureService }: AppDependencies): Promise<FastifyInstance> {
  // Open event streams must not keep the server alive on shutdown.
  const app = Fastify({ logger, forceCloseConnections: true });

  registerLectureFixtures(provider);
  const store = lectureStore ?? createMemoryStore();
  const service = lectureService ?? createLectureService({
    store,
    createSegmenter: () => createModelSegmenter({ provider, onCall: call => app.log.info({ segmentation: call }, 'segmentation') }),
    onError: error => app.log.error(error),
  });
  app.addHook('onClose', async () => service.close());

  await app.register(async api => {
    api.get('/health', async () => ({
      ok: true,
      provider: provider.name,
      model: provider.model,
    }));
    await api.register(lectureFeature, { service, store });
  }, { prefix: '/api' });

  return app;
}
