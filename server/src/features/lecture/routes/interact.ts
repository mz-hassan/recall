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
import { randomUUID } from 'node:crypto';
import type { RuntimeResolver } from '../../../platform/lectureRuntime.ts';
import type { PlatformRepository } from '../../../platform/repository.ts';
import { requireCourse, AccountError } from '../../../platform/auth.ts';

const Params = z.object({ courseId: z.string().regex(/^[a-z0-9-]{1,40}$/i), lectureId: z.string().regex(/^[0-9]{1,4}$/) });

export async function interactRoutes(app: FastifyInstance, deps: { store: LectureStore; provider: ModelProvider; resolve?:RuntimeResolver; repository?:PlatformRepository }) {
  const {provider,repository}=deps,runtime=deps.resolve??(async()=>deps);
  registerChatFixture(provider);
  registerArtifactFixture(provider);
  const services=new WeakMap<LectureStore,ReturnType<typeof createArtifactService>>();
  function artifactService(store:LectureStore){let service=services.get(store);if(!service){service=createArtifactService({store,provider});services.set(store,service);}return service;}
  app.get('/lectures/:courseId/:lectureId/chat/history',async request=>{
    const key=Params.parse(request.params);await runtime(request);
    if(!repository)return {messages:[]};
    const user=await requireCourse(request,repository,key.courseId);
    const {runId}=z.object({runId:z.string().min(1)}).parse(request.query);
    return {messages:await repository.chats(user.id,key.courseId,key.lectureId,runId)};
  });
  app.post('/lectures/:courseId/:lectureId/chat', { bodyLimit: 16_384 }, async (request, reply) => {
    const cancellation = new AbortController();
    const abort = () => cancellation.abort();
    const disconnect = () => { if (!reply.raw.writableEnded) cancellation.abort(); };
    request.raw.once('aborted', abort);
    reply.raw.once('close', disconnect);
    try {
      const key = Params.parse(request.params);
      const input = ChatRequest.parse(request.body);
      const resolved=await runtime(request),store=resolved.store;
      const user=repository?await requireCourse(request,repository,key.courseId):undefined;
      if(repository&&user&&input.requestId){
        const previous=await repository.chat(user.id,input.requestId);
        if(previous){
          if(previous.courseId!==key.courseId||previous.lectureId!==key.lectureId||previous.runId!==input.runId||previous.request.question!==input.question||JSON.stringify(previous.request.context)!==JSON.stringify(input.context))throw new AccountError(409,'This question ID belongs to another request.');
          return previous.answer;
        }
      }
      const answer=await answerLectureQuestion({ key, request: input, store, provider,
        signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(60_000)]) });
      if(repository&&user)await repository.saveChat({_id:user.id+'/'+(input.requestId??randomUUID()),userId:user.id,...key,runId:input.runId,request:input,answer,createdAt:new Date()});
      if('flush' in resolved&&typeof resolved.flush==='function')await resolved.flush();
      return answer;
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
      const resolved=await runtime(request),store=resolved.store,artifacts=artifactService(store);
      if(repository){
        const user=await requireCourse(request,repository,key.courseId),saved=await repository.artifactRequest(user.id,input.runId,input.requestId);
        if(saved){
          if(saved.momentId!==input.momentId||saved.prompt!==input.prompt||saved.spec.kind!==input.kind)throw new AccountError(409,'This visual ID belongs to another request.');
          if(!store.getMoment(key,saved.momentId))throw new AccountError(404,'The source moment is unavailable.');
          store.attachArtifact(key,saved.momentId,{id:saved.id,kind:saved.spec.kind,title:saved.spec.title,url:request.url+'/'+saved.id});
          if('flush' in resolved&&typeof resolved.flush==='function')await resolved.flush();return saved;
        }
      }
      const artifact = await artifacts.create(key, input, AbortSignal.any([cancellation.signal, AbortSignal.timeout(60_000)]));
      if(repository){const user=await requireCourse(request,repository,key.courseId);await repository.saveArtifact(user.id,artifact);}
      if('flush' in resolved&&typeof resolved.flush==='function')await resolved.flush();
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
      const {store}=await runtime(request);
      if(repository){
        const user=await requireCourse(request,repository,key.courseId),saved=await repository.artifact(user.id,artifactId);
        if(saved){if(saved.runId!==runId||!store.getMoment(key,saved.momentId))throw new AccountError(404,'Visual not found in this session.');return saved;}
      }
      return artifactService(store).get(key, runId, artifactId);
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid artifact reference.' });
      if (error instanceof ArtifactRequestError || error instanceof ChatContextError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
}
