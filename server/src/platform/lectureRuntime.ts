import type { FastifyRequest } from 'fastify';
import { createMemoryStore } from '../features/lecture/store/memory.ts';
import { createLectureService } from '../features/lecture/service.ts';
import { createModelSegmenter } from '../features/lecture/segmentation/harness.ts';
import { createModelEnricher } from '../features/lecture/enrichment/harness.ts';
import type { LectureStore } from '../features/lecture/store/types.ts';
import type { ModelProvider } from '../llm/types.ts';
import type { LectureKey, TimelineSnapshotEvent } from '../../../shared/contracts/lecture.ts';
import { requireCourse, AccountError } from './auth.ts';
import type { PlatformRepository, SavedRun } from './repository.ts';

export function createUserLectureRuntimes(repository: PlatformRepository, provider: ModelProvider, onError: (error: unknown) => void = () => {}) {
  const runtimes = new Map<string, ReturnType<typeof build>>();
  function build(userId: string, kind: SavedRun['kind']) {
    const memory = createMemoryStore();
    const loaded = new Map<string, Promise<void>>();
    let writes = Promise.resolve();
    function checkpoint(key: LectureKey) {
      const snapshot = memory.snapshot(key);
      if (!snapshot.runId) return;
      const chunks=memory.getTranscriptRange(key,{from:0,to:Number.MAX_SAFE_INTEGER});
      const savedKind=kind==='study'?'study':chunks.length&&!chunks.some(chunk=>chunk.span.path.startsWith('microphone/'))?'replay':'live';
      const document: SavedRun = { _id: userId+'/'+snapshot.runId, userId, ...key, runId: snapshot.runId, kind:savedKind, snapshot,
        chunks, summary: memory.getRunningSummary(key), updatedAt:new Date() };
      writes = writes.catch(()=>{}).then(()=>repository.saveRun(document));
      void writes.catch(onError);
    }
    const store = new Proxy(memory, { get(target, property) {
      const method = target[property as keyof LectureStore];
      if (typeof method !== 'function') return method;
      if (!['reset','appendChunk','saveMoment','updateMoment','setRunningSummary','setSession','attachArtifact'].includes(String(property))) return method.bind(target);
      return (...args: unknown[]) => { const result = (method as (...args: unknown[]) => unknown).apply(target,args); checkpoint(args[0] as LectureKey); return result; };
    } });
    const service = createLectureService({ store,
      createSegmenter:()=>createModelSegmenter({provider}), createMicrophoneSegmenter:()=>createModelSegmenter({provider,minWords:20}),
      createEnricher:()=>createModelEnricher({provider,includeOpen:true}), onError });
    async function load(key: LectureKey) {
      const id=key.courseId+'/'+key.lectureId;
      if(kind==='study'){
        const latest=await repository.notes(key.courseId,key.lectureId);
        if(!latest)throw new AccountError(404,'Study notes are not prepared yet.');
        if(memory.getSession(key)?.runId!==latest.generationId)loaded.delete(id);
      }
      let pending=loaded.get(id);
      if(!pending){pending=(async()=>{
        if(kind==='study'){
          const notes=await repository.notes(key.courseId,key.lectureId);
          if(!notes) return;
          const saved=await repository.run(userId,notes.generationId);
          if(saved){memory.restore(key,saved);return;}
          const snapshot:TimelineSnapshotEvent={type:'timeline.snapshot',seq:1,runId:notes.generationId,moments:notes.moments,
            session:{runId:notes.generationId,state:'completed',elapsed:notes.moments.at(-1)?.time??0,words:650,interval:8,published:notes.chunks.length,total:notes.chunks.length}};
          memory.restore(key,{snapshot,chunks:notes.chunks,summary:notes.summary});checkpoint(key);
        }else{
          // A restarted server cannot keep recording a microphone. Preserve all data and mark the
          // saved run completed; a fresh capture gets a new run ID instead of overwriting it.
          const saved=await repository.latestRun(userId,key.courseId,key.lectureId);
          if(saved){
            if(saved.snapshot.session)saved.snapshot.session={...saved.snapshot.session,state:'completed'};
            saved.snapshot.moments=saved.snapshot.moments.map(moment=>['pending','none'].includes(moment.enrichment)?{...moment,enrichment:'failed'}:moment);
            memory.restore(key,saved);
          }
        }
      })();loaded.set(id,pending);pending.catch(()=>loaded.delete(id));}
      await pending;
    }
    return {store,service,load,flush:()=>writes,close:async()=>{service.close();await writes;}};
  }
  return {
    async resolve(request:FastifyRequest,kind:SavedRun['kind']='live') {
      const params=request.params as LectureKey;
      const user=await requireCourse(request,repository,params.courseId);
      const id=user.id+'/'+kind;
      let runtime=runtimes.get(id);if(!runtime){runtime=build(user.id,kind);runtimes.set(id,runtime);}
      await runtime.load(params);return runtime;
    },
    async close(){await Promise.all([...runtimes.values()].map(runtime=>runtime.close()));},
  };
}
export type UserLectureRuntimes=ReturnType<typeof createUserLectureRuntimes>;
export type LectureRuntime={store:LectureStore;service:ReturnType<typeof createLectureService>;flush?:()=>Promise<void>};
export type RuntimeResolver=(request:FastifyRequest)=>Promise<LectureRuntime>;
