import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { createApp } from '../server/src/app.ts';
import { GraphService } from '../server/src/features/graph/service.ts';
import { MemoryRepository, TestProvider, TestSource } from '../server/src/features/graph/testSupport.ts';

test('browser sees completion progress, graph additions, citations, filters, retries and mobile layout', { timeout: 90000 }, async () => {
  const repository = new MemoryRepository(), source = new TestSource(), provider = new TestProvider();
  const service = new GraphService(repository, source, provider);
  const app = createApp(service);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const vite = await createServer({ server: { host: '127.0.0.1', port: 5188, strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${address.port}` } } });
  await vite.listen();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('recall-course-profile', JSON.stringify({ email: 'test@example.edu', role: 'student', courseId: 'ai' }));
    });
    await page.goto('http://127.0.0.1:5188/#course/ai');
    await page.getByRole('link', { name: 'Knowledge graph' }).click();
    await page.getByRole('heading', { name: 'Your graph starts with a completed lecture.' }).waitFor();
    let release!: () => void;
    provider.beforeGenerate = () => new Promise<void>(resolve => { release = resolve; });
    await service.complete({ courseId: 'ai', lectureId: '1', revision: 1 });
    await page.getByText('Updating graph…', { exact: false }).waitFor();
    release(); provider.beforeGenerate = undefined; await service.idle();
    await page.getByRole('button', { name: 'Behavioral cloning 1 lecture', exact: true }).waitFor();
    await service.complete({ courseId: 'ai', lectureId: '3', revision: 1 }); await service.idle();
    await page.getByText(/Updated from lecture 3 · 1 new concepts/).waitFor();
    await page.getByRole('button', { name: 'Behavioral cloning 2 lectures', exact: true }).click();
    await page.getByRole('heading', { name: 'Summary', exact: true }).waitFor();
    assert.match(await page.locator('.cg-summary').innerText(), /Behavior/);
    assert.equal(await page.locator('.cg-sources').getAttribute('open'), null);
    assert.equal(await page.getByRole('link', { name: 'Behavior cloning ↗', exact: true }).isVisible(), false);
    await page.locator('.cg-sources > summary').click();
    const popupReady = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Behavior cloning ↗', exact: true }).click();
    const popup = await popupReady;
    await popup.waitForLoadState('domcontentloaded');
    assert.match(await popup.locator('body').innerText(), /expert demonstrations/);
    await popup.close();
    await page.getByRole('button', { name: 'Policy 2 lectures', exact: true }).click();
    assert.equal(await page.locator('.cg-sources').getAttribute('open'), null);
    await page.getByRole('button', { name: 'Behavioral cloning 2 lectures', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show only this concept and neighbors' }).check();
    await page.screenshot({ path: '/tmp/recall-graph-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('combobox', { name: /^Lecture/ }).selectOption('1');
    assert.equal(await page.getByRole('button', { name: 'Reinforcement learning 1 lecture', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForFunction(() => {
      const cy = (document.querySelector('.cg-canvas') as any)._cyreg.cy;
      if (cy.animated()) return false;
      (window as any).__searchCanvas = cy;
      (window as any).__searchStart = { zoom: cy.zoom(), pan: { ...cy.pan() } };
      return true;
    });
    await page.getByRole('searchbox').fill('RL');
    await page.getByRole('button', { name: 'Reinforcement learning 1 lecture', exact: true }).waitFor();
    await page.waitForFunction(() => {
      const cy = (document.querySelector('.cg-canvas') as any)._cyreg.cy;
      const start = (window as any).__searchStart;
      return cy.animated() && Math.abs(cy.pan('x') - start.pan.x) > 0.5;
    });
    const intermediate = await page.locator('.cg-canvas').evaluate((element: any) => {
      const cy = element._cyreg.cy;
      return { sameInstance: cy === (window as any).__searchCanvas, zoom: cy.zoom(), pan: cy.pan() };
    });
    assert.ok(intermediate.sameInstance);
    await page.waitForFunction(() => !(document.querySelector('.cg-canvas') as any)._cyreg.cy.animated());
    const finalPan = await page.locator('.cg-canvas').evaluate((element: any) => element._cyreg.cy.pan());
    assert.ok(Math.abs(intermediate.pan.x - finalPan.x) > 0.1, 'Search should move through intermediate viewport positions.');
    // A rapid change, no matches, and clearing the search must keep the canvas alive.
    await page.getByRole('searchbox').fill('no-matching-concept');
    await page.getByText('No concepts match these filters.').waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('searchbox').fill('RL');
    await page.getByRole('button', { name: 'Reinforcement learning 1 lecture', exact: true }).waitFor();
    assert.equal(await page.locator('.cg-canvas').evaluate((element: any) => element._cyreg.cy.animated()), false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    source.revise('3', 'Reinforcement learning learns a policy by maximizing a revised reward.'); provider.invalid = true;
    await service.complete({ courseId: 'ai', lectureId: '3', revision: 2 }); await service.idle();
    await page.getByText('Reinforcement learning: update failed', { exact: true }).waitFor();
    provider.invalid = false;
    await page.getByRole('button', { name: 'Retry update' }).click();
    await page.getByText(/Updated from lecture 3 · 0 new concepts/).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/recall-graph-mobile.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await vite.close(); await app.close(); await service.close(); }
});
