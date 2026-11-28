import { invitePanel } from './sharing.js?v=auth-20261128b';
import { loaderField, modGuide } from './monitoring.js?v=auth-20261128b';
import { escapeHtml as safe, agentEndpoint } from './api.js?v=auth-20261128b';
import { brand } from './pages.js?v=auth-20261128b';
import { minecraftVersions } from './supabase/functions/igso-api/minecraft-versions.js';

export const dashboardTabs = ['Overview', 'Live players', 'Telemetry history', 'Predictions', 'Remediation', 'Agent setup', 'Settings'];

// Each workspace tab uses the item a player would see in an inventory slot.
const navigationItems = ['grass-block', 'name_tag', 'book', 'ender_pearl', 'iron_pickaxe', 'repeater', 'comparator'];

function inventorySlot(item) {
  return `<span class="inventory-slot" aria-hidden="true"><img src="assets/minecraft/${item}.png?v=vanilla" alt="" width="24" height="24"></span>`;
}

// Only offer downloads for versions that have a published agent.
const agentVersions = ['1.20.1', '26.3'];

export function versionField(selected = '') {
  const options = minecraftVersions.map(version =>
    `<option value="${version}" ${selected === version ? 'selected' : ''}>${version}</option>`
  ).join('');
  return `<label for="minecraft-version">Minecraft version</label>
    <select id="minecraft-version" name="minecraftVersion" required>
      <option value="" disabled ${selected ? '' : 'selected'}>Choose your server version</option>${options}
    </select>
    <p class="field-hint">Monitoring downloads are available for ${agentVersions.join(' and ')}.</p>`;
}

export function dashboardShell(user, activeTab, content, version = '') {
  const tabs = dashboardTabs.map((tab, index) => {
    const current = tab === activeTab ? 'class="active" aria-current="page"' : '';
    return `<button data-tab="${tab}" ${current}>${inventorySlot(navigationItems[index])}<span>${tab}</span></button>`;
  }).join('');

  return `<header class="workspace-header">${brand()}<div class="actions"><span class="user-label">${safe(user.name)}</span><a class="text-link" href="#games">← Games</a><button class="button small" id="logout">Log out</button></div></header>
    <section class="mc-panorama" aria-label="Minecraft workspace">
      <div class="overworld-view" aria-hidden="true"></div>
      <div class="panorama-copy"><span class="edition-label">JAVA EDITION <i></i> <span id="banner-version">${safe(version)}</span></span><strong>Minecraft</strong><p>Server workspace</p></div>
      <a class="texture-credit" href="https://github.com/Aboodivplay/Intelligent-Game-Server-Optimization/blob/main/assets/minecraft/CREDITS.md">Texture credits</a>
    </section>
    <div class="workspace"><aside class="workspace-sidebar">
      <div class="current-game">${inventorySlot('grass-block')}<div><strong>Minecraft</strong><small>JAVA EDITION</small></div></div>
      <nav aria-label="Minecraft workspace">${tabs}</nav>
    </aside><main class="workspace-main" id="content" data-view="${safe(activeTab)}">${content}</main></div>`;
}

function title(titleText, subtitle, servers = [], selectedId = '') {
  return `<div class="workspace-title"><div><div class="eyebrow">MINECRAFT / CONTROL ROOM</div><h1>${titleText}</h1><p>${subtitle}</p></div><div class="actions">${servers.length ? `<select class="server-select" id="server-select" aria-label="Selected server">${servers.map(server => `<option value="${safe(server.id)}" ${server.id === selectedId ? 'selected' : ''}>${safe(server.name)}</option>`).join('')}</select>` : ''}<button class="button primary small" id="connect-server">+ Connect server</button></div></div>`;
}

export function emptyDashboard(servers, selected) {
  return title('Server overview', 'Server readings appear after your Minecraft agent connects.', servers, selected?.id) + `${selected ? `<div class="notice amber"><b>OFFLINE / NO RECENT HEARTBEAT</b> · ${selected.lastSeen ? safe(new Date(selected.lastSeen).toLocaleString()) : "Agent has not connected yet"}. Check the server or agent connection.</div>` : ""}<section class="empty-state"><img class="connection-block" src="assets/minecraft/grass-block.png?v=vanilla" width="64" height="67" alt=""><div class="eyebrow">${selected ? 'WAITING FOR REAL TELEMETRY' : 'NO SERVER CONNECTED'}</div><h2>${selected ? safe(selected.name) + ' is waiting for its agent.' : 'Connect your first Minecraft server.'}</h2><p>${selected ? 'The connection has been registered, but no fresh server telemetry is available. Open Agent setup for monitoring availability and installation details.' : 'Install the matching server agent, connect it with a server-specific key, and your real server details will appear here.'}</p><button class="button primary" ${selected ? 'data-tab="Agent setup"' : 'id="first-server"'}>${selected ? 'View agent setup' : 'Set up a connection'} ↗</button><p class="field-hint">No CPU, memory, tick rate, entity count or prediction is shown without a fresh sample from your server.</p></section>`;
}

export function overview(data, server) {
  const sample = data.telemetry.at(-1);
  if (!server?.online || !sample) return emptyDashboard(data.servers, server);
  const mismatch = server.minecraftVersion && sample.minecraftVersion && server.minecraftVersion !== sample.minecraftVersion;
  const versionNotice = mismatch ? `<p class="notice amber">Your agent reports Minecraft ${safe(sample.minecraftVersion)}. This server is set to ${safe(server.minecraftVersion)} in Settings.</p>` : '';
  const cards = [
    ['Host CPU', sample.cpu.toFixed(1), '%', 'Measured on your server host'],
    ['Java heap', sample.memory.toFixed(1), '%', `${sample.memoryUsedMb || '—'} / ${sample.memoryMaxMb || '—'} MB`],
    ['Tick rate', sample.tps.toFixed(2), 'TPS', 'Minecraft target: 20 TPS'],
    ['Loaded entities', sample.entities.toLocaleString(), '', 'All loaded worlds'],
  ];
  if (Number.isFinite(sample.mspt)) cards.push(['Tick time',sample.mspt.toFixed(1),' ms','Average milliseconds per tick']);
  return title(safe(server.name), 'Real telemetry from your connected Minecraft server.', data.servers, server.id) +
    versionNotice + `<div class="notice"><span class="live-dot"></span> ONLINE · Agent connected · last sample ${safe(new Date(sample.timestamp).toLocaleTimeString())} · ${sample.players} player${sample.players === 1 ? '' : 's'} online</div><div class="metrics-grid">${cards.map(([name, value, unit, caption]) => `<article class="metric"><label>${name}</label><strong>${value}<small>${unit}</small></strong><small>${safe(caption)}</small></article>`).join('')}</div><div class="two-columns"><section class="panel"><div class="panel-heading"><h2>CPU over time</h2><span class="tag green">REAL TELEMETRY</span></div><div class="telemetry-chart">${telemetryChart(data.telemetry, 'cpu')}</div></section><section class="panel"><div class="panel-heading"><h2>Connection details</h2></div><div class="panel-pad"><dl class="definition-list"><div><dt>Game</dt><dd>Minecraft Java</dd></div><div><dt>Platform</dt><dd>${safe(sample.platform || server.loader)}</dd></div><div><dt>Configured version</dt><dd>${safe(server.minecraftVersion || 'Choose in Settings')}</dd></div><div><dt>Version reported by agent</dt><dd>${safe(sample.minecraftVersion || 'Awaiting a version report')}</dd></div><div><dt>Players</dt><dd>${sample.players}</dd></div><div><dt>Agent sample time</dt><dd>${safe(new Date(sample.timestamp).toLocaleString())}</dd></div><div><dt>Prediction model</dt><dd>Not connected</dd></div></dl></div></section></div><section class="panel panel-pad"><h2>A clear separation between observation and prediction.</h2><p style="margin:14px 0 0">Monitoring is active for this connection. Predictive alerts become available after a trained and validated model is integrated.</p></section>`;
}

export function telemetryChart(rows, metric) {
  if (!rows.length) return '<p>No recorded samples.</p>';
  const samples = rows.slice(-60);
  const maximum = metric === 'tps' ? 20 : metric === 'entities' ? Math.max(1, ...samples.map(row => row.entities)) * 1.1 : 100;
  const points = samples.map((row, index) => [45 + index / Math.max(1, samples.length - 1) * 600, 190 - row[metric] / maximum * 160]);
  const path = points.map((point, index) => (index ? 'L' : 'M') + point.join(',')).join(' ');
  const grid = Array.from({ length: 5 }, (_, i) => `<line x1="45" y1="${30 + i * 40}" x2="645" y2="${30 + i * 40}" stroke="#26394a" stroke-dasharray="3 5"/><text x="3" y="${34 + i * 40}">${Math.round(maximum * (1 - i / 4))}</text>`).join('');
  return `<svg viewBox="0 0 670 225" role="img" aria-label="Recorded ${metric} readings">${grid}<path d="${path}" fill="none" stroke="#8af2c4" stroke-width="2" stroke-linejoin="round"/><circle cx="${points.at(-1)[0]}" cy="${points.at(-1)[1]}" r="3" fill="#8af2c4"/><text x="45" y="217">${safe(new Date(samples[0].timestamp).toLocaleTimeString())}</text><text x="645" y="217" text-anchor="end">${safe(new Date(samples.at(-1).timestamp).toLocaleTimeString())}</text></svg>`;
}

export function history(data, server, metric = 'cpu') {
  if (!server) return emptyDashboard(data.servers, server);
  return title('Telemetry history', 'Actual samples retained for 30 days. Offline readings remain explicitly historical.', data.servers, server.id) +
    `${!server.online ? '<div class="notice amber">This server is not currently connected. Any samples below are historical readings.</div>' : ''}<section class="panel"><div class="panel-heading"><h2>Recorded signals</h2><div class="chart-controls">${['cpu', 'memory', 'tps', 'entities'].map(key => `<button data-metric="${key}" class="${key === metric ? 'active' : ''}">${key.toUpperCase()}</button>`).join('')}</div></div><div class="telemetry-chart">${telemetryChart(data.telemetry, metric)}</div></section><section class="panel"><div class="panel-heading"><h2>Raw telemetry</h2><div class="actions"><button class="text-link" data-export="csv">↓ CSV</button><button class="text-link" data-export="json">↓ JSON</button></div></div><div class="table-scroll"><table><thead><tr><th>TIME</th><th>CPU</th><th>HEAP</th><th>TPS</th><th>MSPT</th><th>ENTITIES</th><th>PLAYERS</th></tr></thead><tbody>${data.telemetry.slice().reverse().map(row => `<tr><td>${safe(new Date(row.timestamp).toLocaleString())}</td><td>${row.cpu}%</td><td>${row.memory}%</td><td>${row.tps}</td><td>${row.mspt ?? '—'}</td><td>${row.entities}</td><td>${row.players}</td></tr>`).join('') || '<tr><td colspan="7">No telemetry has been received.</td></tr>'}</tbody></table></div><div class="table-note">${data.telemetry.length} most recent samples shown. Exports contain these same recorded values.</div></section>`;
}

export function predictions(data, server) {
  return title('Predictions & model status', 'Measured confidence belongs here, once a trained model is connected.', data.servers, server?.id) + `${server ? '<section class="panel panel-pad"><h2>Build your real training dataset</h2><p>Record confirmed server incidents, then export telemetry with those labels. Include long periods of confirmed healthy operation. Client startup reports alone cannot train server forecasting.</p><div class="actions" style="margin-top:20px"><button class="button primary" id="label-incident">Label a real incident</button><button class="button" id="export-training">Export training data</button><a class="button" href="training-source.zip" download>Training code and guide</a></div><p class="field-hint">Exports include the latest 10,000 samples and incident labels. Download regularly to preserve a larger dataset. Player counts are aggregated.</p></section>' : ''}<section class="empty-state"><div class="empty-symbol">◇</div><span class="tag purple">MODEL NOT CONNECTED</span><h2 style="margin-top:22px">No predictions available.</h2><p>A trained LSTM inference service has not been connected to this version. Precision, recall, latency and failure probability cannot be reported yet.</p></section><section class="panel panel-pad" style="margin-top:22px"><h2>Research targets</h2><dl class="definition-list"><div><dt>Prediction horizon</dt><dd>5 minutes before instability</dd></div><div><dt>Precision / recall baseline</dt><dd>80% target, not measured</dd></div><div><dt>Processing latency</dt><dd>Below 2 seconds target</dd></div><div><dt>Input signals</dt><dd>CPU, memory, TPS, entities</dd></div></dl><p style="margin:20px 0 0">Train, evaluate and version the Python/LSTM model using time-ordered telemetry and labeled failures before enabling real alerts.</p></section>`;
}

export function remediation(data, server, includeCleared = false) {
  return title('Remediation controls', 'Observe first. Review evidence. Keep the administrator in control.', data.servers, server?.id) +
    `<section class="panel panel-pad"><div class="setting-row"><div><b>Manual override</b><p>Block automated actions for this server. Enforced in saved server policy.</p></div><button class="switch ${server?.manualOverride ? 'on' : ''}" id="override" role="switch" aria-checked="${!!server?.manualOverride}" aria-label="Manual override" ${!server ? 'disabled' : ''}><span></span></button></div><div class="setting-row"><div><b>Automatic server commands</b><p>The Forge and Fabric mods collect readings. Server commands are under development.</p></div><span class="tag">UNDER DEVELOPMENT</span></div><div class="setting-row"><div><b>Garbage collection and entity removal</b><p>These operations are not reversible by default and are excluded from automatic execution.</p></div><span class="tag amber">NOT ENABLED</span></div></section>` + auditLog(data.audit, includeCleared);
}


// Cleared entries stay available for review during the account's audit window.
export function auditLog(entries, includeCleared = false) {
  const current = entries.filter(row => !row.cleared);
  const visible = includeCleared ? entries : current;
  const rows = visible.map(row => `<tr>
    <td>${safe(new Date(row.timestamp).toLocaleString())}</td>
    <td>${safe(row.action)}${includeCleared && row.cleared ? ' <small class="audit-status">Cleared</small>' : ''}</td>
    <td>${safe(row.detail)}</td>
  </tr>`).join('');
  const empty = entries.length ? 'History cleared. New actions will appear here.' : 'No recorded actions.';
  const toggle = current.length < entries.length
    ? `<button class="button small" id="toggle-audit" aria-pressed="${includeCleared}">${includeCleared ? 'Hide' : 'Show'} cleared entries</button>` : '';

  return `<section class="panel" aria-labelledby="audit-heading">
    <div class="panel-heading"><h2 id="audit-heading">Account audit log</h2><div class="actions audit-actions">
      ${toggle}<button class="button small" id="clear-audit" ${current.some(row => row.id) ? '' : 'disabled'}>Clear history</button>
    </div></div>
    <div class="table-scroll"><table><thead><tr><th>Time</th><th>Action</th><th>Detail</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="3">${empty}</td></tr>`}</tbody></table></div>
    <div class="table-note">Up to 100 recent account actions from the past 90 days.</div>
  </section>`;
}

export function agentSetup(data, server) {
  const version = server?.minecraftVersion;
  const heading = title('Connect the Minecraft agent', 'Install the agent for your server software and Minecraft version.', data.servers, server?.id);
  if (!minecraftVersions.includes(version)) {
    const action = server ? 'data-tab="Settings"' : 'id="first-server"';
    return heading + `<section class="panel panel-pad"><h2>Choose a Minecraft version</h2>
      <p>${server ? 'Set the version of this server in Settings.' : 'Register a Minecraft server and choose its Java Edition release.'}</p>
      <button class="button primary" ${action}>${server ? 'Open Settings' : 'Connect a server'}</button></section>`;
  }
  if (!agentVersions.includes(version)) {
    return heading + `<section class="panel panel-pad"><h2>${safe(server.loader)} ${safe(version)} setup</h2>
      <p>Your server is set to Minecraft ${safe(version)}. A monitoring download for this release is not available yet.</p>
      <button class="button" data-tab="Settings">Open Settings</button></section>`;
  }
  return heading + modGuide(server);
}

export function settingsPage(data, server) {
  if (!server) return emptyDashboard(data.servers, server);
  return title('Server policy', 'Simple settings, saved securely with your account.', data.servers, server?.id) + (!server ? emptyDashboard(data.servers, server) : `<form id="policy-form" class="panel panel-pad"><div class="field-grid"><div>${loaderField(server.loader)}${versionField(server.minecraftVersion)}</div><div><label for="server-name">Server name</label><input id="server-name" name="name" maxlength="60" value="${safe(server.name)}" required></div><div><label for="threshold">Future alert confidence threshold (%)</label><input id="threshold" name="threshold" type="number" min="50" max="99" value="${server.threshold}" required></div></div><p class="field-hint">The threshold is stored for the future model integration. It does not produce predictions or execute actions in this version.</p><div class="actions" style="margin-top:25px"><button class="button primary small" type="submit">Save policy</button><button class="button small" type="button" id="rotate-key">Replace agent key</button></div><p class="field-hint">Replacing a key immediately disables the old one. Update the mod configuration to reconnect.</p></form>${invitePanel()}<section class="panel panel-pad danger-zone"><h2>Delete server connection</h2><p>Removes saved telemetry and player access, and disables the agent key. It does not delete your Minecraft world or stop the server.</p><button class="button danger" id="delete-server" type="button">Delete server</button></section>`);
}

export function livePlayers(data, server) {
  if (!server) return emptyDashboard(data.servers, server);
  const sample = server.online ? data.telemetry.at(-1) : null;
  return title('Live players', 'The monitoring mod records how many players are online.', data.servers, server.id) +
    `<section class="panel panel-pad"><h2>Online players</h2><p>${sample ? safe(String(sample.players)) : 'Waiting for a current reading.'}</p></section>`;
}
