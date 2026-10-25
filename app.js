import { api, openApp, escapeHtml as safe, download, agentEndpoint } from './api.js?v=logo-free-20261025-2';
import { readEmailAction, sendPasswordReset, changePassword, resendConfirmation } from './session.js?v=logo-free-20261025-2';
import { landing, authPage, gameSelection } from './pages.js?v=logo-free-20261025-2';
import { dashboardShell, overview, history, predictions, remediation, agentSetup, settingsPage, livePlayers, consolePage } from './dashboard.js?v=logo-free-20261025-2';

// Only navigation and current UI state live here. Server records come from the API.
let user = null;
let dashboard = { servers: [], telemetry: [], audit: [] };
let serverId = '';
let activeTab = 'Overview';
let chartMetric = 'cpu';
let requestInProgress = false;
let routeVersion = 0;
let sectionObserver = null;
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
  sectionObserver?.disconnect();
  sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      entry.target.classList.toggle('offscreen-motion', !entry.isIntersecting);
      if (entry.isIntersecting && entry.target.classList.contains('reveal')) {
        entry.target.classList.add('visible');
        // Keep observing decorative motion so it pauses outside the viewport.
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal, .world, .game-card.locked').forEach(element => sectionObserver.observe(element));
}

async function loadDashboard() {
  const query = serverId ? '?server=' + encodeURIComponent(serverId) : '';
  dashboard = await api('/dashboard' + query);
  if (!dashboard.servers.some(server => server.id === serverId)) serverId = dashboard.servers[0]?.id || '';
}

function drawDashboard() {
  const server = selectedServer();
  const renderTab = {
    'Live players': () => livePlayers(dashboard, server),
    'Console': () => consolePage(dashboard, server),
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
  document.body.classList.toggle('minecraft-theme', route === 'minecraft');
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
  if (['games', 'minecraft'].includes(route) && !user) {
    location.hash = 'login';
    return;
  }
  if (route === 'reset-password') {
    app.innerHTML = authPage(false);
    document.querySelector('.auth-form h2').textContent = 'Choose a new password.';
    document.querySelector('.auth-form > p').textContent = 'Use a unique passphrase with at least 12 characters.';
    document.querySelector('#email').closest('form').innerHTML = '<label for="new-password">New password</label><input id="new-password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><label for="confirm-new-password">Confirm new password</label><input id="confirm-new-password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><div id="form-error" class="form-error" role="alert"></div><button class="button primary full" type="submit">Save new password</button>';
    document.querySelector('#auth-form').onsubmit = submitNewPassword;
    window.scrollTo(0, 0);
    return;
  }
  if (route === 'login' || route === 'signup') {
    if (user) { location.hash = 'games'; return; }
    app.innerHTML = authPage(route === 'signup');
  } else if (route === 'games') {
    app.innerHTML = gameSelection(user);
    animateSections();
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
  errorBox.textContent = '';
  form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
  if (!form.checkValidity()) {
    form.querySelector(':invalid')?.setAttribute('aria-invalid', 'true');
    form.reportValidity();
    return;
  }
  if (form.dataset.mode === 'signup' && form.elements.password.value !== form.elements.confirmPassword.value) {
    errorBox.textContent = 'The passwords do not match.';
    form.elements.confirmPassword.setAttribute('aria-invalid', 'true');
    form.elements.confirmPassword.focus();
    return;
  }
  button.disabled = true;
  button.textContent = 'Please wait…';
  try {
    const fields = Object.fromEntries(new FormData(form));
    const result = await api('/auth/' + form.dataset.mode, { method: 'POST', body: JSON.stringify(fields) });
    form.reset();
    if (result.confirmationRequired) {
      document.querySelector('.auth-form').innerHTML = '<div class="eyebrow">CHECK YOUR EMAIL</div><h2>Confirm your address.</h2><p class="auth-status">If this address can be registered, a confirmation link will arrive in your inbox. Open it to finish setting up your account.</p><a class="button primary full" href="#login">Back to login</a>';
      return;
    }
    user = result.user;
    location.hash = 'games';
  } catch (error) {
    errorBox.textContent = error.message;
    button.disabled = false;
    button.textContent = form.dataset.mode === 'signup' ? 'Create account ↗' : 'Log in ↗';
  }
}

async function submitNewPassword(event) {
  event.preventDefault();
  const password = document.querySelector('#new-password').value;
  const confirmation = document.querySelector('#confirm-new-password').value;
  const errorBox = document.querySelector('#form-error');
  if (password.length < 12 || password.length > 128) { errorBox.textContent = 'Use between 12 and 128 characters.'; return; }
  if (password !== confirmation) { errorBox.textContent = 'The passwords do not match.'; return; }
  const button = event.currentTarget.querySelector('[type=submit]');
  button.disabled = true;
  try {
    await changePassword(password);
    user = null;
    location.hash = 'login';
    toast('Password updated. Please log in again.');
  } catch (error) { errorBox.textContent = error.message; button.disabled = false; }
}

function passwordResetDialog() {
  showModal('<h2>Reset your password.</h2><p>Enter your account email. If it is registered, you will receive a reset link.</p><form id="reset-form"><label for="reset-email">Email address</label><input id="reset-email" type="email" required autocomplete="email"><div id="reset-status" class="form-error" role="status"></div><div class="actions"><button class="button" type="button" data-close>Cancel</button><button class="button primary" type="submit">Send reset link</button></div></form>');
  document.querySelector('#reset-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await sendPasswordReset(document.querySelector('#reset-email').value);
      document.querySelector('#reset-status').textContent = 'If this account exists, a reset link will arrive shortly.';
    } catch (error) { document.querySelector('#reset-status').textContent = error.message; }
    finally { button.disabled = false; }
  };
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
      const config = `endpoint: ${agentEndpoint()}\nserver-id: ${serverId}\nagent-key: ${result.agentKey}\ninterval-seconds: 5\nplayer-tracking: true\nremote-console:\n  enabled: false\n  allowed-commands: [list, say, time, weather, difficulty, save-all]\n`;
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
  document.querySelector('#resend-confirmation')?.addEventListener('click',async event=>{
    const email=document.querySelector('#email');
    if(!email.checkValidity()){email.reportValidity();return;}
    event.currentTarget.disabled=true;
    try{await resendConfirmation(email.value);toast('If confirmation is needed, a new link will arrive. Open the latest email.');}
    catch(error){toast(error.message);}
    finally{event.currentTarget.disabled=false;}
  });
  document.querySelector('#forgot-password')?.addEventListener('click', passwordResetDialog);
  document.querySelector('#password')?.addEventListener('input', event => {
    const guide = document.querySelector('#password-guide');
    if (!guide) return;
    const length = event.target.value.length;
    guide.textContent = length >= 12 ? 'Length requirement met. Use a unique password for this account.' : 'Use at least 12 characters. A unique passphrase is easier to remember.';
    guide.classList.toggle('good', length >= 12);
  });
  document.querySelector('#show-password')?.addEventListener('click', event => {
    const input = document.querySelector('#password');
    input.type = input.type === 'password' ? 'text' : 'password';
    event.currentTarget.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
  document.querySelector('#logout')?.addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); }
    catch { toast('Signed out on this page. The service could not confirm session revocation.'); }
    finally {
      user = null; dashboard = { servers: [], telemetry: [], audit: [] }; serverId = '';
      if (modal.open) modal.close();
      location.hash = 'login';
    }
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
  document.querySelector('#rotate-key')?.addEventListener('click', () => {
    showModal('<h2>Replace the agent key?</h2><p>The current key will stop working immediately. Download the new configuration and replace it on your server to reconnect.</p><div class="actions"><button class="button" data-close>Cancel</button><button class="button danger" id="confirm-rotation">Replace key</button></div>');
    document.querySelector('#confirm-rotation').onclick = async event => {
      event.currentTarget.disabled = true;
      try {
        const result = await api('/servers/' + serverId + '/key', { method: 'POST' });
        const configuration = `endpoint: ${agentEndpoint()}\nserver-id: ${serverId}\nagent-key: ${result.agentKey}\ninterval-seconds: 5\nplayer-tracking: true\nremote-console:\n  enabled: false\n  allowed-commands: [list, say, time, weather, difficulty, save-all]\n`;
        showModal('<h2>New configuration ready.</h2><p>Your old key has been disabled. Save this configuration now; the key will not be shown again.</p><div class="actions"><button class="button" data-close>Close</button><button class="button primary" id="download-new-config">Download config.yml</button></div>');
        document.querySelector('#download-new-config').onclick = () => download('config.yml', configuration, 'text/yaml');
        await loadDashboard(); drawDashboard();
      } catch (error) { toast(error.message); modal.close(); }
    };
  });
  document.querySelector('#export-training')?.addEventListener('click',async()=>{
    try{const data=await api('/servers/'+serverId+'/training');download('minecraft-training.json',JSON.stringify(data,null,2));}catch(error){toast(error.message);}
  });
  document.querySelector('#label-incident')?.addEventListener('click',()=>{
    showModal('<h2>Label a confirmed server incident</h2><p>Record the observed failure time. Do not label client crashes as server crashes.</p><form id="incident-form"><label for="incident-kind">Incident</label><select id="incident-kind"><option value="severe_lag">Severe server lag</option><option value="crash">Server crash</option></select><label for="incident-time">Observed time (your local time)</label><input id="incident-time" type="datetime-local" required><div class="actions"><button class="button" type="button" data-close>Cancel</button><button class="button primary" type="submit">Save incident label</button></div></form>');
    document.querySelector('#incident-form').onsubmit=async event=>{
      event.preventDefault();event.currentTarget.querySelector('[type=submit]').disabled=true;
      try{await api('/servers/'+serverId+'/incidents',{method:'POST',body:JSON.stringify({kind:document.querySelector('#incident-kind').value,occurredAt:new Date(document.querySelector('#incident-time').value).toISOString()})});modal.close();toast('Incident label saved.');}
      catch(error){toast(error.message);event.currentTarget.querySelector('[type=submit]').disabled=false;}
    };
  });
  document.querySelector('#delete-server')?.addEventListener('click', () => {
    const server=selectedServer();
    showModal(`<h2>Delete ${safe(server.name)}?</h2><p>Permanently removes its saved telemetry, command history and agent key. Your Minecraft world remains on your server.</p><form id="delete-form"><label for="delete-name">Type the exact server name</label><input id="delete-name" autocomplete="off" required><div class="actions"><button class="button" type="button" data-close>Cancel</button><button class="button danger" type="submit">Permanently delete connection</button></div></form>`);
    document.querySelector('#delete-form').onsubmit=async event=>{
      event.preventDefault();const name=document.querySelector('#delete-name').value;
      if(name!==server.name)return toast('The server name does not match.');
      event.currentTarget.querySelector('[type=submit]').disabled=true;
      try{await api('/servers/'+server.id,{method:'DELETE',body:JSON.stringify({confirmName:name})});modal.close();serverId='';await loadDashboard();activeTab='Overview';drawDashboard();toast('Server connection deleted.');}
      catch(error){toast(error.message);modal.close();}
    };
  });
  document.querySelector('#command-form')?.addEventListener('submit',event=>{
    event.preventDefault();const command=document.querySelector('#command-input').value.trim();
    showModal(`<h2>Run this server command?</h2><pre class="code">${safe(command)}</pre><p>It will run on ${safe(selectedServer().name)}. Review its effect before sending.</p><div class="actions"><button class="button" data-close>Cancel</button><button class="button primary" id="send-command">Send to Minecraft</button></div>`);
    document.querySelector('#send-command').onclick=async event=>{
      event.currentTarget.disabled=true;
      try{await api('/servers/'+serverId+'/commands',{method:'POST',body:JSON.stringify({command})});modal.close();await loadDashboard();drawDashboard();toast('Command queued. Waiting for the agent.');}
      catch(error){toast(error.message);modal.close();}
    };
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
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('motion-paused', document.hidden);
  if (document.hidden) {
    const input = document.querySelector('#password');
    if (input) input.type = 'password';
    const control = document.querySelector('#show-password');
    if (control) control.textContent = 'Show';
  }
});
modal.addEventListener('close', () => document.querySelector('#modal-content').replaceChildren());
async function start() {
  const emailAction = await readEmailAction();
  if (emailAction?.user) {
    user = emailAction.user;
    location.hash = emailAction.recovery ? 'reset-password' : 'games';
  } else {
    try { user = (await api('/auth/me')).user; }
    catch { user = null; }
  }
  await renderRoute();
  if (emailAction?.linkError) toast('This email link expired or is invalid. Request a new confirmation or password reset.');
  if (emailAction?.confirmed) toast('Email link opened. Please log in; this browser has no matching signup session.');
}
start();
