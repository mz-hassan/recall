import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { Config } from './config.ts';
import { datasetRoutes } from './data/routes.ts';
import type { ModelProvider } from './llm/index.ts';
import {
  createLectureService, createMemoryStore, createModelEnricher, createModelSegmenter, lectureFeature, registerLectureFixtures,
  type LectureStore,
} from './features/lecture/index.ts';
import type { LectureService } from './features/lecture/service.ts';
import { readingsFeature, registerReadingsFixtures } from './features/readings/index.ts';
import { registerGraphRoutes, type GraphServiceSource } from './features/graph/routes.ts';
import { GraphError, type GraphService } from './features/graph/service.ts';

function baseApp(logger: boolean) {
  const app = Fastify({ logger, forceCloseConnections: true, bodyLimit: 16384 });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Invalid request.', details: error.issues });
    if (error instanceof GraphError) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
      && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'API unavailable. Check the server terminal and retry.' });
  });
  return app;
}

/** Focused graph app retained for its isolated API/browser tests. Production uses buildApp. */
export function createApp(service: GraphService, providerConfigured = true) {
  const app = baseApp(true);
  app.get('/api/health', async () => ({ ok: true }));
  registerGraphRoutes(app, service, providerConfigured);
  return app;
}

export type AppDependencies = {
  config: Config;
  provider: ModelProvider;
  logger?: boolean;
  lectureStore?: LectureStore;
  lectureService?: LectureService;
  graphService?: GraphServiceSource;
  graphProviderConfigured?: boolean;
};

/** One shared API; a missing graph database must not disable the live lecture service. */
export async function buildApp({
  config, provider, logger = false, lectureStore, lectureService,
  graphService = () => undefined, graphProviderConfigured = config.llm.provider === 'deepseek',
}: AppDependencies): Promise<FastifyInstance> {
  const app = baseApp(logger);
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
  registerGraphRoutes(app, graphService, graphProviderConfigured);
  return app;
}
