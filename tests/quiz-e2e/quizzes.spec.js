import { test, expect } from '@playwright/test';

for(const width of [1440,390])for(const scope of ['topic','lecture']){
  test(`${scope} MCQ quiz at ${width}px saves the first score and keeps retakes out of rankings`,async({page})=>{
    await page.setViewportSize({width,height:900});page.on('pageerror',error=>{throw error;});
    const signup=await page.request.post('/api/auth/signup',{data:{email:`quiz-${scope}-${width}-${Date.now()}@example.edu`,password:'browser-quiz-password',role:'student',courses:['cv']}});
    expect(signup.status()).toBe(201);
    if(scope==='topic'){
      await page.goto('/lecture.html?course=cv&lecture=1&view=notes');
      await page.locator('.moment.current').click();
      await page.getByRole('button',{name:'Take a topic quiz ↗',exact:true}).click();
    }else{
      await page.goto('/#lecture/cv/1');
      await page.getByRole('button',{name:'Take lecture quiz ↗',exact:true}).click();
    }
    const dialog=page.getByRole('dialog',{name:scope==='topic'?'Check this topic':'Check the whole lecture'});
    await dialog.getByRole('button',{name:'Start quiz',exact:true}).click();
    const quizModal=page.locator('.quiz-modal');
    await expect(quizModal.locator('.quiz-question').first()).toBeVisible();
    const count=await quizModal.locator('.quiz-question').count();
    expect(count).toBeGreaterThanOrEqual(scope==='topic'?2:8);expect(count).toBeLessThanOrEqual(scope==='topic'?10:15);
    await expect(quizModal.getByRole('button',{name:'Submit quiz',exact:true})).toBeDisabled();
    await page.screenshot({path:test.info().outputPath(`quiz-questions-${scope}-${width}.png`)});
    async function answerAndSubmit(){
      for(const fieldset of await quizModal.locator('.quiz-question').all())await fieldset.locator('input').first().check();
      const response=page.waitForResponse(response=>response.url().endsWith('/submit')&&response.request().method()==='POST');
      await quizModal.getByRole('button',{name:'Submit quiz',exact:true}).click();
      const result=await(await response).json();await expect(quizModal.locator('.quiz-score')).toBeVisible();return result;
    }
    const first=await answerAndSubmit();
    await page.screenshot({path:test.info().outputPath(`quiz-results-${scope}-${width}.png`)});
    expect(first.maxPoints).toBe(scope==='topic'?10:100);expect(first.firstAttempt).toBe(true);
    const initial=(await(await page.request.get('/api/courses/cv/leaderboard')).json()).yourEntry;
    expect(initial.points).toBe(first.result.points);
    await quizModal.getByRole('button',{name:'Practice again',exact:true}).click();
    await expect(quizModal.locator('.quiz-question').first()).toBeVisible();
    const practice=await answerAndSubmit();expect(practice.ranked).toBe(false);expect(practice.id).not.toBe(first.id);
    const after=(await(await page.request.get('/api/courses/cv/leaderboard')).json()).yourEntry;
    expect(after.points).toBe(initial.points);expect(after.quizzes).toBe(1);
    await quizModal.getByRole('button',{name:'This quiz leaderboard',exact:true}).click();
    await expect(quizModal.getByRole('table')).toBeVisible();await expect(quizModal.locator('.quiz-your-rank')).toContainText('Your rank');
    await quizModal.getByRole('button',{name:'Close quiz',exact:true}).click();
    await page.goto('/#leaderboard/cv');
    await expect(page.getByRole('table')).toBeVisible();await expect(page.locator('.quiz-is-you')).toContainText(first.result.points.toFixed(2));
    await page.reload();await expect(page.locator('.quiz-your-rank')).toContainText(first.result.points.toFixed(2));
    await page.screenshot({path:test.info().outputPath(`quiz-leaderboard-${scope}-${width}.png`)});
    // Reopening returns the original submitted quiz even after a practice run.
    const reopened=await page.request.post('/api/courses/cv/lectures/1/quizzes',{data:{scope,source:'notes',...(scope==='topic'?{momentId:first.questions[0].topicId}:{}),requestId:crypto.randomUUID()}});
    expect((await reopened.json()).id).toBe(first.id);
  });
}
