import type { FastifyInstance } from 'fastify';
import { TeacherRequest } from '../../../../shared/contracts/readings.ts';
import type { ModelProvider } from '../../llm/index.ts';
import { explainPaper } from './service.ts';
import { generateReading, paperPdf } from './generate.ts';
import { findPaper } from '../../data/readings.ts';

/** Registers the paper reader routes. Mounted under /api by the app. */
export async function readingRoutes(app: FastifyInstance, { provider }: { provider: ModelProvider }) {
  app.get<{ Params: { paperId: string } }>('/readings/:paperId/pdf', async (request, reply) => {
    try { return reply.type('application/pdf').send(await paperPdf(request.params.paperId)); }
    catch { return reply.code(404).send({ error: 'Local PDF unavailable.' }); }
  });
  app.post<{ Params: { paperId: string } }>('/readings/:paperId/generate', async (request, reply) => {
    if (!findPaper(request.params.paperId)) return reply.code(404).send({ error: 'Paper not found.' });
    try { return await generateReading(request.params.paperId, provider, AbortSignal.timeout(120000)); }
    catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : 'Could not prepare this paper.' }); }
  });
  app.post<{ Params: { paperId: string } }>('/readings/:paperId/teacher', async (request, reply) => {
    const parsed = TeacherRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid question or selection.' });
    const controller = new AbortController();
    const onClose = () => { if (!reply.raw.writableEnded) controller.abort(); };
    reply.raw.on('close', onClose);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
    try {
      const result = await explainPaper(request.params.paperId, parsed.data, signal, provider);
      if (!result) return reply.code(404).send({ error: 'No prepared evidence exists for this paper. Open the original source.' });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Teacher unavailable.';
      request.log.warn({ paperId: request.params.paperId }, 'Teacher request failed');
      return reply.code(signal.aborted ? 504 : 503).send({ error: signal.aborted ? 'The teacher timed out or was cancelled. Please retry.' : message });
    } finally { reply.raw.off('close', onClose); }
  });
}
