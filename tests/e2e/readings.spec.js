import { test, expect } from '@playwright/test';

// The library requires a signed-in student enrolled in the course; seed one the same way the lecture specs do.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('recall-course-profile')) sessionStorage.setItem('recall-course-profile', JSON.stringify({ email: 'test@example.edu', role: 'student', courseId: 'ai' }));
  });
});

async function openReader(page) {
  await page.goto('/#paper/ai/ai-dagger');
  await expect(page.getByRole('heading', { name: 'The paper, one idea at a time.' })).toBeVisible();
}
async function openPaper(page) {
  await page.getByRole('button', { name: 'Open paper', exact: true }).click();
  await expect(page.locator('.paper-highlights').first()).toBeVisible();
}
async function rendered(page, number) {
  await page.waitForFunction(n => { const el = document.querySelector(`[data-pdf-page="${n}"]`); return el && Math.abs(Number(el.dataset.renderedWidth) - el.getBoundingClientRect().width) < 1; }, number);
  await expect.poll(() => page.locator(`[data-pdf-page="${number}"] canvas`).evaluate(canvas => {
    if (!canvas.width || !canvas.height) return 0;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < pixels.length; i += 16) if (pixels[i] < 100 && pixels[i + 3] > 0) ink++;
    return ink;
  })).toBeGreaterThan(100);
  await expect(page.locator(`[data-pdf-page="${number}"] canvas`)).toBeVisible();
}
async function selectText(locator) {
  await locator.evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}
const diagram = { title: 'The DAgger loop', description: 'A conceptual teaching illustration.', nodes: [{ id: 'a', label: 'Roll out policy', passageId: 'algorithm' }, { id: 'b', label: 'Aggregate examples', passageId: 'aggregation' }], edges: [{ from: 'a', to: 'b', label: 'expert labels' }] };
async function mockTeacher(page, withDiagram = true) {
  const requests = [];
  await page.route('**/api/readings/*/teacher', async route => {
    const input = route.request().postDataJSON(); requests.push(input);
    await route.fulfill({ json: { requestId: input.requestId, blocks: [{ text: 'Keep all prior expert-labeled states when retraining.', citations: ['aggregation'] }], annotations: withDiagram ? [{ passageId: 'aggregation', kind: 'definition', explanation: 'Retain earlier data.' }] : [], diagrams: withDiagram ? [diagram] : [], provider: 'fixture', model: 'browser-test' } });
  });
  return requests;
}

test('outline is primary, headings are collapsed, and PDF loads only when opened', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let pdfRequests = 0; page.on('request', request => { if (request.url().endsWith('ai-02-reading.pdf')) pdfRequests++; });
  await page.goto('/#course/ai');
  await page.getByRole('link', { name: 'Papers', exact: true }).click();
  await page.locator('a[href="#paper/ai/ai-dagger"]').filter({ hasText: 'Read & explore' }).click();
  await expect(page.getByRole('heading', { name: 'The paper, one idea at a time.' })).toBeVisible();
  await expect(page.locator('.reading-outline details[open]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Explain', exact: true })).toHaveCount(0);
  await expect(page.locator('.paper-document')).toHaveCount(0);
  expect(pdfRequests).toBe(0);
  await page.screenshot({ path: 'test-results/dagger-outline.png' });
  await page.getByText('3. DAgger', { exact: true }).click();
  await page.getByText('Algorithm 3.1: the DAgger loop', { exact: true }).click();
  await page.getByRole('button', { name: 'View passage · p. 4' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Page number' })).toHaveValue('4');
  await rendered(page, 4);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('.paper-pdf-tools')).toContainText('110%');
  await rendered(page, 4);
  const scroll = await page.locator('.paper-scroll').evaluate(el => el.scrollTop);
  await page.getByRole('button', { name: 'Close paper', exact: true }).click();
  await expect(page.locator('.reading-paper')).toBeHidden();
  await openPaper(page);
  await expect(page.getByRole('spinbutton', { name: 'Page number' })).toHaveValue('4');
  expect(await page.locator('.paper-scroll').evaluate(el => el.scrollTop)).toBeCloseTo(scroll, 0);
  await expect(page.locator('.paper-pdf-tools')).toContainText('110%');
  await page.getByRole('button', { name: 'Highlights' }).click();
  await expect(page.locator('.paper-highlights')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('both side panels expand and resize without losing the PDF page', async ({ page }) => {
  await openReader(page); await openPaper(page);
  await page.getByRole('spinbutton', { name: 'Page number' }).fill('4');
  await rendered(page, 4);
  const original = (await page.locator('.reading-paper').boundingBox()).width;
  await page.getByRole('button', { name: 'Expand paper panel' }).click();
  const expanded = await page.locator('.reading-paper').boundingBox();
  expect(expanded.width).toBe(page.viewportSize().width);
  expect(expanded.height).toBe(page.viewportSize().height);
  expect(expanded.width).toBeGreaterThan(original + 100);
  await rendered(page, 4);
  await expect(page.getByRole('spinbutton', { name: 'Page number' })).toHaveValue('4');
  await page.getByRole('button', { name: 'Reduce paper panel' }).click();
  await page.getByRole('separator', { name: 'Resize paper panel' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('separator', { name: 'Resize paper panel' })).toHaveAttribute('aria-valuenow', '540');
  await page.getByRole('button', { name: 'Open chat', exact: true }).click();
  const chat = (await page.locator('.reading-teacher').boundingBox()).width;
  await page.getByRole('button', { name: 'Expand chat panel' }).click();
  const expandedChat = await page.locator('.reading-teacher').boundingBox();
  expect(expandedChat.width).toBe(page.viewportSize().width);
  expect(expandedChat.height).toBe(page.viewportSize().height);
  expect(expandedChat.width).toBeGreaterThan(chat + 50);
  await page.getByRole('button', { name: 'Reduce chat panel' }).click();
  const handle = await page.getByRole('separator', { name: 'Resize chat panel' }).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
  await page.mouse.down(); await page.mouse.move(handle.x + 70, handle.y + 100); await page.mouse.up();
  expect(Number(await page.getByRole('separator', { name: 'Resize chat panel' }).getAttribute('aria-valuenow'))).toBeLessThan(360);
  await rendered(page, 4);
  await expect(page.getByRole('spinbutton', { name: 'Page number' })).toHaveValue('4');
});

test('outline selection opens the paper and unified chat, and diagrams truly expand', async ({ page }) => {
  const requests = await mockTeacher(page);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await openReader(page);
  await page.getByText('3. DAgger', { exact: true }).click();
  await page.getByText('Algorithm 3.1: the DAgger loop', { exact: true }).click();
  await selectText(page.locator('[data-source-id="algorithm"] p'));
  await expect(page.getByRole('toolbar', { name: 'Selected text actions' })).toBeVisible();
  await page.getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByText('Keep all prior expert-labeled states when retraining.')).toBeVisible();
  expect(requests[0].context.passageId).toBe('algorithm');
  expect(requests[0].context.quote).toContain('Roll out the current policy');
  await rendered(page, 4);
  await expect(page.locator('.teacher-message.assistant .teaching-diagram')).toBeVisible();
  await page.getByRole('button', { name: 'Expand diagram', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'The DAgger loop' });
  await expect(modal).toBeVisible();
  expect((await modal.boundingBox()).width).toBe(page.viewportSize().width);
  expect((await modal.boundingBox()).height).toBe(page.viewportSize().height);
  await expect(modal.locator('.react-flow__node')).toHaveCount(2);
  for (const node of await modal.locator('.react-flow__node').all()) await expect(node).toBeInViewport();
  await page.screenshot({ path: 'test-results/dagger-diagram-expanded.png' });
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand diagram', exact: true })).toBeFocused();
  await expect(page.locator('.reading-teacher')).toBeVisible();
  await page.getByRole('button', { name: 'Expand diagram', exact: true }).click();
  await modal.locator('.react-flow__node').filter({ hasText: 'Aggregate examples' }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Page number' })).toHaveValue('4');
  await page.screenshot({ path: 'test-results/dagger-chat.png' });
  await page.getByRole('button', { name: 'Clear teaching aids' }).click();
  await expect(page.locator('.teaching-diagram')).toHaveCount(0);
  await expect(page.locator('.paper-highlight.temporary')).toHaveCount(0);
  await page.getByLabel('Message the paper teacher', { exact: true }).fill('A follow-up draft');
  await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  await page.getByRole('button', { name: 'Open chat', exact: true }).click();
  await expect(page.getByLabel('Message the paper teacher', { exact: true })).toHaveValue('A follow-up draft');
  await expect(page.getByText('Keep all prior expert-labeled states when retraining.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('chat works with PDF collapsed and simple answers need no diagram', async ({ page }) => {
  const requests = await mockTeacher(page, false);
  await openReader(page);
  await page.getByRole('button', { name: 'Open chat', exact: true }).click();
  await page.getByLabel('Message the paper teacher', { exact: true }).fill('What does aggregation mean?');
  await page.getByRole('button', { name: 'Send', exact: false }).click();
  await expect(page.getByText('Keep all prior expert-labeled states when retraining.')).toBeVisible();
  expect(requests[0].context).toBeNull();
  await expect(page.locator('.paper-document')).toHaveCount(0);
  await expect(page.locator('.teaching-diagram')).toHaveCount(0);
});

test('on-demand guide shows an indeterminate loading bar and recoverable error', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/readings/*/generate', async route => { await pending; await route.fulfill({ status: 503, json: { error: 'Guide unavailable.' } }); });
  await page.goto('/#papers/ai');
  await page.locator('.paper-card:not(.prepared) a.primary').first().click();
  await expect(page.getByRole('progressbar', { name: 'Preparing paper guide' })).toBeVisible();
  release();
  await expect(page.getByRole('alert')).toContainText('Guide unavailable.');
  await expect(page.getByRole('button', { name: 'Retry generation' })).toBeVisible();
});

test('PDF selection and annotation clicks expose a dismissible popup; failures retain context', async ({ page }) => {
  let request;
  await page.route('**/api/readings/*/teacher', route => { request = route.request().postDataJSON(); return route.fulfill({ status: 503, json: { error: 'Teacher unavailable. Please retry.' } }); });
  await openReader(page); await openPaper(page); await rendered(page, 1);
  await expect(page.locator('[data-pdf-page="1"] .textLayer span').first()).toBeVisible();
  await selectText(page.locator('[data-pdf-page="1"] .textLayer span').first());
  await expect(page.getByRole('button', { name: 'Explain', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Explain', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.getSelection().removeAllRanges());
  const highlight = page.locator('[data-pdf-page="1"] .paper-highlight').first();
  await highlight.scrollIntoViewIfNeeded();
  const box = await highlight.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Teacher unavailable');
  expect(request.context.passageId).toBe('motivation');
  await expect(page.locator('[data-pdf-page="1"] canvas')).toBeVisible();
  await expect(page.locator('.teacher-context')).toContainText('Your actions change your inputs');
});

test('missing PDF retains the outline and original-source fallback', async ({ page }) => {
  await page.route('**/pdfs/ai-02-reading.pdf', route => route.fulfill({ status: 404, body: 'Missing' }));
  await openReader(page);
  await page.getByRole('button', { name: 'Open paper', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('PDF could not be loaded');
  await expect(page.getByRole('heading', { name: 'The paper, one idea at a time.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open original' })).toHaveAttribute('href', /ross11a.pdf/);
});

test('mobile keeps outline readable and panels close without losing drafts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReader(page);
  await page.screenshot({ path: 'test-results/dagger-mobile-outline.png', fullPage: true });
  await page.getByRole('button', { name: 'Open chat', exact: true }).click();
  await expect(page.getByLabel('Message the paper teacher', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.reading-teacher')).toBeHidden();
  await openPaper(page);
  await page.getByRole('button', { name: 'Close paper', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The paper, one idea at a time.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // A course without papers shows an empty state. Enroll in it first: the library redirects students away from other courses.
  await page.evaluate(() => sessionStorage.setItem('recall-course-profile', JSON.stringify({ email: 'test@example.edu', role: 'student', courseId: 'cv' })));
  await page.reload();
  await page.goto('/#papers/cv');
  await expect(page.getByText('No assigned papers in this course yet.')).toBeVisible();
});
