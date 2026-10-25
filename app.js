import { api, openApp, isHosted, escapeHtml as safe, download, HOSTED_APP } from './api.js';
import { landing, authPage, gameSelection } from './pages.js';
import { dashboardShell, overview, history, predictions, remediation, agentSetup, settingsPage } from './dashboard.js';

// Only navigation and current UI state live here. Server records come from the API.
let user = null;
let dashboard = { servers: [], telemetry: [], audit: [] };
let serverId = '';
let activeTab = 'Overview';
let chartMetric = 'cpu';
let requestInProgress = false;
let routeVersion = 0;
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const selectedServer = () => dashboard.servers.find(server => server.id === serverId);

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 4000);
}

function showModal(html) {
  document.querySelector('#modal-content').innerHTML = html;
  modal.showModal();
  modal.querySelector('[data-close]')?.addEventListener('click', () => modal.close());
}

function animateSections() {
  if (!('IntersectionObserver' in window)) return;
  document.body.classList.add('js-motion');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
}

async function loadDashboard() {
  const query = serverId ? '?server=' + encodeURIComponent(serverId) : '';
  dashboard = await api('/dashboard' + query);
  if (!dashboard.servers.some(server => server.id === serverId)) serverId = dashboard.servers[0]?.id || '';
}

function drawDashboard() {
  const server = selectedServer();
  const renderTab = {
    'Overview': () => overview(dashboard, server),
    'Telemetry history': () => history(dashboard, server, chartMetric),
    'Predictions': () => predictions(dashboard, server),
    'Remediation': () => remediation(dashboard, server),
    'Agent setup': () => agentSetup(dashboard, server),
    'Settings': () => settingsPage(dashboard, server),
  };
  app.innerHTML = dashboardShell(user, activeTab, renderTab[activeTab]());
  bindControls();
}

async function renderRoute() {
  const route = location.hash.slice(1) || 'home';
  const version = ++routeVersion;
  if (route === 'content') {
    const content = document.getElementById('content');
    if (content) { content.tabIndex = -1; content.focus(); content.scrollIntoView(); }
    return;
  }
  // Section links scroll within the public presentation instead of rebuilding it.
  if (['capabilities', 'how-it-works', 'project', 'games'].includes(route) && route !== 'games') {
    if (!document.querySelector('.hero')) app.innerHTML = landing(user);
    bindControls();
    animateSections();
    document.getElementById(route)?.scrollIntoView();
    return;
  }
  if (['login', 'signup', 'games', 'minecraft'].includes(route) && !isHosted) {
    openApp(route);
    return;
  }
  if (['games', 'minecraft'].includes(route) && !user) {
    location.hash = 'login';
    return;
  }
  if (route === 'login' || route === 'signup') {
    if (user) { location.hash = 'games'; return; }
    app.innerHTML = authPage(route === 'signup');
  } else if (route === 'games') {
    app.innerHTML = gameSelection(user);
  } else if (route === 'minecraft') {
    app.innerHTML = '<main class="loading" id="content"><div><div class="spinner"></div>Loading your Minecraft workspace…</div></main>';
    try {
      await loadDashboard();
      if (version !== routeVersion) return;
      drawDashboard();
    } catch (error) { showWorkspaceError(error); }
    return;
  } else {
    app.innerHTML = landing(user);
    animateSections();
  }
  bindControls();
  window.scrollTo(0, 0);
}

function showWorkspaceError(error) {
  if (error.status === 401) {
    user = null;
    dashboard = { servers: [], telemetry: [], audit: [] };
    location.hash = 'login';
    toast('Your session expired. Please log in again.');
  } else {
    app.innerHTML = dashboardShell(user, activeTab, `<section class="empty-state"><h2>We cannot reach the backend.</h2><p>${safe(error.message)}. Live server details are hidden until the connection recovers.</p><button class="button primary" id="retry">Try again</button></section>`);
    bindControls();
  }
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const errorBox = document.querySelector('#form-error');
  button.disabled = true;
  errorBox.textContent = '';
  try {
    const fields = Object.fromEntries(new FormData(form));
    const result = await api('/auth/' + form.dataset.mode, { method: 'POST', body: JSON.stringify(fields) });
    user = result.user;
    form.reset();
    location.hash = 'games';
  } catch (error) {
    errorBox.textContent = error.message;
    button.disabled = false;
  }
}

function connectServer() {
  showModal('<div class="eyebrow">MINECRAFT JAVA / PAPER</div><h2>Connect a real server.</h2><p>Give the connection a name. You will receive a private key and configuration for the Paper agent. Metrics stay hidden until the agent sends telemetry.</p><form id="new-server-form"><label for="connection-name">Server name</label><input id="connection-name" name="name" maxlength="60" minlength="2" required placeholder="e.g. Our survival world"><div class="form-error" id="connection-error" role="alert"></div><div class="actions"><button type="button" class="button" data-close>Cancel</button><button class="button primary" type="submit">Create connection</button></div></form>');
  document.querySelector('#new-server-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await api('/servers', { method: 'POST', body: JSON.stringify({ name: document.querySelector('#connection-name').value }) });
      serverId = result.server.id;
      const config = `endpoint: ${HOSTED_APP}/api/telemetry\nserver-id: ${serverId}\nagent-key: ${result.agentKey}\ninterval-seconds: 5\n`;
      showModal(`<div class="eyebrow">CONNECTION CREATED</div><h2>Save your agent configuration.</h2><p>This private key is shown once. Put the file only in your Minecraft server’s plugin folder. It permits telemetry ingestion for this server, not account access.</p><pre class="code">${safe(config)}</pre><div class="actions"><button class="button" data-close>Close</button><button class="button primary" id="download-config">↓ Download config.yml</button></div>`);
      document.querySelector('#download-config').onclick = () => download('config.yml', config, 'text/yaml');
      await loadDashboard();
      activeTab = 'Agent setup';
      drawDashboard();
    } catch (error) {
      const errorBox = document.querySelector('#connection-error');
      if (errorBox) errorBox.textContent = error.message;
      button.disabled = false;
    }
  };
}

function exportTelemetry(format) {
  if (!dashboard.telemetry.length) return toast('No recorded telemetry is available to export.');
  if (format === 'json') return download('minecraft-telemetry.json', JSON.stringify(dashboard.telemetry, null, 2));
  const columns = ['timestamp', 'cpu', 'memory', 'tps', 'entities', 'players'];
  const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const csv = [columns.join(','), ...dashboard.telemetry.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n');
  download('minecraft-telemetry.csv', csv, 'text/csv;charset=utf-8');
}

function bindControls() {
  document.querySelectorAll('[data-open]').forEach(button => button.onclick = event => { event.preventDefault(); openApp(button.dataset.open); });
  document.querySelector('[data-game="minecraft"]')?.addEventListener('click', () => { activeTab = 'Overview'; location.hash = 'minecraft'; });
  document.querySelector('#auth-form')?.addEventListener('submit', submitAuth);
  document.querySelector('#show-password')?.addEventListener('click', event => {
    const input = document.querySelector('#password');
    input.type = input.type === 'password' ? 'text' : 'password';
    event.currentTarget.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
  document.querySelector('#logout')?.addEventListener('click', async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      user = null;
      dashboard = { servers: [], telemetry: [], audit: [] };
      serverId = '';
      location.hash = 'home';
    } catch (error) { toast(error.message); }
  });
  document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { activeTab = button.dataset.tab; drawDashboard(); });
  document.querySelector('#server-select')?.addEventListener('change', async event => {
    serverId = event.target.value;
    try { await loadDashboard(); drawDashboard(); } catch (error) { showWorkspaceError(error); }
  });
  document.querySelector('#connect-server')?.addEventListener('click', connectServer);
  document.querySelector('#first-server')?.addEventListener('click', connectServer);
  document.querySelector('#retry')?.addEventListener('click', renderRoute);
  document.querySelectorAll('[data-metric]').forEach(button => button.onclick = () => { chartMetric = button.dataset.metric; drawDashboard(); });
  document.querySelectorAll('[data-export]').forEach(button => button.onclick = () => exportTelemetry(button.dataset.export));
  document.querySelector('#override')?.addEventListener('click', async () => {
    try {
      await api('/servers/' + serverId, { method: 'PATCH', body: JSON.stringify({ manualOverride: !selectedServer().manualOverride }) });
      await loadDashboard(); drawDashboard(); toast('Manual override policy saved.');
    } catch (error) { toast(error.message); }
  });
  document.querySelector('#policy-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    try {
      await api('/servers/' + serverId, { method: 'PATCH', body: JSON.stringify({ name: fields.get('name'), threshold: Number(fields.get('threshold')) }) });
      await loadDashboard(); drawDashboard(); toast('Server policy saved.');
    } catch (error) { toast(error.message); }
  });
}

// Refresh only the live workspace. Do not erase forms or let an API failure leave stale live readings.
setInterval(async () => {
  if (location.hash !== '#minecraft' || !user || requestInProgress || modal.open || activeTab === 'Settings') return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  requestInProgress = true;
  try { await loadDashboard(); if (location.hash === '#minecraft') drawDashboard(); }
  catch (error) { if (location.hash === '#minecraft') showWorkspaceError(error); }
  finally { requestInProgress = false; }
}, 5000);

window.addEventListener('hashchange', renderRoute);
async function start() {
  if (isHosted) {
    try { user = (await api('/auth/me')).user; }
    catch { user = null; }
  }
  renderRoute();
}
start();
