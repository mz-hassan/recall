import { test, expect } from '@playwright/test';

test('saved login opens a CV note link directly and restores questions and doubt markers after refresh', async ({ page }) => {
  const user={id:'notes-user',email:'notes@example.edu',role:'student',courses:['cv']};
  const runId='6d49b6b4-144a-4a16-b792-4ed7a5358d7f';
  const moment={id:'cv/6/study/1',time:0,label:'00:00',title:'Image filtering',short:'Image filtering',type:'CONCEPT',summary:'A filter combines neighboring pixels to emphasize patterns.',quote:'An image filter combines nearby pixel values.',quoteTime:'00:00',intuition:'Each output pixel depends on a small neighborhood.',slides:[],equations:[],artifacts:[],graph:null,revision:1,status:'closed',enrichment:'ready',timeSource:'transcript',chunkSeqs:[1],sources:[{path:'recording.vtt',startTime:0,endTime:60}]};
  const snapshot={type:'timeline.snapshot',seq:1,runId,moments:[moment],session:{runId,state:'completed',elapsed:60,words:650,interval:8,published:1,total:1}};
  let doubts=[];
  page.on('pageerror',error=>{throw error;});
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let body;
    if(path==='/api/auth/session'){
      await new Promise(resolve=>setTimeout(resolve,100));body={user,database:true};
    }else if(path==='/api/courses/notes'){
      await new Promise(resolve=>setTimeout(resolve,200));body={lectures:[{courseId:'cv',lectureId:'6',title:'Image filtering',basis:'transcript',sources:[]}]};
    }else if(path==='/api/doubts'){
      if(route.request().method()==='PUT')doubts=[{...route.request().postDataJSON(),email:user.email,userId:user.id}];
      body={doubts};
    }else if(path.endsWith('/moments'))body=snapshot;
    else if(path.endsWith('/info'))body={title:'Image filtering',basis:'transcript',summary:'Local filters reveal image structure.'};
    else if(path.endsWith('/chat/history'))body={messages:[{_id:'saved-question',request:{question:'What does a filter do?'},answer:{answer:'It combines nearby pixel values.',citations:[{momentId:moment.id,title:moment.title,label:'00:00',time:0}]}}]};
    else if(path.endsWith('/events'))return route.fulfill({contentType:'text/event-stream',body:'event: timeline.snapshot\ndata: '+JSON.stringify(snapshot)+'\n\n'});
    else return route.continue();
    await route.fulfill({json:body});
  });
  // No browser profile is pre-seeded: the server cookie/session response supplies identity.
  await page.goto('/#lecture/cv/6');
  await expect(page.getByRole('link',{name:'Study notes ↗'})).toBeVisible();
  await expect(page).toHaveURL(/#lecture\/cv\/6$/);
  await page.getByRole('link',{name:'Study notes ↗'}).click();
  await page.locator('.moment.current').click();
  await expect(page.locator('.chunk-copy')).toHaveText(moment.summary);
  await expect(page.getByRole('button',{name:/Read transcript fallback/})).toHaveCount(0);
  await page.getByRole('button',{name:'? Mark as unclear',exact:true}).click();
  await expect(page.getByRole('button',{name:'✓ Marked unclear',exact:true})).toBeVisible();
  await page.reload();await page.locator('.moment.current').click();
  await expect(page.getByRole('button',{name:'✓ Marked unclear',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ask about this',exact:false}).click();
  await page.getByText('Saved questions (1)',{exact:true}).click();
  await page.getByText('What does a filter do?',{exact:true}).click();
  await expect(page.getByText('It combines nearby pixel values.',{exact:true})).toBeVisible();
});
