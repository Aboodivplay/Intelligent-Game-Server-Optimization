import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = new URL('../session.js', import.meta.url);
const profile = { id: 'account-1', user_metadata: { name: 'Sam' }, factors: [] };

function session(token, user = profile, lifetime = 3600) {
  return { access_token: token, refresh_token: 'refresh-' + token, expires_in: lifetime, user };
}

// Each case gets a fresh in-memory session and an isolated Auth transport.
async function fixture(t, respond) {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const result = await respond(new URL(url), options);
    return Response.json(result.body, { status: result.status || 200 });
  });
  return import(moduleUrl.href + '?test=' + encodeURIComponent(t.name));
}

test('a network outage and incorrect credentials produce different messages', async t => {
  let online = false;
  const auth = await fixture(t, () => {
    if (!online) throw new TypeError('Failed to fetch');
    return { status: 400, body: { error_code: 'invalid_credentials' } };
  });
  const login = () => auth.authenticate('login', { email: 'sam@example.invalid', password: 'test' });
  await assert.rejects(login, /unreachable/);
  online = true;
  await assert.rejects(login, /incorrect/);
  assert.equal(await auth.sessionToken(), '');
});

test('only verified authenticators are offered and verification replaces the password session', async t => {
  const user = { ...profile, factors: [
    { id: 'phone', friendly_name: 'Phone', factor_type: 'totp', status: 'verified' },
    { id: 'pending', factor_type: 'totp', status: 'unverified' },
  ] };
  let challenges = 0;
  const auth = await fixture(t, (url, options) => {
    if (url.pathname.endsWith('/token')) return { body: session('first', user) };
    assert.equal(options.headers.Authorization, 'Bearer first');
    if (url.pathname.endsWith('/challenge')) return { body: { id: 'challenge-' + ++challenges } };
    assert.equal(url.pathname, '/auth/v1/factors/phone/verify');
    const { code, challenge_id } = JSON.parse(options.body);
    assert.equal(challenge_id, 'challenge-' + challenges);
    if (code !== '123456') return { status: 422, body: { error_code: 'mfa_verification_failed' } };
    return { body: session('verified', user) };
  });
  const result = await auth.authenticate('login', { email: 'sam@example.invalid', password: 'test' });
  assert.deepEqual(result.user.authenticators, [{ id: 'phone', name: 'Phone' }]);
  await assert.rejects(auth.verifyAuthenticator('phone', '000000'), /current six-digit code/);
  await auth.verifyAuthenticator('phone', '123456');
  assert.equal(await auth.sessionToken(), 'verified');
});

test('a late refresh cannot sign a user back in after logout', async t => {
  let finishRefresh;
  const auth = await fixture(t, (url) => {
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      return new Promise(resolve => { finishRefresh = resolve; });
    }
    if (url.pathname.endsWith('/logout')) return { body: {} };
    return { body: session('old', profile, 1) };
  });
  await auth.authenticate('login', { email: 'sam@example.invalid', password: 'test' });
  const refreshing = auth.sessionToken();
  await auth.logout();
  finishRefresh({ body: session('late') });
  assert.equal(await refreshing, '');
  assert.equal(await auth.sessionToken(), '');
});

test('signup without a display name sends no profile metadata or repeated password', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.data, {});
    assert.equal(body.email, 'sam@example.invalid');
    assert.equal(body.code_challenge_method, 's256');
    assert.ok(!('confirmPassword' in body));
    return Response.json({ id: profile.id });
  });
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() {} } });
  try {
    const auth = await import(moduleUrl.href + '?test=signup');
    const result = await auth.authenticate('signup', { email: ' SAM@example.invalid ', password: 'A test passphrase' });
    assert.deepEqual(result, { confirmationRequired: true });
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});

test('recovery uses the published URL and a localhost callback requires the original browser proof', async t => {
  const storage = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:{
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }});
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  const code = '00000000-0000-4000-8000-000000000001';
  const local = 'http://localhost:3000/?code=' + code;
  let exchanges = 0;
  const auth = await fixture(t,(url, options) => {
    if (url.pathname.endsWith('/recover')) {
      assert.equal(url.searchParams.get('redirect_to'), 'https://aboodivplay.github.io/Intelligent-Game-Server-Optimization/');
      assert.equal(JSON.parse(options.body).code_challenge_method,'s256');
      return {body:{}};
    }
    if (url.pathname.endsWith('/user')) return {body:profile};
    assert.equal(url.searchParams.get('grant_type'),'pkce');
    const body = JSON.parse(options.body);
    assert.equal(body.auth_code,code);
    assert.equal(body.code_verifier,JSON.parse(storage.get('igso-email-proof')).verifier);
    exchanges++;
    return {body:session('recovery')};
  });
  assert.ok((await auth.completeLocalEmailLink(local)).linkError);
  await auth.sendPasswordReset('sam@example.invalid');
  assert.ok((await auth.completeLocalEmailLink(local.replace('localhost','example.invalid'))).linkError);
  assert.equal(exchanges,0);
  assert.equal((await auth.completeLocalEmailLink(local)).recovery,true);
  assert.equal(exchanges,1);
  assert.equal(storage.size,0);
});
