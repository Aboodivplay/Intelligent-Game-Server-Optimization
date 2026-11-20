import { config } from './config.js?v=accounts-20261120';
import { authenticate, currentUser, logout, sessionToken } from './session.js?v=accounts-20261120';

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
export const agentEndpoint = () => config.supabaseUrl ? config.supabaseUrl + '/functions/v1/' + config.functionName + '/telemetry' : '';

export async function api(path, options = {}) {
  // The local preview can exercise the original Worker with an isolated database.
  // Production always stays on GitHub and uses the independent account service.
  if (!isLocal && path.startsWith('/auth/')) {
    if (path === '/auth/me') return { user: await currentUser() };
    if (path === '/auth/logout') { await logout(); return {}; }
    return authenticate(path.endsWith('signup') ? 'signup' : 'login', JSON.parse(options.body || '{}'));
  }
  const token = isLocal ? '' : await sessionToken();
  if (!isLocal && !token) {
    const error = new Error('Please log in to continue.');
    error.status = 401;
    throw error;
  }
  const endpoint = isLocal ? '/api' : config.supabaseUrl + '/functions/v1/' + config.functionName;
  let response;
  try {
    response = await fetch(endpoint + path, {
      ...options,
      credentials: isLocal ? 'same-origin' : 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: {
        'Content-Type': 'application/json',
        ...(!isLocal ? { Authorization: 'Bearer ' + token, apikey: config.publishableKey } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('The workspace service is unreachable. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Unable to complete this request. Please try again.');
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export function openApp(page = 'login') {
  location.hash = page;
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

export function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
