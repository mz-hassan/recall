import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ReplayOptions, type LectureKey, type TimelineEvent } from '../../../../../shared/contracts/lecture.ts';
import { LectureNotFoundError, SessionNotFoundError, type LectureService } from '../service.ts';
import type { LectureStore } from '../store/types.ts';
import type { RuntimeResolver } from '../../../platform/lectureRuntime.ts';

const Params = z.object({
  courseId: z.string().regex(/^[a-z0-9-]{1,40}$/i),
  lectureId: z.string().regex(/^[0-9]{1,4}$/),
});
const EventsQuery = z.object({ after: z.coerce.number().int().nonnegative().optional() });

const HEARTBEAT_MS = 15_000;

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof LectureNotFoundError || error instanceof SessionNotFoundError) {
    return reply.code(404).send({ error: error.message });
  }
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ error: 'Invalid request', issues: error.issues });
  }
  throw error;
}

/**
 * Timeline delivery for the live lecture page:
 *   POST /lectures/:courseId/:lectureId/session        start or restart a replay (body: ReplayOptions)
 *   POST /lectures/:courseId/:lectureId/session/play   resume publishing chunks
 *   POST /lectures/:courseId/:lectureId/session/pause  stop publishing chunks
 *   GET  /lectures/:courseId/:lectureId/session        current session state
 *   GET  /lectures/:courseId/:lectureId/moments        full current timeline (a snapshot)
 *   GET  /lectures/:courseId/:lectureId/events         server-sent TimelineEvents
 */
export async function streamRoutes(app: FastifyInstance, deps: { service: LectureService; store: LectureStore; resolve?: RuntimeResolver }) {
  const runtime=deps.resolve??(async()=>deps);
  const keyOf = (params: unknown): LectureKey => Params.parse(params);

  app.post('/lectures/:courseId/:lectureId/session', async (request, reply) => {
    try {
      const key = keyOf(request.params);
      const resolved=await runtime(request),{service}=resolved;
      const options = ReplayOptions.parse(request.body ?? {});
      const session=await service.startReplay(key, options);
      if ('flush' in resolved && typeof resolved.flush === 'function') await resolved.flush();
      return reply.code(201).send(session);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/lectures/:courseId/:lectureId/session/play', async (request, reply) => {
    try {
      const resolved=await runtime(request),session=resolved.service.play(keyOf(request.params));
      if ('flush' in resolved && typeof resolved.flush === 'function') await resolved.flush();
      return session;
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/lectures/:courseId/:lectureId/session/pause', async (request, reply) => {
    try {
      const resolved=await runtime(request),session=resolved.service.pause(keyOf(request.params));
      if ('flush' in resolved && typeof resolved.flush === 'function') await resolved.flush();
      return session;
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/lectures/:courseId/:lectureId/session', async (request, reply) => {
    try {
      const key = keyOf(request.params);
      const {service}=await runtime(request);
      const session = service.getSession(key);
      if (!session) throw new SessionNotFoundError(key);
      return session.state();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/lectures/:courseId/:lectureId/moments', async (request, reply) => {
    try {
      const key = keyOf(request.params);
      const {service,store}=await runtime(request);
      if (!store.getSession(key)&&!await service.hasTranscript(key)) throw new LectureNotFoundError(key);
      return store.snapshot(key);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/lectures/:courseId/:lectureId/events', async (request, reply) => {
    let key: LectureKey;
    let after: number | undefined;
    let store:LectureStore;
    try {
      key = keyOf(request.params);
      const resolved=await runtime(request);store=resolved.store;
      const lastEventId = request.headers['last-event-id'];
      after = EventsQuery.parse({ after: (request.query as { after?: string }).after ?? lastEventId }).after;
      if (!store.getSession(key)&&!await resolved.service.hasTranscript(key)) throw new LectureNotFoundError(key);
    } catch (error) {
      return sendError(reply, error);
    }

    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    response.write('retry: 2000\n\n');

    let lastSent = -1;
    const send = (event: TimelineEvent) => {
      if (event.seq <= lastSent && event.type !== 'timeline.snapshot') return;
      lastSent = event.seq;
      response.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    // Catch up first (a snapshot, or only the events this client missed), then stream live.
    const backlog = after === undefined ? 'too_old' : store.eventsAfter(key, after);
    if (backlog === 'too_old') send(store.snapshot(key));
    else {
      lastSent = after!;
      backlog.forEach(send);
    }
    const unsubscribe = store.subscribe(key, send);
    const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), HEARTBEAT_MS);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
