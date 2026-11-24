import { api, escapeHtml as safe } from './api.js?v=accounts-20261120';

const sections = { overview: 'Overview', history: 'Telemetry history', players: 'Player names and activity' };

function sectionChoices(selected = ['overview']) {
  return Object.entries(sections).map(([key, label]) =>
    `<label class="scope-choice"><input type="checkbox" name="scope" value="${key}" ${selected.includes(key) ? 'checked' : ''}> ${label}</label>`
  ).join('');
}

export function invitePanel() {
  return `<section class="panel panel-pad"><h2>Player invitations and roles</h2>
    <p>You administer this server. Invite observers by their verified account email and choose what they can read.</p>
    <button class="button" id="manage-invites" type="button">Manage player access</button></section>`;
}

export async function manageInvites(server, showModal, toast) {
  const path = '/servers/' + server.id + '/invitations';
  showModal(`<h2>Player access</h2><p>${safe(server.name)}</p><div id="invite-list">Loading access…</div>
    <form id="issue-invite"><label for="invite-email">Player’s account email</label>
    <input id="invite-email" type="email" name="email" maxlength="254" required>
    <fieldset><legend>Observer can view</legend>${sectionChoices()}</fieldset>
    <p class="field-hint">The code expires in 24 hours. Share it privately with this player.</p>
    <p role="status"></p><div class="actions"><button type="button" class="button" data-close>Close</button>
    <button class="button primary">Create one-use code</button></div></form>`);
  const form = document.querySelector('#issue-invite');
  const list = document.querySelector('#invite-list');
  const status = form.querySelector('[role=status]');
  const fail = error => { status.textContent = error.message; };
  async function reload() {
    const { invitations } = await api(path);
    if (!list.isConnected) return;
    list.innerHTML = invitations.map(row => `<div class="invite-entry"><strong>${safe(row.email)}</strong>
      <span>${row.active ? 'Observer' : Date.parse(row.expiresAt) > Date.now() ? 'Pending code' : 'Code expired'}</span>
      <fieldset><legend>Visible sections</legend>${sectionChoices(row.scopes)}</fieldset>
      <div class="actions"><button type="button" class="button small" data-save="${safe(row.id)}">Save access</button>
      <button type="button" class="button small" data-revoke="${safe(row.id)}">Revoke</button></div></div>`).join('') || '<p>No invitations yet.</p>';
  }
  list.onclick = async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.save || button.dataset.revoke;
    const scopes = [...button.closest('.invite-entry').querySelectorAll(':checked')].map(input => input.value);
    if (button.dataset.save && !scopes.length) return fail(new Error('Choose at least one section.'));
    button.disabled = true;
    try {
      await api(path + '/' + id, button.dataset.save ? { method: 'PATCH', body: JSON.stringify({scopes}) } : {method: 'DELETE'});
      await reload();
      toast(button.dataset.save ? 'Access updated.' : 'Access revoked.');
    } catch (error) { fail(error); button.disabled = false; }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const fields = new FormData(form);
    const scopes = fields.getAll('scope');
    if (!scopes.length) return fail(new Error('Choose at least one section.'));
    const button = form.querySelector('.primary');
    button.disabled = true;
    try {
      const { code } = await api(path, {method:'POST',body:JSON.stringify({email:fields.get('email'), scopes})});
      if (form.isConnected) showModal(`<h2>Invitation created</h2><p>Share this code privately with ${safe(fields.get('email'))}. After signing in, they can enter it in Shared servers.</p>
        <code class="invite-code">${safe(code)}</code><button class="button primary" data-close>Done</button>`);
    } catch (error) { fail(error); button.disabled = false; }
  };
  try { await reload(); } catch (error) { if (list.isConnected) list.textContent = error.message; }
}

function sharedView(view) {
  const sample = view.telemetry.at(-1);
  const values = sample ? [['CPU',sample.cpu,'%'],['Heap',sample.memory,'%'],['Tick rate',sample.tps,' TPS'],['Tick time',sample.mspt,' ms']] : [];
  const metrics = values.filter(([,value])=>value!=null).map(([label,value,unit]) =>
    `<div><dt>${label}</dt><dd>${safe(value)}${unit}</dd></div>`).join('');
  const history = view.telemetry.slice().reverse().map(row => `<tr><td>${safe(new Date(row.timestamp).toLocaleString())}</td><td>${safe(row.cpu)}%</td><td>${safe(row.memory)}%</td><td>${safe(row.tps)}</td><td>${safe(row.mspt ?? '—')}</td></tr>`).join('');
  return `<h2>${safe(view.name)}</h2><p>Read-only observer · ${view.online ? 'Online' : 'Offline'}</p>
    ${view.scopes.includes('overview') ? `<h3>Overview</h3>${sample ? `<p>Last sample · ${safe(new Date(sample.timestamp).toLocaleString())}</p><dl class="definition-list">${metrics}</dl>` : '<p>No samples received.</p>'}` : ''}
    ${view.scopes.includes('history') ? `<h3>Telemetry history</h3><div class="table-scroll"><table><thead><tr><th>Time</th><th>CPU</th><th>Heap</th><th>TPS</th><th>MSPT</th></tr></thead><tbody>${history || '<tr><td colspan="5">No samples received.</td></tr>'}</tbody></table></div>` : ''}
    ${view.scopes.includes('players') ? `<h3>Player activity</h3>${view.players.map(p=>`<p>${safe(p.name)} · ${safe(p.activity)}</p>`).join('') || '<p>No current player snapshot.</p>'}` : ''}`;
}

export function sharedPage() {
  return `<main id="content" class="section-width shared-page"><a href="#games">Back to my games</a>
    <h1>Shared servers</h1><form id="redeem-invite" class="panel panel-pad">
      <label for="invite-code">One-use invitation code</label><input id="invite-code" required maxlength="40" autocomplete="off" spellcheck="false">
      <button class="button primary">Redeem invitation</button><p role="status"></p></form>
    <section class="panel panel-pad"><label for="shared-select">Server</label><select id="shared-select"></select>
      <div id="shared-view" aria-live="polite"></div></section></main>`;
}

export function bindShared() {
  const form = document.querySelector('#redeem-invite');
  const select = document.querySelector('#shared-select');
  const content = document.querySelector('#shared-view');
  let sequence = 0;
  async function refresh(preferred = select.value) {
    const seq = ++sequence;
    try {
      const { servers } = await api('/shared');
      const id = servers.find(s => s.id === preferred)?.id || servers[0]?.id;
      const view = id ? await api('/shared/' + id) : null;
      if (seq !== sequence || !form.isConnected) return;
      select.innerHTML = servers.map(s=>`<option value="${safe(s.id)}">${safe(s.name)}</option>`).join('');
      if (id) select.value = id;
      select.disabled = !id;
      content.innerHTML = view ? sharedView(view) : '<p>No shared servers. Redeem a code from your server administrator.</p>';
    } catch (error) { if (seq === sequence && form.isConnected) content.textContent = error.message; }
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const status = form.querySelector('[role=status]');
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const {serverId} = await api('/invitations/redeem',{method:'POST',body:JSON.stringify({code:form.querySelector('input').value})});
      form.reset(); status.textContent = 'Invitation accepted.';
      await refresh(serverId);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  select.onchange = () => { content.textContent='Loading…'; refresh(); };
  refresh();
  return refresh;
}
