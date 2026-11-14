import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { DatasetError, datasetFilePath } from './dataset.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.png': 'image/png',
};

/**
 * GET /datasets/:courseId/<manifest path> serves a dataset file (slide PDFs, extracts), so moments
 * can link to the exact source page, e.g. .../slides.pdf#page=7. Read-only, limited to known types.
 */
export async function datasetRoutes(app: FastifyInstance) {
  app.get('/datasets/:courseId/*', async (request, reply) => {
    const { courseId, '*': relativePath } = request.params as { courseId: string; '*': string };
    const type = CONTENT_TYPES[path.extname(relativePath).toLowerCase()];
    if (!type) return reply.code(404).send({ error: 'Not found' });
    let file: string;
    try {
      file = datasetFilePath(courseId, relativePath);
      if (!(await stat(file)).isFile()) throw new DatasetError('Not a file');
    } catch {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.type(type).header('cache-control', 'private, max-age=3600').send(createReadStream(file));
  });
}
