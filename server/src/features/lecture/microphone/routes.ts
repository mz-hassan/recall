import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { LectureService } from '../service.ts';
import { createSpeechDecoder, SpeechError, type SpeechDecoder } from './worker.ts';

const Params = z.object({ courseId: z.literal('cs50'), lectureId: z.literal('0') });
const Packet = z.object({ runId: z.uuid(), seq: z.number().int().positive(), time: z.number().nonnegative(), endTime: z.number().positive(),
  audio: z.string().min(60).max(1300000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).refine(packet => packet.endTime > packet.time && packet.endTime - packet.time <= 30);

async function localOnly(request: FastifyRequest) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip)) throw new SpeechError('Microphone capture is available only on this laptop.', 403);
  const host = request.headers.host ?? '';
  try {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL('http://' + host).hostname)) throw new Error('Nonlocal host');
  } catch { throw new SpeechError('Open microphone capture through localhost.', 403); }
  if (request.method !== 'GET' && request.headers['x-recall-microphone'] !== '1') throw new SpeechError('Use Recall microphone controls.', 403);
  const origin = request.headers.origin;
  if (origin) {
    let sameOrigin = false;
    try { sameOrigin = new URL(origin).host === host; } catch {}
    if (!sameOrigin) throw new SpeechError('Microphone requests must come from this Recall page.', 403);
  }
}

export async function microphoneRoutes(app: FastifyInstance, { service, decoder = createSpeechDecoder() }: { service: LectureService; decoder?: SpeechDecoder }) {
  app.addHook('onClose', async () => decoder.close());
  app.get('/speech/status', { preHandler: localOnly }, async () => decoder.status());
  app.post('/speech/warmup', { preHandler: localOnly }, async () => { await decoder.warmup(); return decoder.status(); });
  app.post('/lectures/:courseId/:lectureId/microphone', { preHandler: localOnly }, async request => {
    const key = Params.parse(request.params);
    await decoder.warmup();
    return service.startMicrophone(key);
  });
  // Explicit larger body limit applies only to local audio, never to model prompts.
  app.post('/lectures/:courseId/:lectureId/microphone/audio', { preHandler: localOnly, bodyLimit: 1350000 }, async request => {
    const key = Params.parse(request.params);
    const packet = Packet.parse(request.body);
    const session = service.microphone(key, packet.runId);
    const text = await decoder.transcribe(packet.audio);
    if (service.microphone(key, packet.runId) !== session) throw new SpeechError('The lecture session changed.', 409);
    // Audio recognition can continue while the serial topic pipeline catches up.
    session.accept({ ...packet, text }).catch(() => request.log.error('Microphone topic processing failed'));
    return { runId: packet.runId, seq: packet.seq, text, session: session.state() };
  });
  app.post('/lectures/:courseId/:lectureId/microphone/finish', { preHandler: localOnly }, async request => {
    const key = Params.parse(request.params);
    const { runId } = z.object({ runId: z.uuid() }).parse(request.body);
    const session = service.microphone(key, runId);
    await session.finish();
    return session.state();
  });
}
