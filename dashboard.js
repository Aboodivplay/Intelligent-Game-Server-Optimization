import { invitePanel } from './sharing.js';
import { loaderField, modGuide } from './monitoring.js';
import { escapeHtml as safe, agentEndpoint } from './api.js?v=accounts-20261120';
import { brand } from './pages.js?v=access-20261124';

export const dashboardTabs = ['Overview', 'Live players', 'Console', 'Telemetry history', 'Predictions', 'Remediation', 'Agent setup', 'Settings'];

// Each workspace tab uses the item a player would see in an inventory slot.
const navigationItems = ['grass-block', 'name_tag', 'redstone', 'book', 'ender_pearl', 'iron_pickaxe', 'repeater', 'comparator'];

function inventorySlot(item) {
  return `<span class="inventory-slot" aria-hidden="true"><img src="assets/minecraft/${item}.png?v=vanilla" alt="" width="24" height="24"></span>`;
}

const releases = {
  '1.20.1': { java: 17, agent: 'igso-agent.jar' },
  '26.3': { java: 25, agent: 'igso-agent-26.3.jar' },
};

export function versionField(selected = '') {
  const options = Object.keys(releases).map(version =>
    `<option value="${version}" ${selected === version ? 'selected' : ''}>${version}</option>`
  ).join('');
  return `<label for="minecraft-version">Minecraft version</label>
    <select id="minecraft-version" name="minecraftVersion" required>
      <option value="" disabled ${selected ? '' : 'selected'}>Choose your server version</option>${options}
    </select>`;
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
  return title('Server overview', 'Server readings appear after your Minecraft agent connects.', servers, selected?.id) + `${selected ? `<div class="notice amber"><b>OFFLINE / NO RECENT HEARTBEAT</b> · ${selected.lastSeen ? safe(new Date(selected.lastSeen).toLocaleString()) : "Agent has not connected yet"}. Check the server or agent connection.</div>` : ""}<section class="empty-state"><img class="connection-block" src="assets/minecraft/grass-block.png?v=vanilla" width="64" height="67" alt=""><div class="eyebrow">${selected ? 'WAITING FOR REAL TELEMETRY' : 'NO SERVER CONNECTED'}</div><h2>${selected ? safe(selected.name) + ' is waiting for its agent.' : 'Connect your first Minecraft server.'}</h2><p>${selected ? 'The connection has been registered, but no fresh server telemetry is available. Install the Paper plugin using your server’s configuration, then return here.' : 'Install the matching server agent, connect it with a server-specific key, and your real server details will appear here.'}</p><button class="button primary" ${selected ? 'data-tab="Agent setup"' : 'id="first-server"'}>${selected ? 'View agent setup' : 'Set up a connection'} ↗</button><p class="field-hint">No CPU, memory, tick rate, entity count or prediction is shown without a fresh sample from your server.</p></section>`;
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
    versionNotice + `<div class="notice"><span class="live-dot"></span> ONLINE · Agent connected · last sample ${safe(new Date(sample.timestamp).toLocaleTimeString())} · ${sample.players} player${sample.players === 1 ? '' : 's'} online</div><div class="metrics-grid">${cards.map(([name, value, unit, caption]) => `<article class="metric"><label>${name}</label><strong>${value}<small>${unit}</small></strong><small>${safe(caption)}</small></article>`).join('')}</div><div class="two-columns"><section class="panel"><div class="panel-heading"><h2>CPU over time</h2><span class="tag green">REAL TELEMETRY</span></div><div class="telemetry-chart">${telemetryChart(data.telemetry, 'cpu')}</div></section><section class="panel"><div class="panel-heading"><h2>Connection details</h2></div><div class="panel-pad"><dl class="definition-list"><div><dt>Game</dt><dd>Minecraft Java</dd></div><div><dt>Platform</dt><dd>${safe(sample.platform || 'Paper')}</dd></div><div><dt>Configured version</dt><dd>${safe(server.minecraftVersion || 'Choose in Settings')}</dd></div><div><dt>Version reported by agent</dt><dd>${safe(sample.minecraftVersion || 'Awaiting a version report')}</dd></div><div><dt>Players</dt><dd>${sample.players}</dd></div><div><dt>Agent sample time</dt><dd>${safe(new Date(sample.timestamp).toLocaleString())}</dd></div><div><dt>Prediction model</dt><dd>Not connected</dd></div></dl></div></section></div><section class="panel panel-pad"><h2>A clear separation between observation and prediction.</h2><p style="margin:14px 0 0">Monitoring is active for this connection. Predictive alerts become available after a trained and validated model is integrated.</p></section>`;
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
  return title('Predictions & model status', 'Measured confidence belongs here, once a trained model is connected.', data.servers, server?.id) + `${server ? '<section class="panel panel-pad"><h2>Build your real training dataset</h2><p>Record confirmed server incidents, then export telemetry with those labels. Include long periods of confirmed healthy operation. Client startup reports alone cannot train server forecasting.</p><div class="actions" style="margin-top:20px"><button class="button primary" id="label-incident">Label a real incident</button><button class="button" id="export-training">Export training data</button><a class="button" href="training-source.zip" download>Training code and guide</a></div><p class="field-hint">Exports include the latest 10,000 samples and incident labels. Download regularly to preserve a larger dataset. No player locations or console messages are included.</p></section>' : ''}<section class="empty-state"><div class="empty-symbol">◇</div><span class="tag purple">MODEL NOT CONNECTED</span><h2 style="margin-top:22px">No predictions available.</h2><p>A trained LSTM inference service has not been connected to this version. Precision, recall, latency and failure probability cannot be reported yet.</p></section><section class="panel panel-pad" style="margin-top:22px"><h2>Research targets</h2><dl class="definition-list"><div><dt>Prediction horizon</dt><dd>5 minutes before instability</dd></div><div><dt>Precision / recall baseline</dt><dd>80% target, not measured</dd></div><div><dt>Processing latency</dt><dd>Below 2 seconds target</dd></div><div><dt>Input signals</dt><dd>CPU, memory, TPS, entities</dd></div></dl><p style="margin:20px 0 0">Train, evaluate and version the Python/LSTM model using time-ordered telemetry and labeled failures before enabling real alerts.</p></section>`;
}

export function remediation(data, server, includeCleared = false) {
  return title('Remediation controls', 'Observe first. Review evidence. Keep the administrator in control.', data.servers, server?.id) +
    `<section class="panel panel-pad"><div class="setting-row"><div><b>Manual override</b><p>Block automated actions for this server. Enforced in saved server policy.</p></div><button class="switch ${server?.manualOverride ? 'on' : ''}" id="override" role="switch" aria-checked="${!!server?.manualOverride}" aria-label="Manual override" ${!server ? 'disabled' : ''}><span></span></button></div><div class="setting-row"><div><b>Automatic server commands</b><p>Manual commands are available in Console when enabled in the agent configuration. Predictions never execute commands automatically.</p></div><span class="tag">MANUAL ONLY</span></div><div class="setting-row"><div><b>Garbage collection and entity removal</b><p>These operations are not reversible by default and are excluded from automatic execution.</p></div><span class="tag amber">NOT ENABLED</span></div></section>` + auditLog(data.audit, includeCleared);
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
  const release = releases[version];
  const heading = title('Connect the Minecraft agent', 'Install the agent for your server software and Minecraft version.', data.servers, server?.id);
  if (!release) {
    const action = server ? 'data-tab="Settings"' : 'id="first-server"';
    return heading + `<section class="panel panel-pad"><h2>Choose a Minecraft version</h2>
      <p>${server ? 'Set the version of this server in Settings.' : 'Register a Minecraft server and choose 1.20.1 or 26.3.'}</p>
      <button class="button primary" ${action}>${server ? 'Open Settings' : 'Connect a server'}</button></section>`;
  }
  if (server.loader === 'Forge' || server.loader === 'Fabric') return heading + modGuide(server);
  return heading + `<section class="panel panel-pad">
    <h2>Paper ${safe(version)} setup</h2>
    <div class="step"><b>1. Check your server</b><p>Use the agent built for Minecraft ${safe(version)}. This build needs Java ${release.java} or later. Changing the dashboard setting updates this guide and download.</p></div>
    <div class="step"><b>2. Install the agent</b><p>Stop the server and place the JAR in its <code>plugins</code> folder. Keep one copy of IGSOAgent installed.</p>
      <div class="actions"><a class="button primary small" href="${release.agent}" download>Download agent for ${safe(version)}</a><a class="button small" href="agent-source.zip" download>Java source</a></div></div>
    <div class="step"><b>3. Add your configuration</b><p>Place the <code>config.yml</code> from registration in <code>plugins/IGSOAgent/</code>. Start the server and open Overview to check the first reading and reported version.</p></div>
    <div class="step"><b>4. Choose optional permissions</b><p>The local agent configuration controls player tracking and remote console. Enable only the features you want on this server.</p></div>
  </section>`;
}

export function settingsPage(data, server) {
  if (!server) return emptyDashboard(data.servers, server);
  return title('Server policy', 'Simple settings, saved securely with your account.', data.servers, server?.id) + (!server ? emptyDashboard(data.servers, server) : `<form id="policy-form" class="panel panel-pad"><div class="field-grid"><div>${loaderField(server.loader)}${versionField(server.minecraftVersion)}</div><div><label for="server-name">Server name</label><input id="server-name" name="name" maxlength="60" value="${safe(server.name)}" required></div><div><label for="threshold">Future alert confidence threshold (%)</label><input id="threshold" name="threshold" type="number" min="50" max="99" value="${server.threshold}" required></div></div><p class="field-hint">The threshold is stored for the future model integration. It does not produce predictions or execute actions in this version.</p><div class="actions" style="margin-top:25px"><button class="button primary small" type="submit">Save policy</button><button class="button small" type="button" id="rotate-key">Replace agent key</button></div><p class="field-hint">Replacing a key immediately disables the old one. Update the plugin configuration to reconnect.</p></form>${invitePanel()}<section class="panel panel-pad danger-zone"><h2>Delete server connection</h2><p>Removes saved telemetry, player snapshot and command history, and disables the agent key. It does not delete your Minecraft world or stop the server.</p><button class="button danger" id="delete-server" type="button">Delete server</button></section>`);
}

export function livePlayers(data, server) {
  if (server && ['Forge','Fabric'].includes(server.loader)) return title('Live players', 'This monitoring mod collects aggregate player counts. See Overview for the latest count.',data.servers,server.id);
  if (!server?.online) return emptyDashboard(data.servers,server);
  const players=data.playerStates||[];
  const worlds=[...new Set(players.map(p=>p.world))];
  return title('Live players','Private snapshots every 5 seconds · AFK after 5 minutes without position changes.',data.servers,server.id)
  + (!server.trackingEnabled?'<div class="notice amber">Enable player-tracking in the latest agent configuration.</div>':'')
  + `<div class="world-maps">${worlds.map((world,i)=>{
    const rows=players.filter(p=>p.world===world), minX=Math.min(...rows.map(p=>p.x))-20,minZ=Math.min(...rows.map(p=>p.z))-20;
    const w=Math.max(40,Math.max(...rows.map(p=>p.x))-minX+20),d=Math.max(40,Math.max(...rows.map(p=>p.z))-minZ+20);
    return `<section class="panel"><div class="panel-heading"><h2>${safe(world)}</h2><span class="tag">X / Z MAP</span></div><svg class="player-map" viewBox="0 0 600 300" role="img" aria-label="Player positions in ${safe(world)}"><defs><pattern id="grid-${i}" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#8af2c422"/></pattern></defs><rect width="600" height="300" fill="url(#grid-${i})"/>${rows.map(p=>`<g transform="translate(${25+(p.x-minX)/w*550},${30+(p.z-minZ)/d*230})"><rect x="-5" y="-5" width="10" height="10" fill="${p.activity==='AFK'?'#d5b65c':p.activity==='Fighting'?'#ff8075':'#8af2c4'}"/><text x="9" y="4" fill="#fff" font-size="11">${safe(p.name)}</text><title>${safe(p.name)}: ${p.x}, ${p.y}, ${p.z}</title></g>`).join('')}<text x="15" y="290" fill="#a9c5bb" font-size="10">Relative positions · north ↑ · terrain is not loaded</text></svg></section>`;
  }).join('')}</div><section class="panel"><div class="panel-heading"><h2>${players.length} players in latest snapshot</h2><span class="tag green">OWNER ONLY</span></div><div class="table-scroll"><table><thead><tr><th>PLAYER</th><th>WORLD</th><th>X</th><th>Y</th><th>Z</th><th>ACTIVITY</th></tr></thead><tbody>${players.map(p=>`<tr><td>${safe(p.name)}</td><td>${safe(p.world)}</td><td>${p.x}</td><td>${p.y}</td><td>${p.z}</td><td><span class="tag">${safe(p.activity)}</span></td></tr>`).join('')||'<tr><td colspan="6">No player positions received.</td></tr>'}</tbody></table></div></section><p class="field-hint">Moving and Fighting cover the last 10 seconds. Idle means stationary for less than 5 minutes. Only the latest snapshot is stored. Activity timers reset when the plugin restarts.</p>`;
}
export function consolePage(data,server) {
 const enabled=server?.online&&server.consoleEnabled;
 return title('Server console','Manual commands execute on your Minecraft server with console permissions.',data.servers,server?.id)+`<div class="notice ${enabled?'':'amber'}">${enabled?'ONLINE · Console ready. The agent enforces its local allowed-command list.':'Console unavailable. Connect the latest agent and enable remote-console in its config.'}</div><section class="panel panel-pad"><form id="command-form"><label for="command-input">Minecraft command</label><div class="console-input"><span>/</span><input id="command-input" maxlength="256" autocomplete="off" spellcheck="false" placeholder="list" required ${enabled?'':'disabled'}><button class="button primary" type="submit" ${enabled?'':'disabled'}>Review command</button></div><p class="field-hint">Commands can change the world. Review before sending. Uncollected commands expire after 30 seconds. No automatic retry.</p></form></section><section class="panel"><div class="panel-heading"><h2>Command history and replies</h2><span class="tag">LAST 30</span></div><div class="console-log">${(data.commands||[]).map(row=>{const expired=Date.parse(row.expires_at)<Date.now();const status=row.status==='queued'&&expired?'expired · not delivered':row.status==='sent'&&expired?'delivery uncertain · do not retry blindly':row.status;return `<article><small>${safe(new Date(row.created_at).toLocaleString())} · ${safe(status)}</small><pre>&gt; ${safe(row.command)}</pre><pre class="command-output">${safe(row.output||(row.status==='sent'?'Awaiting agent acknowledgement…':'Waiting for the agent…'))}</pre></article>`;}).join('')||'<p>No commands submitted.</p>'}</div></section>`;
}
