import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Sample both halves of the animation and the instant a new cycle starts.
async function checkPan(element) {
  const positions = await element.evaluate(node => {
    const animation = node.getAnimations()[0];
    const duration = animation.effect.getTiming().duration;
    animation.pause();
    const points = [0, .25, .5, .75, .999, 1, 1.001].map(fraction => {
      animation.currentTime = fraction * duration;
      return new DOMMatrix(getComputedStyle(node).transform).m41;
    });
    animation.play();
    return points;
  });
  const [start, outbound, left, inbound, before, end, after] = positions;
  assert.ok(start > outbound && outbound > left && left < inbound && inbound < end);
  assert.ok(Math.abs(start - end) < .1 && Math.abs(before - after) < .1);
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const login = await browser.newPage();
  await login.route('**/api/auth/me', route => route.fulfill({json:{user:null}}));
  await login.route('**/auth/v1/resend?**', route => route.fulfill({json:{}}));
  await login.route('**/auth/v1/recover?**', route => route.fulfill({json:{}}));
  await login.goto('http://127.0.0.1:4173/#login');
  await login.getByLabel('Email address').fill('owner@example.invalid');
  await login.getByRole('button',{name:'Resend confirmation'}).click();
  await login.getByText(/If confirmation is needed/).waitFor();
  await login.getByRole('button',{name:'Forgot password?'}).click();
  await login.getByRole('dialog').getByLabel('Email address').fill('owner@example.invalid');
  await login.getByRole('button',{name:'Send reset link'}).click();
  await login.getByText(/If this account exists/).waitFor();
  assert.equal(await login.locator('#local-email-link').count(),0);
  await login.close();
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let throughId = 0;
    let dashboardFailure = '';
    const entries = [{ id: '41', action: 'Server registered', detail: 'Forge', timestamp: '2026-11-20T10:00:00Z' }];

    // Only API responses are fixtures. The HTML, styles, artwork and controls are served from this checkout.
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'test', name: 'Student' } } });
      if (path === '/api/dashboard' && dashboardFailure === 'network') return route.abort('internetdisconnected');
      if (path === '/api/dashboard' && dashboardFailure === 'server') return route.fulfill({ status: 500, json: { error: 'The service could not complete this request.' } });
      if (path === '/api/dashboard') return route.fulfill({ json: {
        servers: [], telemetry: [], audit: entries.map(row => ({ ...row, cleared: Number(row.id) <= throughId })),
      } });
      if (path === '/api/audit/clear' && route.request().method() === 'POST') {
        throughId = Number(route.request().postDataJSON().throughId);
        return route.fulfill({ json: { throughId: String(throughId) } });
      }
      return route.fulfill({ status: 404, json: { error: 'Unexpected test request' } });
    });

    await page.goto('http://127.0.0.1:4173/#home');
    const scene = page.locator('.home-panorama');
    await scene.evaluate(img => img.decode());
    await page.getByRole('heading', { name: 'Under development' }).waitFor();
    assert.equal(await page.locator('#development details').count(), 4);
    assert.equal(await page.locator('.block-slots img').count(), 3);
    await page.locator('.block-slots img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    assert.doesNotMatch(await scene.evaluate(el => getComputedStyle(el).cursor), /crosshair.png/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await checkPan(scene);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('http://127.0.0.1:4173/#minecraft');
    await page.getByRole('heading', { name: 'Server overview' }).waitFor();
    await page.locator('.connection-block').evaluate(image => image.decode());
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.fonts.check('24px VT323')));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.locator('.overworld-view').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const panorama = page.locator('.overworld-view');
    await checkPan(panorama);
    if (await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)) {
      assert.match(await panorama.evaluate(el => getComputedStyle(el).cursor), /crosshair\.png/);
      assert.match(await page.locator('#connect-server').evaluate(el => getComputedStyle(el).cursor), /pickaxe-cursor\.png/);
    }
    if (width === 1440) {
      const original = await panorama.elementHandle();
      dashboardFailure = 'server';
      await page.getByText('The server returned HTTP 500.', { exact: false }).waitFor();
      dashboardFailure = 'network';
      await page.getByRole('button', { name: 'Try again' }).click();
      await page.getByText('The workspace service is unreachable.', { exact: false }).waitFor();
      dashboardFailure = '';
      await page.getByRole('button', { name: 'Try again' }).click();
      await page.getByRole('heading', { name: 'Server overview' }).waitFor();
      assert.ok(await original.evaluate(el => el === document.querySelector('.overworld-view')));
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.locator('#connect-server').click();
    assert.deepEqual(await page.locator('#server-loader option').evaluateAll(options => options.map(option => option.value)), ['', 'Forge', 'Fabric']);
    assert.deepEqual(await page.locator('#minecraft-version option').evaluateAll(options => options.map(option => option.value)), [
      '',
      '1.20.1', '1.20.2', '1.20.3', '1.20.4', '1.20.5', '1.20.6',
      '1.21', '1.21.1', '1.21.2', '1.21.3', '1.21.4', '1.21.5',
      '1.21.6', '1.21.7', '1.21.8', '1.21.9', '1.21.10', '1.21.11',
      '26.1', '26.1.1', '26.1.2', '26.2', '26.3',
    ]);
    await page.getByRole('button', { name: 'Cancel' }).click();
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
