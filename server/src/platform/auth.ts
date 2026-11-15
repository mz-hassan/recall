import { createHash, randomBytes, randomUUID, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { PlatformRepository, User } from './repository.ts';

declare module 'fastify' { interface FastifyRequest { recallUser?: User } }
export class AccountError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
const scrypt = promisify(derive);
const Credentials = z.object({ email: z.email().transform(value => value.toLowerCase()).refine(value => /^[^\s@]+@(?:[a-z0-9-]+\.)+edu$/.test(value), 'Use an academic email ending in .edu.'),
  role: z.enum(['student', 'instructor', 'ta']), password: z.string().min(8).max(128), courses: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/i)).max(100).optional() });
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenOf = (request: FastifyRequest) => request.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith('recall_session='))?.slice('recall_session='.length);
export async function identify(request: FastifyRequest, repository: PlatformRepository) { const token = tokenOf(request); return token ? repository.authenticate(hash(token)) : null; }
export async function requireUser(request: FastifyRequest, repository: PlatformRepository) {
  const user = request.recallUser ?? await identify(request, repository);
  if (!user) throw new AccountError(401, 'Sign in to save and open your lecture data.');
  request.recallUser = user;
  return user;
}
export async function requireCourse(request: FastifyRequest, repository: PlatformRepository, courseId: string) {
  const user = await requireUser(request, repository);
  if (!user.courses.includes(courseId)) throw new AccountError(403, 'Add this course to your account before opening its lecture data.');
  return user;
}
export async function authRoutes(app: FastifyInstance, { repository }: { repository: PlatformRepository }) {
  async function session(request: FastifyRequest, reply: FastifyReply, user: User) {
    const token = randomBytes(32).toString('base64url');
    await repository.saveAuth(hash(token), user.id, new Date(Date.now() + 7 * 86400000));
    reply.header('set-cookie', `recall_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${request.protocol === 'https' ? '; Secure' : ''}`);
    return { user };
  }
  app.get('/auth/session', async request => ({ user: await identify(request, repository), database: true }));
  app.post('/auth/signup', async (request, reply) => {
    const input = Credentials.parse(request.body), salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(input.password, salt, 64) as Buffer).toString('hex');
    const id = randomUUID();
    let user: User;
    try { user = await repository.createUser({ _id: id, id, email: input.email, role: input.role, courses: input.courses ?? [], salt, passwordHash, createdAt: new Date() }); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 11000) throw new AccountError(409, 'An account already exists. Sign in instead.'); throw error; }
    reply.code(201); return session(request, reply, user);
  });
  app.post('/auth/login', async (request, reply) => {
    const input = Credentials.parse(request.body), user = await repository.findUser(input.email, input.role);
    const actual = await scrypt(input.password, user?.salt ?? 'no-account', 64) as Buffer;
    if (!user || !timingSafeEqual(actual, Buffer.from(user.passwordHash, 'hex'))) throw new AccountError(401, 'The email or password does not match this account.');
    return session(request, reply, user);
  });
  app.post('/auth/logout', async (request, reply) => {
    const token = tokenOf(request); if (token) await repository.logout(hash(token));
    reply.header('set-cookie', 'recall_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return { ok: true };
  });
  app.post('/auth/courses', async request => {
    const user = await requireUser(request, repository);
    const { courseId } = z.object({ courseId: z.string().regex(/^[a-z0-9-]{1,40}$/i) }).parse(request.body);
    return { user: await repository.join(user.id, courseId) };
  });
}
