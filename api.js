// All requests go to the backend. Passwords and session tokens are never saved in JavaScript.
// GitHub Pages serves the public presentation; the hosted app handles login and private data.
export const HOSTED_APP = 'https://sentinel-game-server-engine.abdiviwjjdjdjsjjehh.chatgpt.site';
export const isHosted = location.origin === HOSTED_APP || ['localhost', '127.0.0.1'].includes(location.hostname);

export async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'The server could not complete this request.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export function openApp(page = 'login') {
  if (isHosted) location.hash = page;
  else location.href = HOSTED_APP + '/#' + page;
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
