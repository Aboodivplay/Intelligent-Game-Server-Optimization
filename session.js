import { config } from './config.js?v=accounts-20261120';

// Sessions stay in memory. Closing or refreshing the page requires signing in
// again; passwords and refresh tokens are never written to browser storage.
let accessToken = '';
let refreshToken = '';
let expiresAt = 0;
let refreshRequest = null;
let sessionVersion = 0;
const EMAIL_PROOF_KEY = 'igso-email-proof';

async function emailProof(type) {
  // A short-lived PKCE verifier is not an account session or user information.
  // It binds an email link to the browser that requested it and prevents login
  // through a token supplied by someone else. It is removed after use.
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(48)), byte => byte.toString(16).padStart(2, '0')).join('');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  try {
    localStorage.setItem(EMAIL_PROOF_KEY, JSON.stringify({ verifier, type, created: Date.now() }));
  } catch {
    throw new Error('Allow site storage in this browser so it can verify your email link.');
  }
  return { code_challenge: challenge, code_challenge_method: 's256' };
}

export const authConfigured = () => /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) && !!config.publishableKey;

export function clearSession() {
  sessionVersion++;
  refreshRequest = null;
  accessToken = '';
  refreshToken = '';
  expiresAt = 0;
}

function acceptSession(result) {
  if (!result.access_token || !result.user?.id) throw new Error('The account service returned an incomplete session. Please sign in again.');
  accessToken = result.access_token;
  refreshToken = result.refresh_token || '';
  expiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
}

export async function authRequest(path, options = {}, token = '') {
  if (!authConfigured()) throw new Error('Account access is being configured. Please try again once setup is complete.');
  let response;
  let result;
  try {
    response = await fetch(config.supabaseUrl + '/auth/v1' + path, {
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
    result = await response.json().catch(() => null);
  } catch {
    throw new Error('The account service is unreachable. Check your connection and try again in a moment.');
  }
  if (!response.ok) {
    // Do not expose database errors, raw provider responses or account details.
    let message = 'Unable to complete this request. Please try again.';
    const code = result?.error_code || result?.code;
    if (response.status >= 500) message = 'The account service is temporarily unavailable. Try again shortly.';
    else if (response.status === 429) message = 'Too many attempts. Wait a few minutes before trying again.';
    else if (path.startsWith('/token?grant_type=password')) message = 'Email or password is incorrect, or your email has not been confirmed.';
    else if (code === 'mfa_verification_failed' || code === 'mfa_challenge_expired') message = 'Enter the current six-digit code from your authenticator.';
    else if (code === 'email_address_not_authorized') message = 'The project email sender cannot deliver to this address. Contact the project administrator.';
    else if (code === 'mfa_factor_name_conflict') message = 'Choose a different name for this authenticator.';
    else if (code === 'weak_password') message = 'Choose a longer, unique password with at least 12 characters.';
    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    throw error;
  }
  if (!result && response.status !== 204 && response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('The account service is temporarily unavailable. Try again shortly.');
  }
  return result || {};
}

function publicUser(user) {
  const factors = (user.factors || []).filter(factor => factor.status === 'verified' && factor.factor_type === 'totp');
  return {
    id: user.id,
    name: user.user_metadata?.name || 'Server owner',
    email: user.email,
    authenticators: factors.map(({ id, friendly_name }) => ({ id, name: friendly_name || 'Authenticator' })),
  };
}

export async function authenticate(mode, fields) {
  const email = fields.email.trim().toLowerCase();
  const password = fields.password;
  const signup = mode === 'signup';
  const path = signup ? '/signup?redirect_to=' + encodeURIComponent(config.websiteUrl) : '/token?grant_type=password';
  const body = { email, password };
  if (signup) {
    const name = fields.name?.trim();
    body.data = name ? { name } : {};
    Object.assign(body, await emailProof('signup'));
  }
  const result = await authRequest(path, { body });
  if (!result.access_token) {
    if (mode !== 'signup' || !result.id && !result.user?.id) throw new Error('Sign-in could not be completed. Please try again.');
    clearSession();
    return { confirmationRequired: true };
  }
  clearSession();
  acceptSession(result);
  return { user: publicUser(result.user) };
}

export async function sessionToken() {
  if (!accessToken) return '';
  if (Date.now() < expiresAt - 60000) return accessToken;
  if (!refreshToken) { clearSession(); return ''; }
  if (!refreshRequest) {
    // A refresh from an earlier login must never restore a signed-out account.
    const version = sessionVersion;
    refreshRequest = authRequest('/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } })
      .then(result => { if (version === sessionVersion) acceptSession(result); })
      .catch(error => {
        if (version !== sessionVersion) return;
        if ([400, 401, 403].includes(error.status)) clearSession();
        else throw error;
      })
      .finally(() => { if (version === sessionVersion) refreshRequest = null; });
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
  try {
    proof = JSON.parse(localStorage.getItem(EMAIL_PROOF_KEY) || 'null');
    localStorage.removeItem(EMAIL_PROOF_KEY);
  }
  catch { proof = null; }
  if (!proof || Date.now() - proof.created > 3600000) return { linkError: true };
  try {
    const result = await authRequest('/token?grant_type=pkce', { body: { auth_code: code, code_verifier: proof.verifier } });
    acceptSession(result);
    const user = await currentUser();
    return { user, recovery: proof.type === 'recovery' };
  } catch { clearSession(); return { linkError: true }; }
}

export async function changePassword(password) {
  const token = await sessionToken();
  if (!token) throw new Error('This reset link expired. Request a new one.');
  await authRequest('/user', { method: 'PUT', body: { password } }, token);
  // The password was saved even if the following sign-out request loses connectivity.
  await logout().catch(() => {});
}

export async function resendConfirmation(email) {
  await authRequest('/resend?redirect_to=' + encodeURIComponent(config.websiteUrl), {
    body: { type: 'signup', email: email.trim().toLowerCase() },
  });
}

async function factorRequest(path, body, method = 'POST') {
  const token = await sessionToken();
  if (!token) throw new Error('Your session expired. Please sign in again.');
  return authRequest('/factors' + path, { method, body }, token);
}

export function enrollAuthenticator(name) {
  return factorRequest('', { factor_type: 'totp', issuer: 'IGSO', friendly_name: name });
}

export function removeAuthenticator(id) {
  return factorRequest('/' + encodeURIComponent(id), undefined, 'DELETE');
}

// Supabase checks a fresh challenge before issuing the higher-assurance session.
export async function verifyAuthenticator(id, code) {
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the six digits shown in your app.');
  const version = sessionVersion;
  const path = '/' + encodeURIComponent(id);
  const challenge = await factorRequest(path + '/challenge', {});
  if (version !== sessionVersion) throw new Error('Please sign in again.');
  const result = await factorRequest(path + '/verify', { challenge_id: challenge.id, code });
  if (version !== sessionVersion) throw new Error('Please sign in again.');
  clearSession();
  acceptSession(result);
  return publicUser(result.user);
}
