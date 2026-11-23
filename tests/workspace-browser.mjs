import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let throughId = 0;
    const entries = [{ id: '41', action: 'Server registered', detail: 'Paper', timestamp: '2026-11-20T10:00:00Z' }];

    // Only API responses are fixtures. The HTML, styles, artwork and controls are served from this checkout.
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'test', name: 'Student' } } });
      if (path === '/api/dashboard') return route.fulfill({ json: {
        servers: [], telemetry: [], audit: entries.map(row => ({ ...row, cleared: Number(row.id) <= throughId })),
      } });
      if (path === '/api/audit/clear' && route.request().method() === 'POST') {
        throughId = Number(route.request().postDataJSON().throughId);
        return route.fulfill({ json: { throughId: String(throughId) } });
      }
      return route.fulfill({ status: 404, json: { error: 'Unexpected test request' } });
    });

    await page.goto('http://127.0.0.1:4173/#minecraft');
    await page.getByRole('heading', { name: 'Server overview' }).waitFor();
    await page.locator('.connection-block').evaluate(image => image.decode());
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.fonts.check('24px VT323')));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.locator('.overworld-view').evaluate(el => getComputedStyle(el).animationName), 'none');

    await page.getByRole('button', { name: 'Remediation' }).click();
    const clear = page.getByRole('button', { name: 'Clear history', exact: true });
    await clear.click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    assert.equal(throughId, 0);
    await clear.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Clear history' }).click();
    await page.getByText('History cleared. New actions will appear here.').waitFor();
    assert.equal(throughId, 41);
    await page.getByRole('button', { name: 'Show cleared entries' }).click();
    await page.getByRole('cell', { name: 'Server registered', exact: false }).waitFor();

    entries.unshift({ ...entries[0], id: '42', action: 'Policy saved' });
    await page.reload();
    await page.getByRole('button', { name: 'Remediation' }).click();
    await page.getByRole('cell', { name: 'Policy saved', exact: true }).waitFor();
    assert.equal(await page.getByRole('cell', { name: 'Server registered', exact: false }).count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Workspace passed at ${width}px`);
  }
} finally {
  await browser.close();
}
