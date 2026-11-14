import Fastify from 'fastify';
import { ZodError } from 'zod';
import { registerGraphRoutes } from './features/graph/routes.ts';
import { GraphError, type GraphService } from './features/graph/service.ts';

export function createApp(service: GraphService, providerConfigured = true) {
  const app = Fastify({ logger: true, bodyLimit: 16384 });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Invalid request.', details: error.issues });
    if (error instanceof GraphError) return reply.code(error.statusCode).send({ error: error.message });
    request.log.error(error);
    return reply.code(500).send({ error: 'Graph service unavailable. Check the API terminal and retry.' });
  });
  app.get('/api/health', async () => ({ ok: true }));
  registerGraphRoutes(app, service, providerConfigured);
  return app;
}
