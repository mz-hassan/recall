import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authRoutes, requireCourse, requireUser, AccountError } from './auth.ts';
import type { PlatformRepository } from './repository.ts';
import type { UserLectureRuntimes } from './lectureRuntime.ts';
import { streamRoutes } from '../features/lecture/routes/stream.ts';
import { interactRoutes } from '../features/lecture/routes/interact.ts';
import type { LectureStore } from '../features/lecture/store/types.ts';
import type { LectureService } from '../features/lecture/service.ts';
import type { ModelProvider } from '../llm/types.ts';
import { bookmarkRoutes } from '../features/bookmarks/routes.ts';
import { quizRoutes } from '../features/quizzes/routes.ts';
import { curatedTopics, CURATED_RUN } from '../features/quizzes/sources.ts';

export async function platformRoutes(app:FastifyInstance,{repository,runtimes,store,service,provider}:{repository:PlatformRepository;runtimes:UserLectureRuntimes;store:LectureStore;service:LectureService;provider:ModelProvider}){
  app.addHook('preHandler',async request=>{
    if(request.url.includes('/prepared/')&&request.method==='POST'&&request.url.includes('/session'))throw new AccountError(405,'Prepared study notes cannot be restarted as a replay.');
  });
  await app.register(authRoutes,{repository});
  await app.register(bookmarkRoutes, { repository, runtimes });
  await app.register(quizRoutes,{repository,runtimes,provider});
  app.get('/courses/notes',async()=>({lectures:await repository.notesCatalog()}));
  app.get('/account/runs',async request=>{
    const user=await requireUser(request,repository),query=z.object({courseId:z.string().optional()}).parse(request.query);
    return {runs:await repository.runs(user.id,query.courseId)};
  });
  app.get('/account/runs/:runId',async(request,reply)=>{
    const user=await requireUser(request,repository),{runId}=z.object({runId:z.string().min(1)}).parse(request.params);
    const run=await repository.run(user.id,runId);if(!run)return reply.code(404).send({error:'Saved lecture not found.'});return run;
  });
  const CourseId=z.string().regex(/^[a-z0-9-]{1,40}$/i);
  app.get('/account/lecture-titles',async request=>{
    const {courseId}=z.object({courseId:CourseId}).parse(request.query),user=await requireCourse(request,repository,courseId);
    return {titles:await repository.lectureTitles(user.id,courseId)};
  });
  app.put('/account/lecture-titles',async request=>{
    const input=z.object({courseId:CourseId,lectureId:z.string().regex(/^[0-9]{1,4}$/),title:z.string().trim().max(120)}).parse(request.body);
    const user=await requireCourse(request,repository,input.courseId);
    await repository.setLectureTitle(user.id,input.courseId,input.lectureId,input.title||null);
    return {lectureId:input.lectureId,title:input.title||null};
  });
  app.get('/doubts',async request=>{
    const query=z.object({courseId:z.string(),lectureId:z.string().optional()}).parse(request.query),user=await requireCourse(request,repository,query.courseId);
    const entries=await repository.doubts(query.courseId,query.lectureId,user.role==='student'?user.id:undefined);
    return {doubts:entries.map(entry=>({...entry,email:entry.userId===user.id?user.email:entry.userId}))};
  });
  app.put('/doubts',async request=>{
    const input=z.object({courseId:z.string(),lectureId:z.string(),runId:z.string().min(1),momentId:z.string().min(1),pastTopicId:z.string().optional(),unclear:z.boolean()}).parse(request.body);
    const user=await requireCourse(request,repository,input.courseId);
    request.params={courseId:input.courseId,lectureId:input.lectureId};
    if(input.runId===CURATED_RUN){
      if(!curatedTopics(input.courseId,input.lectureId).some(moment=>moment.id===input.momentId))throw new AccountError(404,'Curated topic not found.');
    }else{
      const note=await repository.notes(input.courseId,input.lectureId);
      const runtime=await runtimes.resolve(request,note?.generationId===input.runId?'study':'live');await runtime.flush();
      // A doubt must refer to a moment this user has actually received, including saved study notes.
      const run=await repository.run(user.id,input.runId);
      if(!run||run.courseId!==input.courseId||run.lectureId!==input.lectureId||!run.snapshot.moments.some(moment=>moment.id===input.momentId))throw new AccountError(404,'The lecture moment is not saved in your account.');
    }
    await repository.setDoubt({_id:[user.id,input.courseId,input.lectureId,input.runId,input.momentId].join('/'),userId:user.id,courseId:input.courseId,lectureId:input.lectureId,runId:input.runId,momentId:input.momentId,...(input.pastTopicId?{pastTopicId:input.pastTopicId}:{}),createdAt:new Date()},input.unclear);
    return {doubts:(await repository.doubts(input.courseId,input.lectureId,user.id)).map(entry=>({...entry,email:user.email}))};
  });
  await app.register(async prepared=>{
    const resolve=(request:Parameters<UserLectureRuntimes['resolve']>[0])=>runtimes.resolve(request,'study');
    prepared.get('/lectures/:courseId/:lectureId/info',async(request,reply)=>{
      const {courseId,lectureId}=z.object({courseId:z.string(),lectureId:z.string()}).parse(request.params);
      await requireCourse(request,repository,courseId);const notes=await repository.notes(courseId,lectureId);
      if(!notes)return reply.code(404).send({error:'Study notes are not prepared yet.'});
      return {title:notes.title,basis:notes.basis,summary:notes.summary,generationId:notes.generationId,createdAt:notes.createdAt,
        sources:notes.sources.map(({text:_,...source})=>source)};
    });
    prepared.get('/lectures/:courseId/:lectureId/sources/:sourceId',async(request,reply)=>{
      const {courseId,lectureId,sourceId}=z.object({courseId:z.string(),lectureId:z.string(),sourceId:z.string()}).parse(request.params);
      await requireCourse(request,repository,courseId);const notes=await repository.notes(courseId,lectureId),source=notes?.sources.find(item=>item.id===sourceId);
      if(!notes||!source)return reply.code(404).send({error:'Source not found.'});
      return reply.type('text/plain; charset=utf-8').send(notes.sources.filter(item=>item.path===source.path).map(item=>item.text).join('\n\n'));
    });
    await prepared.register(streamRoutes,{store,service,resolve});
    await prepared.register(interactRoutes,{store,provider,resolve,repository});
  },{prefix:'/prepared'});
}
