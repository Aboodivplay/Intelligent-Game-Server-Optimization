import assert from 'node:assert/strict';
import { config } from '../config.js';

const origin = new URL(config.websiteUrl).origin;
const page = await fetch(config.websiteUrl);
assert.equal(page.status, 200);
assert.match(await page.text(), /<title>Intelligent Game Server Optimization<\/title>/);

// These checks use the browser's public key and never create an account or send email.
const auth = config.supabaseUrl + '/auth/v1';
const settings = await fetch(auth + '/settings', { headers: { apikey: config.publishableKey, Origin: origin } });
assert.equal(settings.status, 200);
assert.ok([origin, '*'].includes(settings.headers.get('access-control-allow-origin')));

const preflight = await fetch(auth + '/token?grant_type=password', {
  method: 'OPTIONS',
  headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'apikey,content-type' },
});
assert.ok(preflight.ok);
assert.ok([origin, '*'].includes(preflight.headers.get('access-control-allow-origin')));

const dashboard = await fetch(config.supabaseUrl + '/functions/v1/' + config.functionName + '/dashboard', {
  headers: { Origin: origin, apikey: config.publishableKey },
});
assert.equal(dashboard.status, 401);
assert.equal(dashboard.headers.get('access-control-allow-origin'), origin);
console.log('Pages and Auth responded. The workspace rejected a request without a session.');
