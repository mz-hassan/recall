import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ArtifactRequest, ChatRequest } from '../../../../../shared/contracts/lectureInteractions.ts';
import { ProviderError, type ModelProvider } from '../../../llm/types.ts';
import type { LectureStore } from '../store/types.ts';
import { ChatContextError } from '../chat/context.ts';
import { registerChatFixture } from '../chat/fixture.ts';
import { answerLectureQuestion } from '../chat/harness.ts';
import { registerArtifactFixture } from '../artifacts/fixture.ts';
import { ArtifactRequestError, createArtifactService } from '../artifacts/service.ts';

const Params = z.object({ courseId: z.string().regex(/^[a-z0-9-]{1,40}$/i), lectureId: z.string().regex(/^[0-9]{1,4}$/) });

export async function interactRoutes(app: FastifyInstance, { store, provider }: { store: LectureStore; provider: ModelProvider }) {
  registerChatFixture(provider);
  registerArtifactFixture(provider);
  const artifacts = createArtifactService({ store, provider });
  app.post('/lectures/:courseId/:lectureId/chat', { bodyLimit: 16_384 }, async (request, reply) => {
    const cancellation = new AbortController();
    const abort = () => cancellation.abort();
    const disconnect = () => { if (!reply.raw.writableEnded) cancellation.abort(); };
    request.raw.once('aborted', abort);
    reply.raw.once('close', disconnect);
    try {
      const key = Params.parse(request.params);
      const input = ChatRequest.parse(request.body);
      return await answerLectureQuestion({ key, request: input, store, provider,
        signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(60_000)]) });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid chat request.' });
      if (error instanceof ChatContextError) return reply.code(error.statusCode).send({ error: error.message });
      if (error instanceof ProviderError) return reply.code(503).send({ error: 'The lecture assistant is unavailable. Your transcript is still available; please retry.' });
      throw error;
    } finally {
      request.raw.removeListener('aborted', abort);
      reply.raw.removeListener('close', disconnect);
    }
  });
  app.post('/lectures/:courseId/:lectureId/artifacts', { bodyLimit: 16_384 }, async (request, reply) => {
    const cancellation = new AbortController();
    const disconnect = () => { if (!reply.raw.writableEnded) cancellation.abort(); };
    request.raw.once('aborted', disconnect);
    reply.raw.once('close', disconnect);
    try {
      const key = Params.parse(request.params);
      const input = ArtifactRequest.parse(request.body);
      const artifact = await artifacts.create(key, input, AbortSignal.any([cancellation.signal, AbortSignal.timeout(60_000)]));
      return reply.code(201).send(artifact);
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid artifact request.' });
      if (error instanceof ArtifactRequestError || error instanceof ChatContextError) return reply.code(error.statusCode).send({ error: error.message });
      if (error instanceof ProviderError) return reply.code(503).send({ error: 'Could not create this visual. Your lecture is still available; please retry.' });
      throw error;
    } finally {
      request.raw.removeListener('aborted', disconnect);
      reply.raw.removeListener('close', disconnect);
    }
  });
  app.get('/lectures/:courseId/:lectureId/artifacts/:artifactId', async (request, reply) => {
    try {
      const key = Params.parse(request.params);
      const { artifactId } = z.object({ artifactId: z.uuid() }).parse(request.params);
      const { runId } = z.object({ runId: z.string().min(1) }).parse(request.query);
      return artifacts.get(key, runId, artifactId);
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid artifact reference.' });
      if (error instanceof ArtifactRequestError || error instanceof ChatContextError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
}
