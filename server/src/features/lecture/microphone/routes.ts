import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { LectureService } from '../service.ts';
import { createSpeechDecoder, SpeechError, type SpeechDecoder } from './worker.ts';
import { requireCourse } from '../../../platform/auth.ts';
import type { PlatformRepository } from '../../../platform/repository.ts';
import type { RuntimeResolver } from '../../../platform/lectureRuntime.ts';

const Params = z.object({ courseId: z.literal('cs50'), lectureId: z.literal('0') });
const Packet = z.object({ runId: z.uuid(), seq: z.number().int().positive(), time: z.number().nonnegative(), endTime: z.number().positive(),
  audio: z.string().min(60).max(1300000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).refine(packet => packet.endTime > packet.time && packet.endTime - packet.time <= 30);

export async function microphoneRoutes(app: FastifyInstance, deps: {
  service: LectureService;
  decoder?: SpeechDecoder;
  resolve?: RuntimeResolver;
  repository?: PlatformRepository;
  remoteOrigin?: string;
}) {
  const decoder = deps.decoder ?? createSpeechDecoder();
  const runtime = deps.resolve ?? (async () => deps);
  async function allowCapture(request: FastifyRequest) {
    const host = request.headers.host ?? '';
    const localIp = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip);
    let localHost = false;
    try {
      localHost = ['localhost', '127.0.0.1', '[::1]'].includes(new URL('http://' + host).hostname);
    } catch { /* Reject malformed hosts below. */ }
    if (request.method !== 'GET' && request.headers['x-recall-microphone'] !== '1') {
      throw new SpeechError('Use Recall microphone controls.', 403);
    }
    const origin = request.headers.origin;
    if (localIp && localHost) {
      if (origin) {
        let sameOrigin = false;
        try { sameOrigin = new URL(origin).host === host; } catch {}
        if (!sameOrigin) throw new SpeechError('Microphone requests must come from this Recall page.', 403);
      }
      return;
    }
    if (!deps.repository || !deps.remoteOrigin?.startsWith('https://') || request.protocol !== 'https' ||
        deps.remoteOrigin !== 'https://' + host || (origin !== undefined && origin !== deps.remoteOrigin)) {
      throw new SpeechError('Open the configured HTTPS Recall address for microphone capture.', 403);
    }
    await requireCourse(request, deps.repository, 'cs50');
  }

  app.addHook('onClose', async () => decoder.close());
  app.get('/speech/status', { preHandler: allowCapture }, async () => decoder.status());
  app.post('/speech/warmup', { preHandler: allowCapture }, async () => { await decoder.warmup(); return decoder.status(); });
  app.post('/lectures/:courseId/:lectureId/microphone', { preHandler: allowCapture }, async request => {
    const key = Params.parse(request.params);
    const resolved=await runtime(request),{service}=resolved;
    await decoder.warmup();
    const session=await service.startMicrophone(key);
    if ('flush' in resolved && typeof resolved.flush === 'function') await resolved.flush();
    return session;
  });
  // Explicit larger body limit applies only to local audio, never to model prompts.
  app.post('/lectures/:courseId/:lectureId/microphone/audio', { preHandler: allowCapture, bodyLimit: 1350000 }, async request => {
    const key = Params.parse(request.params);
    const {service}=await runtime(request);
    const packet = Packet.parse(request.body);
    const session = service.microphone(key, packet.runId);
    const text = await decoder.transcribe(packet.audio);
    if (service.microphone(key, packet.runId) !== session) throw new SpeechError('The lecture session changed.', 409);
    // Audio recognition can continue while the serial topic pipeline catches up.
    session.accept({ ...packet, text }).catch(() => request.log.error('Microphone topic processing failed'));
    return { runId: packet.runId, seq: packet.seq, text, session: session.state() };
  });
  app.post('/lectures/:courseId/:lectureId/microphone/finish', { preHandler: allowCapture }, async request => {
    const key = Params.parse(request.params);
    const resolved=await runtime(request),service=resolved.service;
    const { runId } = z.object({ runId: z.uuid() }).parse(request.body);
    const session = service.microphone(key, runId);
    await session.finish();
    if('flush' in resolved&&typeof resolved.flush==='function')await resolved.flush();
    return session.state();
  });
}
