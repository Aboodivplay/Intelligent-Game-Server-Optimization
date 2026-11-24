import { showAccountSecurity } from './account-security.js?v=accounts-20261120';
import { api, openApp, escapeHtml as safe, download, agentEndpoint } from './api.js?v=accounts-20261120';
import { readEmailAction, sendPasswordReset, changePassword, resendConfirmation, verifyAuthenticator, clearSession } from './session.js?v=accounts-20261120';
import { landing, authPage, gameSelection, verificationPage, passwordChangePage } from './pages.js?v=vanilla-20261124';
import { versionField, dashboardShell, overview, history, predictions, remediation, agentSetup, settingsPage, livePlayers, consolePage } from './dashboard.js?v=vanilla-20261124';

// Only navigation and current UI state live here. Server records come from the API.
let user = null;
let pendingLogin = null;
let recoveringPassword = false;
let dashboard = { servers: [], telemetry: [], audit: [] };
let serverId = '';
let loadedServerId = '';
let activeTab = 'Overview';
let includeClearedAudit = false;
let dashboardRequest = 0;
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
  document.querySelectorAll('.reveal, .world, .mc-panorama').forEach(element => sectionObserver.observe(element));
}

async function loadDashboard() {
  const query = serverId ? '?server=' + encodeURIComponent(serverId) : '';
  const owner = user;
  const requestedServer = serverId;
  const request = ++dashboardRequest;
  const data = await api('/dashboard' + query);
  if (owner !== user || requestedServer !== serverId || request !== dashboardRequest) return;
  dashboard = data;
  if (!dashboard.servers.some(server => server.id === serverId)) serverId = dashboard.servers[0]?.id || '';
  loadedServerId = serverId;
}

function drawDashboard() {
  const server = selectedServer();
  const renderTab = {
    'Live players': () => livePlayers(dashboard, server),
    'Console': () => consolePage(dashboard, server),
    'Overview': () => overview(dashboard, server),
    'Telemetry history': () => history(dashboard, server, chartMetric),
    'Predictions': () => predictions(dashboard, server),
    'Remediation': () => remediation(dashboard, server, includeClearedAudit),
    'Agent setup': () => agentSetup(dashboard, server),
    'Settings': () => settingsPage(dashboard, server),
  };
  const version = server?.minecraftVersion || '';
  document.body.dataset.minecraftVersion = version;
  const label = app.querySelector('#banner-version');
  if (label) label.textContent = version;
  const content = renderTab[activeTab]();
  const main = app.querySelector('.workspace-main');
  if (!main) {
    app.innerHTML = dashboardShell(user, activeTab, content, version);
    animateSections();
    bindControls();
    return;
  }

  // Keep the scenery and navigation in place when fresh readings arrive.
  const switched = main.dataset.view !== activeTab;
  main.dataset.view = activeTab;
  main.innerHTML = content;
  if (switched) {
    for (const button of app.querySelectorAll('.workspace-sidebar [data-tab]')) {
      const current = button.dataset.tab === activeTab;
      button.classList.toggle('active', current);
      if (current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      main.animate([{ opacity: .7, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 160 });
    }
  }
  bindControls(main);
}

async function renderRoute() {
  const route = location.hash.slice(1) || 'home';
  document.body.classList.toggle('minecraft-theme', route === 'minecraft');
  const version = ++routeVersion;
  if (pendingLogin && route !== 'verify-login') {
    location.hash = 'verify-login';
    return;
  }
  if (route === 'verify-login') {
    if (!pendingLogin) { location.hash = 'login'; return; }
    app.innerHTML = verificationPage(pendingLogin.account.authenticators);
    document.querySelector('#verify-login').onsubmit = submitLoginCode;
    document.querySelector('#cancel-login').onclick = cancelLogin;
    return;
  }
  if (recoveringPassword && route !== 'reset-password') { location.hash = 'reset-password'; return; }
  if (route === 'content') {
    const content = document.getElementById('content');
    if (content) { content.tabIndex = -1; content.focus(); content.scrollIntoView(); }
    return;
  }
  // Section links scroll within the public presentation instead of rebuilding it.
  if (['capabilities', 'how-it-works', 'development', 'project', 'games'].includes(route) && route !== 'games') {
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
    if (!recoveringPassword || !user) { location.hash = 'login'; return; }
    app.innerHTML = passwordChangePage();
    document.querySelector('#new-password-form').onsubmit = submitNewPassword;
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
    } catch (error) { if (version === routeVersion) showWorkspaceError(error); }
    return;
  } else {
    app.innerHTML = landing(user);
    animateSections();
  }
  bindControls();
  window.scrollTo(0, 0);
}

function showWorkspaceError(error) {
  if (error.status === 401 || error.code === 'mfa_required') {
    clearSession();
    includeClearedAudit = false;
    serverId = '';
    user = null;
    dashboard = { servers: [], telemetry: [], audit: [] };
    location.hash = 'login';
    toast(error.code === 'mfa_required' ? 'Sign in again to verify your authenticator.' : 'Your session expired. Please log in again.');
  } else {
    const detail = error.status >= 500
      ? `The server returned HTTP ${error.status}. Try again in a moment.`
      : error.message;
    const content = `<section class="empty-state"><h2>Could not load your workspace</h2><p>${safe(detail)}</p><button class="button primary" id="retry">Try again</button></section>`;
    const main = app.querySelector('.workspace-main');
    if (main) {
      main.innerHTML = content;
      bindControls(main);
    } else {
      app.innerHTML = dashboardShell(user, activeTab, content, selectedServer()?.minecraftVersion);
      animateSections();
      bindControls();
    }
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
    const fields = { email: form.elements.email.value, password: form.elements.password.value };
    if (form.elements.name) fields.name = form.elements.name.value;
    const result = await api('/auth/' + form.dataset.mode, { method: 'POST', body: JSON.stringify(fields) });
    form.reset();
    if (result.confirmationRequired) {
      document.querySelector('.auth-form').innerHTML = '<div class="eyebrow">CHECK YOUR EMAIL</div><h2>Confirm your address.</h2><p class="auth-status">If this address can be registered, a confirmation link will arrive in your inbox. Open it to finish setting up your account.</p><a class="button primary full" href="#login">Back to login</a>';
      return;
    }
    finishLogin(result.user);
  } catch (error) {
    errorBox.textContent = error.message;
    button.disabled = false;
    button.textContent = form.dataset.mode === 'signup' ? 'Create account' : 'Log in';
  }
}

// A password or recovery link is only the first step for enrolled accounts.
function finishLogin(account, recovery = false) {
  if (account.authenticators?.length) {
    pendingLogin = { account, recovery };
    location.hash = 'verify-login';
    return;
  }
  user = account;
  recoveringPassword = recovery;
  location.hash = recovery ? 'reset-password' : 'games';
}

async function cancelLogin() {
  pendingLogin = null;
  const revocation = api('/auth/logout', { method: 'POST' });
  location.hash = 'login';
  try { await revocation; } catch { toast('Signed out on this page.'); }
}

async function submitLoginCode(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const pending = pendingLogin;
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const account = await verifyAuthenticator(form.elements.factor.value, form.elements.code.value);
    if (pending !== pendingLogin) return;
    user = account;
    pendingLogin = null;
    recoveringPassword = pending.recovery;
    location.hash = recoveringPassword ? 'reset-password' : 'games';
  } catch (error) {
    form.querySelector('[data-code-error]').textContent = error.message;
    form.elements.code.select();
    button.disabled = false;
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
    recoveringPassword = false;
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
  showModal(`<h2>Connect a Minecraft server</h2>
    <p>Choose the version already running on your Paper server. We’ll use it to select the matching agent.</p>
    <form id="new-server-form">
      <label for="connection-name">Server name</label>
      <input id="connection-name" name="name" maxlength="60" minlength="2" required placeholder="Our survival world">
      ${versionField()}<div class="form-error" id="connection-error" role="alert"></div>
      <div class="actions"><button type="button" class="button" data-close>Cancel</button>
      <button class="button primary" type="submit">Create connection</button></div>
    </form>`);
  document.querySelector('#new-server-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const fields = new FormData(event.target);
      const result = await api('/servers', { method: 'POST', body: JSON.stringify({
        name: fields.get('name'), minecraftVersion: fields.get('minecraftVersion'),
      }) });
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

function exportName(kind, id, extension) {
  const time = new Date().toISOString().replace(/:/g, '-');
  return `minecraft-${kind}-${id}-${time}.${extension}`;
}

function exportTelemetry(format) {
  if (!dashboard.telemetry.length) return toast('No recorded telemetry is available to export.');
  // Use the server that supplied the displayed rows, even during a server switch.
  const rows = dashboard.telemetry.map(row => ({ ...row, serverId: loadedServerId }));
  const name = exportName('telemetry', loadedServerId, format);
  if (format === 'json') return download(name, JSON.stringify(rows, null, 2));

  const columns = ['serverId', 'timestamp', 'cpu', 'memory', 'tps', 'entities', 'players'];
  const cell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const csv = [columns.join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n');
  download(name, csv, 'text/csv;charset=utf-8');
}

// Capture the last visible action before asking for confirmation.
function confirmClearAudit() {
  const latest = dashboard.audit.find(row => row.id && !row.cleared);
  if (!latest) return;
  const owner = user;
  showModal(`<h2>Clear account history?</h2>
    <p>This hides the actions currently in your log. You can review retained actions with “Show cleared entries”. New actions will still appear.</p>
    <p role="alert"></p><div class="actions"><button class="button" data-close autofocus>Cancel</button>
    <button class="button primary" id="confirm-clear-audit">Clear history</button></div>`);
  const confirm = modal.querySelector('#confirm-clear-audit');
  confirm.onclick = async () => {
    confirm.disabled = true;
    try {
      await api('/audit/clear', { method: 'POST', body: JSON.stringify({ throughId: latest.id }) });
      if (user !== owner) return;
      ++dashboardRequest;
      for (const row of dashboard.audit) {
        if (row.id && BigInt(row.id) <= BigInt(latest.id)) row.cleared = true;
      }
      includeClearedAudit = false;
      if (confirm.isConnected && modal.open) modal.close();
      if (location.hash === '#minecraft') {
        drawDashboard();
        app.querySelector('#toggle-audit')?.focus();
      }
      toast('Account history cleared.');
    } catch (error) {
      if (confirm.isConnected && modal.open) {
        modal.querySelector('[role="alert"]').textContent = error.message;
        confirm.disabled = false;
      }
    }
  };
}

function bindControls(scope = document) {
  scope.querySelectorAll('[data-open]').forEach(button => button.onclick = event => { event.preventDefault(); openApp(button.dataset.open); });
  scope.querySelector('[data-game="minecraft"]')?.addEventListener('click', () => { activeTab = 'Overview'; location.hash = 'minecraft'; });
  scope.querySelector('#auth-form')?.addEventListener('submit', submitAuth);
  scope.querySelector('#account-security')?.addEventListener('click', () => {
    showAccountSecurity(user, { showModal, toast, onUpdate: account => { user = account; } });
  });
  scope.querySelector('#resend-confirmation')?.addEventListener('click', async event => {
    const email = document.querySelector('#email');
    if (!email.reportValidity()) return;
    const button = event.currentTarget;
    button.disabled = true;
    try { await resendConfirmation(email.value); toast('If confirmation is needed, a new link will arrive. Open the latest email.'); }
    catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });
  scope.querySelector('#forgot-password')?.addEventListener('click', passwordResetDialog);
  scope.querySelector('#password')?.addEventListener('input', event => {
    const guide = document.querySelector('#password-guide');
    if (!guide) return;
    const length = event.target.value.length;
    guide.textContent = length >= 12 ? 'Length requirement met. Use a unique password for this account.' : 'Use at least 12 characters. A unique passphrase is easier to remember.';
    guide.classList.toggle('good', length >= 12);
  });
  scope.querySelector('#show-password')?.addEventListener('click', event => {
    const input = document.querySelector('#password');
    input.type = input.type === 'password' ? 'text' : 'password';
    event.currentTarget.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
  scope.querySelector('#logout')?.addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); }
    catch { toast('Signed out on this page. The service could not confirm session revocation.'); }
    finally {
      user = null; includeClearedAudit = false; dashboard = { servers: [], telemetry: [], audit: [] }; serverId = '';
      if (modal.open) modal.close();
      location.hash = 'login';
    }
  });
  scope.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { activeTab = button.dataset.tab; drawDashboard(); });
  scope.querySelector('#server-select')?.addEventListener('change', async event => {
    serverId = event.target.value;
    try { await loadDashboard(); drawDashboard(); } catch (error) { showWorkspaceError(error); }
  });
  scope.querySelector('#connect-server')?.addEventListener('click', connectServer);
  scope.querySelector('#first-server')?.addEventListener('click', connectServer);
  scope.querySelector('#retry')?.addEventListener('click', async () => {
    const version = routeVersion;
    try {
      await loadDashboard();
      if (version === routeVersion) drawDashboard();
    } catch (error) { if (version === routeVersion) showWorkspaceError(error); }
  });
  scope.querySelectorAll('[data-metric]').forEach(button => button.onclick = () => { chartMetric = button.dataset.metric; drawDashboard(); });
  scope.querySelectorAll('[data-export]').forEach(button => button.onclick = () => exportTelemetry(button.dataset.export));
  scope.querySelector('#clear-audit')?.addEventListener('click', confirmClearAudit);
  scope.querySelector('#toggle-audit')?.addEventListener('click', () => {
    includeClearedAudit = !includeClearedAudit;
    drawDashboard();
    app.querySelector('#toggle-audit')?.focus();
  });
  scope.querySelector('#override')?.addEventListener('click', async () => {
    try {
      await api('/servers/' + serverId, { method: 'PATCH', body: JSON.stringify({ manualOverride: !selectedServer().manualOverride }) });
      await loadDashboard(); drawDashboard(); toast('Manual override policy saved.');
    } catch (error) { toast(error.message); }
  });
  scope.querySelector('#rotate-key')?.addEventListener('click', () => {
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
  scope.querySelector('#export-training')?.addEventListener('click',async()=>{
    try {
      const data = await api('/servers/' + serverId + '/training');
      download(exportName('training', data.serverId, 'json'), JSON.stringify(data, null, 2));
    } catch (error) { toast(error.message); }
  });
  scope.querySelector('#label-incident')?.addEventListener('click',()=>{
    showModal('<h2>Label a confirmed server incident</h2><p>Record the observed failure time. Do not label client crashes as server crashes.</p><form id="incident-form"><label for="incident-kind">Incident</label><select id="incident-kind"><option value="severe_lag">Severe server lag</option><option value="crash">Server crash</option></select><label for="incident-time">Observed time (your local time)</label><input id="incident-time" type="datetime-local" required><div class="actions"><button class="button" type="button" data-close>Cancel</button><button class="button primary" type="submit">Save incident label</button></div></form>');
    document.querySelector('#incident-form').onsubmit=async event=>{
      event.preventDefault();event.currentTarget.querySelector('[type=submit]').disabled=true;
      try{await api('/servers/'+serverId+'/incidents',{method:'POST',body:JSON.stringify({kind:document.querySelector('#incident-kind').value,occurredAt:new Date(document.querySelector('#incident-time').value).toISOString()})});modal.close();toast('Incident label saved.');}
      catch(error){toast(error.message);event.currentTarget.querySelector('[type=submit]').disabled=false;}
    };
  });
  scope.querySelector('#delete-server')?.addEventListener('click', () => {
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
  scope.querySelector('#command-form')?.addEventListener('submit',event=>{
    event.preventDefault();const command=document.querySelector('#command-input').value.trim();
    showModal(`<h2>Run this server command?</h2><pre class="code">${safe(command)}</pre><p>It will run on ${safe(selectedServer().name)}. Review its effect before sending.</p><div class="actions"><button class="button" data-close>Cancel</button><button class="button primary" id="send-command">Send to Minecraft</button></div>`);
    document.querySelector('#send-command').onclick=async event=>{
      event.currentTarget.disabled=true;
      try{await api('/servers/'+serverId+'/commands',{method:'POST',body:JSON.stringify({command})});modal.close();await loadDashboard();drawDashboard();toast('Command queued. Waiting for the agent.');}
      catch(error){toast(error.message);modal.close();}
    };
  });
  scope.querySelector('#policy-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    try {
      await api('/servers/' + serverId, { method: 'PATCH', body: JSON.stringify({ name: fields.get('name'), threshold: Number(fields.get('threshold')), minecraftVersion: fields.get('minecraftVersion') }) });
      await loadDashboard(); drawDashboard(); toast('Server policy saved.');
    } catch (error) { toast(error.message); }
  });
}

// Refresh only the live workspace. Do not erase forms or let an API failure leave stale live readings.
setInterval(async () => {
  if (location.hash !== '#minecraft' || !user || document.hidden || requestInProgress || modal.open || activeTab === 'Settings') return;
  if (document.activeElement?.closest('.workspace-main button:focus-visible, input, select, textarea')) return;
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
    finishLogin(emailAction.user, emailAction.recovery);
  } else {
    try { user = (await api('/auth/me')).user; }
    catch { user = null; }
  }
  await renderRoute();
  if (emailAction?.linkError) toast('This email link expired or is invalid. Request a new confirmation or password reset.');
}
start();
