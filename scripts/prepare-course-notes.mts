import { loadConfig } from '../server/src/config.ts';
import { createProvider } from '../server/src/llm/index.ts';
import { loadManifest } from '../server/src/data/dataset.ts';
import { createPlatformRepository } from '../server/src/platform/repository.ts';
import { prepareEvidence, generatePreparedNotes } from '../server/src/features/lecture/prepared/generator.ts';

const config=loadConfig(), repository=createPlatformRepository(config.mongo), provider=createProvider(config.llm);
const courses=process.argv.slice(2).filter(value=>!value.startsWith('--'));
const force=process.argv.includes('--force');
const onlyLecture=process.argv.find(value=>value.startsWith('--lecture='))?.split('=')[1];
let failures=0;
try {
  await repository.connect();
  const jobs: {courseId:string;lectureId:string}[]=[];
  for(const courseId of courses.length?courses:['ai','cv']) for(const lecture of (await loadManifest(courseId)).lectures) {
    if(onlyLecture&&String(lecture.number)!==onlyLecture)continue;
    if([...lecture.transcript.files,...lecture.slides.files,...lecture.required.flatMap(item=>item.files),...lecture.optional.flatMap(item=>item.files)].some(file=>/\.(txt|vtt)$/.test(file))) jobs.push({courseId,lectureId:String(lecture.number)});
  }
  let next=0;
  await Promise.all([0,1].map(async()=>{
    while(next<jobs.length){const job=jobs[next++]!;
      try {
        const evidence=await prepareEvidence(job.courseId,job.lectureId);
        const existing=await repository.notes(job.courseId,job.lectureId);
        if(!force&&existing?.contentHash===evidence.contentHash){console.log(JSON.stringify({...job,status:'cached',topics:existing.moments.length}));continue;}
        const notes=await generatePreparedNotes(evidence,provider); await repository.saveNotes(notes);
        console.log(JSON.stringify({...job,status:'saved',basis:notes.basis,topics:notes.moments.length,title:notes.title}));
      }catch(error){failures++;const details=(error as {cause?:{metadata?:{validationFailures?:unknown}}})?.cause?.metadata?.validationFailures;console.error(JSON.stringify({...job,status:'failed',error:error instanceof Error?error.message:String(error),issues:details}));}
    }
  }));
  console.log(JSON.stringify({total:jobs.length,failures,database:config.mongo.database}));
}finally{await repository.close();}
if(failures)process.exitCode=1;
