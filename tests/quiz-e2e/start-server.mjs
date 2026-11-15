import { createServer } from 'vite';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../server/src/app.ts';
import { loadConfig } from '../../server/src/config.ts';
import { createFixtureProvider } from '../../server/src/llm/fixture.ts';
import { createPlatformRepository } from '../../server/src/platform/repository.ts';

// Real persistence and HTTP routes, isolated from the developer's database and paid provider.
const mongo = await MongoMemoryServer.create({binary:{version:'8.0.17'}});
const repository = createPlatformRepository({uri:mongo.getUri(),database:'quiz-browser'});
const moments=['Pixels','Filtering','Image gradients'].map((title,index)=>({
  id:'cv/1/study/'+(index+1),title,short:title,type:index===2?'KEY CONCEPT':'CONCEPT',time:index*60,label:'0'+index+':00',
  summary:title+' connects local pixel values to image structure.',quote:title+': a local filter multiplies neighboring pixel values by kernel weights and adds the products to create an output value.',
  quoteTime:'Transcript',intuition:'',slides:[],equations:[],artifacts:[],graph:null,revision:1,status:'closed',enrichment:'ready',timeSource:'transcript',chunkSeqs:[index+1],sources:[{path:'fixture.vtt',startTime:index*60}],
}));
await repository.saveNotes({_id:'cv/1',courseId:'cv',lectureId:'1',title:'Images and kernels',basis:'transcript',generationId:randomUUID(),contentHash:'fixture',promptVersion:'fixture',provider:'fixture',model:'fixture',summary:'Local image processing.',moments,sources:[],chunks:moments.map((moment,index)=>({seq:index+1,time:moment.time,endTime:moment.time+60,timeSource:'transcript',span:moment.sources[0],text:moment.quote})),createdAt:new Date()});
const app=await buildApp({config:loadConfig({}),provider:createFixtureProvider(),repository});
await app.listen({host:'127.0.0.1',port:8792});
const web=await createServer({cacheDir:'.local/vite-quiz-e2e',server:{host:'127.0.0.1',port:4176,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:8792',changeOrigin:false}}}});
await web.listen();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await web.close();await app.close();await repository.close();await mongo.stop();process.exit(0);});
