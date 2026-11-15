import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findLecture, readDatasetFile } from '../../data/dataset.ts';
import { AccountError, requireCourse, requireUser } from '../../platform/auth.ts';
import type { UserLectureRuntimes } from '../../platform/lectureRuntime.ts';
import type { PlatformRepository } from '../../platform/repository.ts';
import { buildPastTopics } from '../../../../src/lecture/pastTopics.js';

const key = z.string().min(1).max(100);
const target = z.object({ courseId: key, lectureId: key, runId: key.nullable(), momentId: z.string().min(1).max(300) });
type Dependencies = { repository: PlatformRepository; runtimes: UserLectureRuntimes };

export async function bookmarkRoutes(app: FastifyInstance, { repository, runtimes }: Dependencies) {
  app.get('/account/bookmarks', async request => {
    const user = await requireUser(request, repository);
    const filter = target.pick({ courseId: true, lectureId: true }).partial().parse(request.query);
    return { bookmarks: await repository.bookmarks(user.id, filter) };
  });

  app.get('/account/bookmarks/:id', async request => {
    const user = await requireUser(request, repository);
    const { id } = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).parse(request.params);
    const bookmark = await repository.bookmark(user.id, id);
    if (!bookmark || !user.courses.includes(bookmark.courseId)) throw new AccountError(404, 'Saved moment not found.');
    return { moment: bookmark.moment };
  });

  app.put('/account/bookmarks', async request => {
    const { saved, ...input } = target.extend({ saved: z.boolean() }).parse(request.body);
    const { courseId, lectureId, runId, momentId } = input;
    const user = await requireCourse(request, repository, courseId);
    const id = createHash('sha256').update(JSON.stringify([user.id, courseId, lectureId, runId, momentId])).digest('hex');
    if (!saved) {
      await repository.removeBookmark(user.id, id);
      return { saved: false };
    }

    let lectureTitle = 'Lecture ' + lectureId;
    let moment;
    if (runId) {
      const notes = await repository.notes(courseId, lectureId);
      if (notes?.generationId === runId) {
        lectureTitle = notes.title;
        moment = notes.moments.find(item => item.id === momentId);
      } else {
        request.params = { courseId, lectureId };
        const runtime = await runtimes.resolve(request);
        await runtime.flush();
        const run = await repository.run(user.id, runId);
        if (run?.courseId === courseId && run.lectureId === lectureId) {
          moment = run.snapshot.moments.find(item => item.id === momentId);
        }
      }
    } else {
      const lecture = await findLecture(courseId, lectureId).catch(error => {
        if (error?.code !== 'ENOENT') throw error;
        return undefined;
      });
      const path = lecture?.transcript.files.find(file => file.endsWith('.txt'));
      if (lecture && path) {
        lectureTitle = lecture.title;
        const topics = buildPastTopics({ id: lectureId, courseId, title: lecture.title }, await readDatasetFile(courseId, path));
        moment = topics.find(item => item.id === momentId);
      }
    }
    if (!moment) throw new AccountError(404, 'This lecture moment is not available in your account.');
    await repository.saveBookmark({
      _id: id, userId: user.id, ...input, title: moment.title, label: moment.label, lectureTitle, moment, savedAt: new Date(),
    });
    return { saved: true };
  });
}
