import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }, permissions: ['microphone'] });

test('CS50 microphone capture drives the timeline, grounded PDF highlights and progressive explanations', async ({ page, request }) => {
  test.setTimeout(60000);
  page.on('pageerror', error => { throw error; });
  const audioDestinations = [];
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('**/api/lectures/cs50/0/slide-coaching', async route => {
    const response = await route.fetch();
    const notes = await response.json();
    if (response.ok()) notes.spec.equations = [{ expression: 'n=2^b', explanation: 'Explicit equation rendering fixture.', variables: [{ symbol: 'n', definition: 'Number of representable values' }, { symbol: 'b', definition: 'Number of bits' }] }];
    await route.fulfill({ response, json: notes });
  });
  page.on('request', request => { if (request.url().includes('/microphone/audio')) audioDestinations.push(new URL(request.url()).origin); });
  await page.goto('/cs50.html', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Listen here. Follow the lecture.' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.pilot-pdf-host canvas')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /Start listening|Start new capture/ }).click();
  await expect(page.getByText('● Listening on this laptop', { exact: true })).toBeVisible();
  await expect(page.locator('#pilot-transcript')).toContainText('Binary search', { timeout: 25000 });
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  await expect(page.getByText('Microphone off', { exact: true })).toBeVisible();
  await expect(page.locator('.pilot-highlight').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.equation-variables>span').first().focus();
  await expect(page.getByRole('tooltip').first()).toBeVisible();
  await page.getByRole('button', { name: 'Animate explanation', exact: true }).click();
  await expect(page.locator('.pilot-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Fill next row', exact: true }).click();
  await expect(page.locator('.pilot-table tbody tr')).toHaveCount(2);
  await page.getByLabel('Slide page', { exact: true }).fill('2');
  await expect(page.getByLabel('Follow topic', { exact: true })).not.toBeChecked();
  const snapshot = await (await request.get('/api/lectures/cs50/0/moments')).json();
  expect(snapshot.session.state).toBe('completed');
  expect(snapshot.moments.every(moment => moment.sources.every(source => source.path.startsWith('microphone/')))).toBeTruthy();
  expect(audioDestinations.length).toBeGreaterThan(0);
  expect(new Set(audioDestinations)).toEqual(new Set(['http://127.0.0.1:4175']));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#pilot-transcript')).toContainText('Binary search');
  await expect(page.getByText('Microphone off', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
