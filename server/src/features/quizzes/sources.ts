import type { FastifyRequest } from 'fastify';
import type { QuizStart } from '../../../../shared/contracts/quizzes.ts';
import type { PlatformRepository, User } from '../../platform/repository.ts';
import type { UserLectureRuntimes } from '../../platform/lectureRuntime.ts';
import { AccountError } from '../../platform/auth.ts';
import { findLecture, readDatasetFile } from '../../data/dataset.ts';
import { demoMoments } from '../../../../src/lecture/fixtures/lecture02.js';
import { plain, type QuizTopic } from './planner.ts';

export const CURATED_RUN = 'curated:ai:2';
export function curatedTopics(courseId: string, lectureId: string): QuizTopic[] {
  if (courseId !== 'ai' || lectureId !== '2') throw new AccountError(404, 'This lecture has no curated timeline.');
  return [{ id:'ai/2/topic/1',title:'Lecture setup and expert policies',type:'LOGISTICS',summary:'',quote:'',equations:[] }, ...demoMoments.map(moment => ({ id: moment.id, title: moment.title, type: moment.type,
    summary: plain(moment.summary), quote: moment.quote, equations: moment.slides.flatMap((slide: {equationNotes?: {expression:string;explanation:string}[]}) => slide.equationNotes ?? []),
    aliases: [moment.id],
  }))];
}

export async function quizSource(request: FastifyRequest, input: QuizStart, user: User, repository: PlatformRepository, runtimes: UserLectureRuntimes) {
  const { courseId, lectureId } = request.params as {courseId: string; lectureId: string};
  let topics: QuizTopic[], runId: string | undefined, title = `Lecture ${lectureId}`;
  if (input.source === 'run') {
    if (!input.runId) throw new AccountError(400, 'Choose a saved lecture session.');
    const runtime = await runtimes.resolve(request); await runtime.flush();
    const run = await repository.run(user.id, input.runId);
    if (!run || run.courseId !== courseId || run.lectureId !== lectureId) throw new AccountError(404, 'Saved lecture not found in your account.');
    if (input.scope === 'lecture' && run.snapshot.session?.state !== 'completed') throw new AccountError(409, 'Finish this lecture before taking its whole-lecture quiz. Topic quizzes are available now.');
    topics = run.snapshot.moments; runId = run.runId;
  } else if (input.source === 'curated') {
    topics = curatedTopics(courseId, lectureId); title = 'Limitations of behavior cloning'; runId = CURATED_RUN;
    const lecture = await findLecture(courseId,lectureId), path = lecture?.transcript.files.find(file=>file.endsWith('.txt'));
    if(path){const words=(await readDatasetFile(courseId,path)).match(/\S+/g)??[];topics[0]!.quote=words.slice(0,Math.ceil(words.length*demoMoments[0]!.time/3660)).join(' ');}
  } else {
    const notes = await repository.notes(courseId, lectureId);
    if (input.source === 'notes' && notes) { topics = notes.moments; runId = notes.generationId; title = notes.title; }
    else {
      const lecture = await findLecture(courseId, lectureId);
      const path = lecture?.transcript.files.find(file => file.endsWith('.txt'));
      if (!lecture || !path) throw new AccountError(422, 'Prepare lecture notes or capture a transcript before taking a quiz.');
      const words = (await readDatasetFile(courseId, path)).match(/\S+/g) ?? [];
      const count = Math.min(words.length, 8 + ((Number(lectureId) * 7 + 2) % 5));
      topics = Array.from({ length: count }, (_, index) => ({ id: `${courseId}/${lectureId}/topic/${index + 1}`, title: `${lecture.title} · Part ${index + 1}`, summary: '', type: 'CONCEPT', equations: [],
        quote: words.slice(Math.floor(index * words.length / count), Math.floor((index + 1) * words.length / count)).join(' ') }));
      title = lecture.title;
    }
  }
  topics = topics.filter(topic => plain(topic.summary + ' ' + topic.quote).length >= 40);
  if (input.scope === 'topic') topics = topics.filter(topic => topic.id === input.momentId);
  if (!topics.length) throw new AccountError(422, 'This topic does not have enough saved lecture evidence for a quiz yet.');
  return { topics, runId, title: input.scope === 'topic' ? topics[0]!.title : title };
}
