import { config } from './config.js';

// Sessions stay in memory. Closing or refreshing the page requires signing in
// again; passwords and refresh tokens are never written to browser storage.
let accessToken = '';
let refreshToken = '';
let expiresAt = 0;
let refreshRequest = null;
const EMAIL_PROOF_KEY = 'igso-email-proof';

async function emailProof(type) {
  // A short-lived PKCE verifier is not an account session or user information.
  // It binds an email link to the browser that requested it and prevents login
  // through a token supplied by someone else. It is removed after use.
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(48)), byte => byte.toString(16).padStart(2, '0')).join('');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  localStorage.setItem(EMAIL_PROOF_KEY, JSON.stringify({ verifier, type, created: Date.now() }));
  return { code_challenge: challenge, code_challenge_method: 's256' };
}

export const authConfigured = () => /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) && !!config.publishableKey;

export function clearSession() {
  accessToken = '';
  refreshToken = '';
  expiresAt = 0;
}

function acceptSession(result) {
  if (!result.access_token) return;
  accessToken = result.access_token;
  refreshToken = result.refresh_token || '';
  expiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
}

export async function authRequest(path, options = {}, token = '') {
  if (!authConfigured()) throw new Error('Account access is being configured. Please try again once setup is complete.');
  const response = await fetch(config.supabaseUrl + '/auth/v1' + path, {
    method: options.method || 'POST',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: {
      apikey: config.publishableKey,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Do not expose database errors, raw provider responses or account details.
    let message = 'Unable to complete this request. Please try again.';
    if (response.status === 429) message = 'Too many attempts. Wait a few minutes before trying again.';
    else if (path.startsWith('/token?grant_type=password')) message = 'Email or password is incorrect, or your email has not been confirmed.';
    else if (result.code === 'weak_password') message = 'Choose a longer, unique password with at least 12 characters.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return result;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.user_metadata?.name || 'Administrator' };
}

export async function authenticate(mode, fields) {
  const email = fields.email.trim().toLowerCase();
  const password = fields.password;
  const path = mode === 'signup' ? '/signup?redirect_to=' + encodeURIComponent(config.websiteUrl) : '/token?grant_type=password';
  const body = mode === 'signup' ? { email, password, data: { name: fields.name.trim() }, ...await emailProof('signup') } : { email, password };
  const result = await authRequest(path, { body });
  if (!result.access_token) {
    clearSession();
    return { confirmationRequired: true };
  }
  acceptSession(result);
  return { user: publicUser(result.user) };
}

export async function sessionToken() {
  if (!accessToken) return '';
  if (Date.now() < expiresAt - 60000) return accessToken;
  if (!refreshToken) { clearSession(); return ''; }
  if (!refreshRequest) {
    refreshRequest = authRequest('/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } })
      .then(acceptSession)
      .catch(() => clearSession())
      .finally(() => { refreshRequest = null; });
  }
  await refreshRequest;
  return accessToken;
}

export async function currentUser() {
  const token = await sessionToken();
  if (!token) return null;
  const user = await authRequest('/user', { method: 'GET' }, token);
  return publicUser(user);
}

export async function logout() {
  const token = accessToken;
  clearSession();
  if (token) await authRequest('/logout?scope=local', {}, token);
}

export async function sendPasswordReset(email) {
  await authRequest('/recover?redirect_to=' + encodeURIComponent(config.websiteUrl + '#reset-password'), {
    body: { email: email.trim().toLowerCase(), ...await emailProof('recovery') },
  });
}

export async function readEmailAction() {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const fragment = new URLSearchParams(location.hash.slice(1));
  // Refuse legacy implicit-token links. Sessions must come from a password
  // login or an email authorization code tied to this browser's proof key.
  if (fragment.has('access_token') || fragment.has('refresh_token')) {
    history.replaceState(null, '', url.pathname + '#login');
    return null;
  }
  if (fragment.has('error_code') || fragment.has('error')) {
    history.replaceState(null, '', url.pathname + '#login');
    return { linkError: true };
  }
  if (!code) return null;
  url.searchParams.delete('code');
  history.replaceState(null, '', url.pathname + url.search + '#login');
  let proof;
  try { proof = JSON.parse(localStorage.getItem(EMAIL_PROOF_KEY) || 'null'); }
  catch { proof = null; }
  localStorage.removeItem(EMAIL_PROOF_KEY);
  if (!proof || Date.now() - proof.created > 3600000) return { confirmed: true };
  try {
    const result = await authRequest('/token?grant_type=pkce', { body: { auth_code: code, code_verifier: proof.verifier } });
    acceptSession(result);
    const user = await currentUser();
    return { user, recovery: proof.type === 'recovery' };
  } catch { clearSession(); return null; }
}

export async function changePassword(password) {
  const token = await sessionToken();
  if (!token) throw new Error('This reset link expired. Request a new one.');
  await authRequest('/user', { method: 'PUT', body: { password } }, token);
  await logout();
}

export async function resendConfirmation(email) {
  await authRequest('/resend?redirect_to=' + encodeURIComponent(config.websiteUrl), {
    body: { type: 'signup', email: email.trim().toLowerCase() },
  });
}
