import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { requireCourse, requireUser } from './auth.ts';
import type { PlatformRepository } from './repository.ts';

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

export async function serveFrontend(app: FastifyInstance, dist: string, repository: PlatformRepository) {
  const root = await realpath(dist).catch(() => null);
  if (!root || !(await stat(path.join(root, 'index.html')).catch(() => null))?.isFile()) {
    throw new Error('Production build is missing. Run npm run build before npm start.');
  }

  app.get('/*', async (request, reply) => {
    let url: string;
    try {
      url = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      return reply.code(404).send();
    }
    if (url === '/api' || url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
    const candidate = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
    if (!candidate.startsWith(root + path.sep) || !types[path.extname(candidate)]) return reply.code(404).send();
    const file = await realpath(candidate).catch(() => null);
    if (!file?.startsWith(root + path.sep) || !(await stat(file).catch(() => null))?.isFile()) return reply.code(404).send();

    if (path.extname(file) === '.pdf') {
      const course = /^(ai|cv|cs50)-/.exec(path.basename(file))?.[1];
      if (course) await requireCourse(request, repository, course);
      else await requireUser(request, repository);
      reply.header('cache-control', 'private, no-store');
    }
    return reply.header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'same-origin')
      .type(types[path.extname(file)])
      .send(createReadStream(file));
  });
}
