import type { FastifyInstance } from 'fastify';
import { completionSchema } from '../../../../shared/contracts/graph.ts';
import { z } from 'zod';
import { GraphError, type GraphService } from './service.ts';

const courseParams = z.object({ courseId: completionSchema.shape.courseId });
const sourceParams = courseParams.extend({ lectureId: completionSchema.shape.lectureId, sourceId: z.string().regex(/^[a-f0-9]{24}$/) });
export function registerGraphRoutes(app: FastifyInstance, service: GraphService, providerConfigured: boolean) {
  app.post('/api/graph/lecture-completed', async (request, reply) => {
    const job = await service.complete(completionSchema.parse(request.body));
    return reply.code(job.state === 'completed' ? 200 : 202).send({ job });
  });
  app.get('/api/courses/:courseId/graph', async request => {
    const { courseId } = courseParams.parse(request.params);
    let available;
    try { available = await service.source.list(courseId); }
    catch (error) { throw new GraphError(error instanceof Error ? error.message : 'Course source unavailable.', 404); }
    const [graph, jobs] = await Promise.all([service.repository.graph(courseId), service.repository.jobs(courseId)]);
    return { ...graph, jobs, availableLectures: available, providerConfigured };
  });
  app.get('/api/courses/:courseId/lectures/:lectureId/sources/:sourceId', async (request, reply) => {
    const { courseId, lectureId, sourceId } = sourceParams.parse(request.params);
    const { hash } = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/) }).parse(request.query);
    const lecture = await service.source.load(courseId, lectureId);
    const source = lecture.sources.find(item => item.id === sourceId);
    if (!source) throw new GraphError('Source no longer exists in the dataset.', 404);
    if (source.hash !== hash) throw new GraphError('Source has changed since this citation was indexed. Complete a new revision to refresh citations.');
    return reply.header('Content-Type', 'text/plain; charset=utf-8').header('X-Content-Type-Options', 'nosniff').send(source.text);
  });
}
