import { createServer as createHttpsServer, type ServerOptions as TlsOptions } from 'node:https';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { Config } from './config.ts';
import { findPaper } from './data/readings.ts';
import { completionSchema } from '../../shared/contracts/graph.ts';
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
import type { PlatformRepository } from './platform/repository.ts';
import { createUserLectureRuntimes } from './platform/lectureRuntime.ts';
import { platformRoutes } from './platform/routes.ts';
import { AccountError, requireCourse } from './platform/auth.ts';

function baseApp(logger: boolean, tls?: TlsOptions, trustLoopbackProxy = false) {
  const app = Fastify({
    logger, forceCloseConnections: true, bodyLimit: 16384,
    trustProxy: trustLoopbackProxy ? 'loopback' : false,
    ...(tls && { serverFactory: (handler: Parameters<typeof createHttpsServer>[1]) => createHttpsServer(tls, handler) }),
  });
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
  tls?: TlsOptions;
  provider: ModelProvider;
  logger?: boolean;
  lectureStore?: LectureStore;
  lectureService?: LectureService;
  speechDecoder?: import('./features/lecture/microphone/worker.ts').SpeechDecoder;
  repository?:PlatformRepository;
  graphService?: GraphServiceSource;
  graphProviderConfigured?: boolean;
};

/** One shared API; a missing graph database must not disable the live lecture service. */
export async function buildApp({
  config, provider, tls, logger = false, lectureStore, lectureService, speechDecoder,repository,
  graphService = () => undefined, graphProviderConfigured = config.llm.provider === 'deepseek',
}: AppDependencies): Promise<FastifyInstance> {
  const app = baseApp(logger, tls, config.deployment.trustLoopbackProxy);
  registerLectureFixtures(provider);
  registerReadingsFixtures(provider);
  const store = lectureStore ?? createMemoryStore();
  const service = lectureService ?? createLectureService({
    store,
    createSegmenter: () => createModelSegmenter({ provider, onCall: call => app.log.info({ segmentation: call }, 'segmentation') }),
    createMicrophoneSegmenter: () => createModelSegmenter({ provider, minWords: 20, onCall: call => app.log.info({ segmentation: call }, 'segmentation') }),
    createEnricher: () => createModelEnricher({ provider, includeOpen: true, onCall: call => app.log.info({ enrichment: call }, 'enrichment') }),
    onError: error => app.log.error(error),
  });
  app.addHook('onClose', async () => service.close());
  const runtimes=repository?createUserLectureRuntimes(repository,provider,error=>app.log.error(error)):undefined;
  if(runtimes)app.addHook('onClose',async()=>runtimes.close());
  await app.register(async api => {
    if (repository && config.deployment.origin) api.addHook('preHandler', async request => {
      if (!request.routeOptions.url?.startsWith('/api/readings/')) return;
      const { paperId } = request.params as { paperId: string };
      const paper = findPaper(paperId);
      if (!paper) throw new AccountError(404, 'Paper not found.');
      await requireCourse(request, repository, paper.courseId);
    });
    if (repository) api.addHook('preHandler', async request => {
      if (request.routeOptions.url === '/api/datasets/:courseId/*' && (request.params as {courseId:string}).courseId === 'cv') {
        await requireCourse(request, repository, 'cv');
      }
    });
    if (repository) api.addHook('preHandler', async request => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || !request.headers.origin) return;
      let sameOrigin = false;
      try {
        const origin = new URL(request.headers.origin);
        sameOrigin = config.deployment.origin
          ? origin.origin === config.deployment.origin
          : origin.host === request.headers.host;
      } catch {}
      if (!sameOrigin) throw new AccountError(403, 'Open this action in Recall.');
    });
    api.get('/health', async () => ({ ok: true, provider: provider.name, model: provider.model,accounts:repository?'database':'fixture' }));
    if(repository&&runtimes)await api.register(platformRoutes,{
      repository,runtimes,store,service,provider,staffInvite:config.deployment.staffInvite,
    });
    await api.register(datasetRoutes);
    await api.register(lectureFeature, { service, store, provider, decoder: speechDecoder,repository,remoteOrigin:config.deployment.origin,resolve:runtimes?(request=>runtimes.resolve(request)):undefined });
    await api.register(readingsFeature, { provider });
  }, { prefix: '/api' });
  if (repository && config.deployment.origin) app.addHook('preHandler', async request => {
    if (request.routeOptions.url !== '/api/graph/lecture-completed') return;
    if (request.headers.origin && request.headers.origin !== config.deployment.origin) {
      throw new AccountError(403, 'Open this action in Recall.');
    }
    const { courseId } = completionSchema.parse(request.body);
    const user = await requireCourse(request, repository, courseId);
    if (user.role === 'student') throw new AccountError(403, 'This action requires course staff.');
  });
  registerGraphRoutes(app, graphService, graphProviderConfigured);
  return app;
}
