import { test, expect } from '@playwright/test';

const base = '/api/lectures/ai/2';
const live = '/lecture.html?lecture=2&mode=live';
async function start(request, options = {}) {
  const response = await request.post(base + '/session', { data: { words: 160, interval: 8, limit: 12, ...options } });
  expect(response.status()).toBe(201);
  return response.json();
}
async function snapshot(request) { return (await request.get(base + '/moments')).json(); }
async function selected(page) { return page.locator('.moment.current').getAttribute('data-moment-id'); }
async function openFirst(page) {
  await page.locator('.time-axis button').first().click();
  await page.locator('.moment.current').click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('recall-course-profile', JSON.stringify({ email: 'test@example.edu', role: 'student', courseId: 'ai' }));
  });
  // Fail the browser test on runtime errors, rather than silently losing the stream.
  page.on('pageerror', error => { throw error; });
});

for (const interval of [0.05, 0.2]) {
  test(`replay at ${interval}s preserves ordered unique topics and resumes without duplicates`, async ({ page, request }) => {
    const run = await start(request, { interval, limit: 12 });
    await page.goto(live);
    await expect(page.locator('.moment')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Play simulated lecture', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Play simulated lecture', exact: true }).click();
    await expect(page.locator('.lecture-stream-status')).toContainText('Lecture complete');
    const saved = await snapshot(request);
    const ids = await page.locator('.moment').evaluateAll(nodes => nodes.map(node => node.dataset.momentId));
    expect(ids).toEqual(saved.moments.map(moment => moment.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(saved.moments.every((moment, index) => index === 0 || moment.time >= saved.moments[index - 1].time)).toBeTruthy();
    await page.getByRole('button', { name: 'Reconnect stream', exact: true }).click();
    await expect(page.locator('.moment')).toHaveCount(ids.length);
    await page.reload();
    await expect(page.locator('.moment')).toHaveCount(ids.length);
    expect((await (await request.get(base + '/session')).json()).runId).toBe(run.runId);
  });
}

test('an expanded older moment and its scroll stay put while live topics arrive', async ({ page, request }) => {
  await start(request, { interval: 0.2, limit: 60 });
  await page.goto(live);
  await page.getByRole('button', { name: 'Play simulated lecture', exact: true }).click();
  await expect.poll(() => page.locator('.moment').count()).toBeGreaterThanOrEqual(3);
  await openFirst(page);
  const id = await selected(page);
  const scroll = await page.locator('#detail').evaluate(element => { element.scrollTop = 70; return element.scrollTop; });
  expect(scroll).toBeGreaterThan(0);
  const count = await page.locator('.moment').count();
  await expect.poll(() => page.locator('.moment').count()).toBeGreaterThan(count);
  expect(await selected(page)).toBe(id);
  expect(await page.locator('#detail').evaluate(element => element.scrollTop)).toBe(scroll);
  await page.getByRole('button', { name: 'Pause simulated lecture', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play simulated lecture', exact: true })).toBeEnabled();
  const published = (await (await request.get(base + '/session')).json()).published;
  await page.waitForTimeout(450);
  expect((await (await request.get(base + '/session')).json()).published).toBe(published);
});

test('pending and missing notes leave the source readable without changing selection', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto(live + '&transport=fixture&interval=1');
  await expect(page.locator('.moment.current')).toContainText('Filling in notes');
  await page.locator('.moment.current').click();
  await expect(page.locator('.chunk-copy')).toContainText('we’re going to assume');
  const id = await selected(page);
  await page.getByRole('button', { name: 'Play simulated lecture', exact: true }).click();
  await page.clock.runFor(2100);
  expect(await selected(page)).toBe(id);
  await expect(page.locator('#detail')).not.toContainText('Filling in notes');
  await page.getByRole('button', { name: 'Read the source', exact: false }).click();
  await expect(page.locator('dialog blockquote')).toContainText('query the expert');
});

test('contextual chat cites real moments and survives a source jump', async ({ page, request }) => {
  await start(request, { start: 'instant', limit: 12 });
  await page.goto(live);
  await page.locator('.moment.current').click();
  await page.locator('.context-chat button').click();
  await page.getByRole('button', { name: 'What did I miss?', exact: true }).click();
  const response = page.waitForResponse(value => value.url().endsWith('/chat') && value.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  const answer = await (await response).json();
  await expect(page.locator('.lecture-chat-answer')).toContainText('Offline fixture answer');
  await page.locator('.lecture-chat-answer nav button').first().click();
  await expect(page.locator('.moment.current')).toHaveAttribute('data-moment-id', answer.citations[0].momentId);
  await expect(page.locator('.lecture-chat-answer')).toBeVisible();
  await page.getByLabel('Question context', { exact: true }).selectOption('moment');
  await page.getByLabel('Ask a question about this topic', { exact: true }).fill('Explain this moment');
  const selectedResponse = page.waitForResponse(value => value.url().endsWith('/chat'));
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  expect((await selectedResponse).request().postDataJSON().context.kind).toBe('moment');
});

test('requested chart and animation attach to the selected moment and survive reload', async ({ page, request }) => {
  await page.route('**/api/lectures/ai/2/artifacts/*?runId=*', async route => {
    const response = await route.fetch();
    const artifact = await response.json();
    if (artifact.spec.kind === 'chart') artifact.spec.equations = [
      { expression: 'T^2\\epsilon', explanation: 'Equation rendering fixture.' },
      { expression: '\\notarealcommand{', explanation: 'Invalid formulas retain readable raw text.' },
    ];
    await route.fulfill({ response, json: artifact });
  });
  await start(request, { start: 'instant', limit: 12 });
  await page.goto(live); await openFirst(page);
  const id = await selected(page);
  for (const kind of ['chart', 'animation']) {
    await page.getByRole('button', { name: 'Request an artifact', exact: true }).click();
    await page.getByLabel('Visual format', { exact: true }).selectOption(kind);
    await page.getByLabel('Describe the artifact', { exact: true }).fill(kind === 'chart' ? 'Chart the word counts of transcript chunks.' : 'Explain this moment as a sequence of ideas.');
    await page.getByRole('button', { name: 'Generate artifact', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Visual added' })).toBeVisible();
  }
  await expect(page.locator('.lecture-artifact-visual')).toHaveCount(2);
  await expect(page.locator('.lecture-artifact-visual .katex')).toHaveCount(1);
  await expect(page.locator('.lecture-artifact-visual .lecture-equation>div').last()).toHaveText('\\notarealcommand{');
  expect(await selected(page)).toBe(id);
  await page.getByRole('button', { name: 'Next animation step', exact: true }).click();
  await expect(page.locator('.lecture-animation-caption')).toContainText('Step 2');
  await page.reload(); await openFirst(page);
  await expect(page.locator('.lecture-artifact-visual')).toHaveCount(2);
  const saved = await snapshot(request);
  expect(saved.moments.find(moment => moment.id === id).artifacts).toHaveLength(2);
  expect(saved.moments.filter(moment => moment.id !== id).every(moment => moment.artifacts.length === 0)).toBeTruthy();
  await page.getByText('View chart data', { exact: true }).click();
  await expect(page.locator('.lecture-artifact-table table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
});

test('artifact errors are recoverable without losing a draft', async ({ page, request }) => {
  await start(request, { limit: 2 });
  await page.goto(live); await page.locator('.moment.current').click();
  await page.getByRole('button', { name: 'Request an artifact', exact: true }).click();
  await page.getByLabel('Describe the artifact', { exact: true }).fill('Chart transcript evidence.');
  await page.route('**/api/lectures/ai/2/artifacts', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Could not create this visual. Please retry.' }) }));
  await page.getByRole('button', { name: 'Generate artifact', exact: true }).click();
  await expect(page.locator('.lecture-artifact-request [role=alert]')).toContainText('Please retry');
  await expect(page.getByLabel('Describe the artifact', { exact: true })).toHaveValue('Chart transcript evidence.');
  await page.unroute('**/api/lectures/ai/2/artifacts');
  await page.getByRole('button', { name: 'Retry artifact', exact: true }).click();
  await expect(page.locator('.lecture-artifact-visual')).toHaveCount(1);
});

test('the original DAgger equation remains readable in past replay', async ({ page }) => {
  await page.goto('/lecture.html?lecture=2');
  await page.locator('.moment.current').click();
  await expect(page.locator('.lecture-equation')).toBeVisible();
  await expect(page.locator('.lecture-equation')).toContainText('Under the DAgger assumptions');
  // The authored fixture uses Unicode notation; its raw fallback remains readable.
  await expect(page.locator('.lecture-equation>div')).not.toBeEmpty();
});

test('enriched PDF slides show the cited page as an image and link to it in the dataset route', async ({ page, request }) => {
  const response = await request.post('/api/lectures/ai/3/session', { data: { start: 'instant', words: 160, limit: 6 } });
  expect(response.status()).toBe(201);
  await page.goto('/lecture.html?lecture=3&mode=live');
  await page.locator('.moment.current').click();
  const image = page.locator('.detail .slide-frame img').first();
  await expect(image).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => image.evaluate(element => element.naturalWidth)).toBeGreaterThan(0);
  const slide = page.locator('.detail .slide-source').first();
  await expect(slide).toHaveAttribute('href', /api\/datasets\/ai\/.*\.pdf#page=\d+/);
  const file = await request.get(await slide.getAttribute('href'));
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toContain('application/pdf');
});
