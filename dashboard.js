import { escapeHtml as safe, agentEndpoint } from './api.js?v=overworld-20261025-1';
import { brand } from './pages.js?v=overworld-20261025-1';

export const dashboardTabs = ['Overview', 'Live players', 'Console', 'Telemetry history', 'Predictions', 'Remediation', 'Agent setup', 'Settings'];

// Small inline icons keep navigation crisp without an icon dependency.
const navigationIcons = [
  '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a4 4 0 0 1 3 4v2"/>',
  '<path d="m4 6 6 6-6 6m9 0h7"/>',
  '<path d="M3 3v18h18M6 15l4-5 4 3 6-8"/>',
  '<path d="m3 17 5-7 5 4 8-10M16 4h5v5"/>',
  '<path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6"/>',
  '<path d="M8 3v5m8-5v5M5 8h14v5a7 7 0 0 1-14 0zM12 20v3"/>',
  '<path d="M4 6h16M4 12h16M4 18h16"/><rect x="7" y="4" width="3" height="4"/><rect x="15" y="10" width="3" height="4"/><rect x="8" y="16" width="3" height="4"/>',
];

// A lightweight block landscape: no video, canvas loop, or remote images.
function landscape() {
  const trees = [[615,110,1],[715,90,.8],[1030,105,1.3],[1140,130,.9]];
  return `<svg class="voxel-landscape" viewBox="0 0 1280 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="mc-sky" x2="0" y2="1"><stop stop-color="#42697b"/><stop offset="1" stop-color="#a3b7a0"/></linearGradient><linearGradient id="mc-lake" x2="0" y2="1"><stop stop-color="#429ca6"/><stop offset="1" stop-color="#235166"/></linearGradient><pattern id="mc-stone" width="32" height="24" patternUnits="userSpaceOnUse"><path d="M0 0h32v24H0z" fill="#435951"/><path d="M0 1h31M16 1v11M0 13h32M6 13v11" stroke="#52675a" stroke-width="2"/></pattern></defs>
    <path fill="url(#mc-sky)" d="M0 0h1280v260H0z"/>
    <path fill="#f3dfaa" d="M1005 25h45v45h-45z"/><path fill="#ebf2d7" opacity=".38" d="M535 42h55V28h80v14h70v18H535zM1070 78h45V65h60v13h105v17h-210z"/>
    <path fill="#5d8581" d="M350 180v-35h60v-30h70V88h80v35h80v30h80v-40h60V78h70v-30h70v40h60v40h80v-23h100v50h120v105H350z"/>
    <path fill="#315e58" d="M480 240V150h90v-22h60v30h100v25h100v-52h65v-21h90v28h75v38h110v-28h110v112H480z"/>
    <path fill="url(#mc-lake)" d="M0 187h1280v73H0z"/>
    <g class="lake-reflections" fill="#a5e0d2" opacity=".32"><path d="M680 208h85v3h-85zM820 231h100v3H820zM1070 207h100v3h-100zM940 250h70v3h-70zM540 242h90v3h-90zM1150 237h90v3h-90z"/></g>
    <path fill="url(#mc-stone)" d="M540 166h180v24h65v31H670v-12H540zM980 157h300v103h-65v-25h-80v-29H980z"/>
    <path fill="#75a253" d="m540 166 40-22h155l-15 22zM720 190l15-24h65l-15 24zM980 157l45-25h255v25z"/>
    <path fill="#48763e" d="M540 166h180v8H540zM720 190h65v7h-65zM980 157h300v9H980z"/>
    ${trees.map(([x,y,k])=>`<g transform="translate(${x} ${y}) scale(${k})"><path fill="#66513a" d="M-6 0H7v42H-6z"/><path fill="#284f39" d="M-32-25h64v41h-64z"/><path fill="#4b7b43" d="m-32-25 15-12h64L32-25z"/><path fill="#39683b" d="M32-25 47-37V4L32 16z"/><path fill="#477a40" d="M-23-16h17v12h-17zM5-20h20v9H5zM-9 3H6v10H-9z"/></g>`).join('')}
    <path fill="#6f9050" d="M1170 212h42v5h-42zM1120 181h30v5h-30z"/>
  </svg>`;
}

export function dashboardShell(user, activeTab, content) {
  return `<header class="workspace-header">${brand()}<div class="actions"><span class="user-label">${safe(user.name)}</span><a class="text-link" href="#games">← Games</a><button class="button small" id="logout">Log out</button></div></header>
    <section class="mc-panorama" aria-label="Minecraft workspace">
      ${landscape()}
      <div class="panorama-copy"><span class="edition-label">JAVA EDITION <i></i> PAPER</span><strong>MINECRAFT</strong><p>Your world. Under control.</p></div>
      <div class="panorama-block"><div class="grass-block"><i></i><b></b><span></span></div></div>
      <span class="panorama-caption">THE OVERWORLD / SERVER WORKSPACE</span>
    </section>
    <div class="workspace"><aside class="workspace-sidebar">
      <div class="current-game"><span class="game-texture" aria-hidden="true"></span><div><strong>Minecraft</strong><small>SERVER WORKSPACE</small></div></div>
      <span class="nav-label">CONTROL CENTER</span>
      <nav aria-label="Minecraft workspace">${dashboardTabs.map((tab,i) => `<button data-tab="${tab}" class="${tab === activeTab ? 'active' : ''}" ${tab === activeTab ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${navigationIcons[i]}</svg><span>${tab}</span></button>`).join('')}</nav>
      <div class="sidebar-note"><span class="note-square" aria-hidden="true"></span><div>Built for your world<small>Minecraft Java · Paper<br>Private server workspace</small></div></div>
    </aside><main class="workspace-main" id="content">${content}</main></div>`;
}

function title(titleText, subtitle, servers = [], selectedId = '') {
  return `<div class="workspace-title"><div><div class="eyebrow">MINECRAFT / CONTROL ROOM</div><h1>${titleText}</h1><p>${subtitle}</p></div><div class="actions">${servers.length ? `<select class="server-select" id="server-select" aria-label="Selected server">${servers.map(server => `<option value="${safe(server.id)}" ${server.id === selectedId ? 'selected' : ''}>${safe(server.name)}</option>`).join('')}</select>` : ''}<button class="button primary small" id="connect-server">+ Connect server</button></div></div>`;
}

export function emptyDashboard(servers, selected) {
  return title('Your world starts with a connection.', 'Server readings appear after your Minecraft agent connects.', servers, selected?.id) + `${selected ? `<div class="notice amber"><b>OFFLINE / NO RECENT HEARTBEAT</b> · ${selected.lastSeen ? safe(new Date(selected.lastSeen).toLocaleString()) : "Agent has not connected yet"}. Check the server or agent connection.</div>` : ""}<section class="empty-state"><div class="empty-symbol">▧</div><div class="eyebrow">${selected ? 'WAITING FOR REAL TELEMETRY' : 'NO SERVER CONNECTED'}</div><h2>${selected ? safe(selected.name) + ' is waiting for its agent.' : 'Connect your first Minecraft server.'}</h2><p>${selected ? 'The connection has been registered, but no fresh server telemetry is available. Install the Paper plugin using your server’s configuration, then return here.' : 'Install the lightweight Paper plugin, connect it with a server-specific key, and your real server details will appear here.'}</p><button class="button primary" ${selected ? 'data-tab="Agent setup"' : 'id="first-server"'}>${selected ? 'View agent setup' : 'Set up a connection'} ↗</button><p class="field-hint">No CPU, memory, tick rate, entity count or prediction is shown without a fresh sample from your server.</p></section>`;
}

export function overview(data, server) {
  const sample = data.telemetry.at(-1);
  if (!server?.online || !sample) return emptyDashboard(data.servers, server);
  const cards = [
    ['Host CPU', sample.cpu.toFixed(1), '%', 'Measured on your server host'],
    ['Java heap', sample.memory.toFixed(1), '%', `${sample.memoryUsedMb || '—'} / ${sample.memoryMaxMb || '—'} MB`],
    ['Tick rate', sample.tps.toFixed(2), 'TPS', 'Minecraft target: 20 TPS'],
    ['Loaded entities', sample.entities.toLocaleString(), '', 'All loaded worlds'],
  ];
  return title(safe(server.name), 'Real telemetry from your connected Minecraft server.', data.servers, server.id) +
    `<div class="notice"><span class="live-dot"></span> ONLINE · Agent connected · last sample ${safe(new Date(sample.timestamp).toLocaleTimeString())} · ${sample.players} player${sample.players === 1 ? '' : 's'} online</div><div class="metrics-grid">${cards.map(([name, value, unit, caption]) => `<article class="metric"><label>${name}</label><strong>${value}<small>${unit}</small></strong><small>${safe(caption)}</small></article>`).join('')}</div><div class="two-columns"><section class="panel"><div class="panel-heading"><h2>CPU over time</h2><span class="tag green">REAL TELEMETRY</span></div><div class="telemetry-chart">${telemetryChart(data.telemetry, 'cpu')}</div></section><section class="panel"><div class="panel-heading"><h2>Connection details</h2></div><div class="panel-pad"><dl class="definition-list"><div><dt>Game</dt><dd>Minecraft Java</dd></div><div><dt>Platform</dt><dd>${safe(sample.platform || 'Paper')}</dd></div><div><dt>Players</dt><dd>${sample.players}</dd></div><div><dt>Agent sample time</dt><dd>${safe(new Date(sample.timestamp).toLocaleString())}</dd></div><div><dt>Prediction model</dt><dd>Not connected</dd></div></dl></div></section></div><section class="panel panel-pad"><h2>A clear separation between observation and prediction.</h2><p style="margin:14px 0 0">Monitoring is active for this connection. Predictive alerts become available after a trained and validated model is integrated.</p></section>`;
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
    `${!server.online ? '<div class="notice amber">This server is not currently connected. Any samples below are historical readings.</div>' : ''}<section class="panel"><div class="panel-heading"><h2>Recorded signals</h2><div class="chart-controls">${['cpu', 'memory', 'tps', 'entities'].map(key => `<button data-metric="${key}" class="${key === metric ? 'active' : ''}">${key.toUpperCase()}</button>`).join('')}</div></div><div class="telemetry-chart">${telemetryChart(data.telemetry, metric)}</div></section><section class="panel"><div class="panel-heading"><h2>Raw telemetry</h2><div class="actions"><button class="text-link" data-export="csv">↓ CSV</button><button class="text-link" data-export="json">↓ JSON</button></div></div><div class="table-scroll"><table><thead><tr><th>TIME</th><th>CPU</th><th>HEAP</th><th>TPS</th><th>ENTITIES</th><th>PLAYERS</th></tr></thead><tbody>${data.telemetry.slice().reverse().map(row => `<tr><td>${safe(new Date(row.timestamp).toLocaleString())}</td><td>${row.cpu}%</td><td>${row.memory}%</td><td>${row.tps}</td><td>${row.entities}</td><td>${row.players}</td></tr>`).join('') || '<tr><td colspan="6">No telemetry has been received.</td></tr>'}</tbody></table></div><div class="table-note">${data.telemetry.length} most recent samples shown. Exports contain these same recorded values.</div></section>`;
}

export function predictions(data, server) {
  return title('Predictions & model status', 'Measured confidence belongs here, once a trained model is connected.', data.servers, server?.id) + `${server ? '<section class="panel panel-pad"><h2>Build your real training dataset</h2><p>Record confirmed server incidents, then export telemetry with those labels. Include long periods of confirmed healthy operation. Client startup reports alone cannot train server forecasting.</p><div class="actions" style="margin-top:20px"><button class="button primary" id="label-incident">Label a real incident</button><button class="button" id="export-training">Export training data</button><a class="button" href="training-source.zip" download>Training code and guide</a></div><p class="field-hint">Exports include the latest 10,000 samples and incident labels. Download regularly to preserve a larger dataset. No player locations or console messages are included.</p></section>' : ''}<section class="empty-state"><div class="empty-symbol">◇</div><span class="tag purple">MODEL NOT CONNECTED</span><h2 style="margin-top:22px">No predictions available.</h2><p>A trained LSTM inference service has not been connected to this version. Precision, recall, latency and failure probability cannot be reported yet.</p></section><section class="panel panel-pad" style="margin-top:22px"><h2>Research targets</h2><dl class="definition-list"><div><dt>Prediction horizon</dt><dd>5–10 minutes before instability</dd></div><div><dt>Precision / recall baseline</dt><dd>80% target, not measured</dd></div><div><dt>Processing latency</dt><dd>Below 2 seconds target</dd></div><div><dt>Input signals</dt><dd>CPU, memory, TPS, entities</dd></div></dl><p style="margin:20px 0 0">Train, evaluate and version the Python/LSTM model using time-ordered telemetry and labeled failures before enabling real alerts.</p></section>`;
}

export function remediation(data, server) {
  return title('Remediation controls', 'Observe first. Review evidence. Keep the administrator in control.', data.servers, server?.id) +
    `<section class="panel panel-pad"><div class="setting-row"><div><b>Manual override</b><p>Block automated actions for this server. Enforced in saved server policy.</p></div><button class="switch ${server?.manualOverride ? 'on' : ''}" id="override" role="switch" aria-checked="${!!server?.manualOverride}" aria-label="Manual override" ${!server ? 'disabled' : ''}><span></span></button></div><div class="setting-row"><div><b>Automatic server commands</b><p>Manual commands are available in Console when enabled in the agent configuration. Predictions never execute commands automatically.</p></div><span class="tag">MANUAL ONLY</span></div><div class="setting-row"><div><b>Garbage collection and entity removal</b><p>These operations are not reversible by default and are excluded from automatic execution.</p></div><span class="tag amber">NOT ENABLED</span></div></section><section class="panel"><div class="panel-heading"><h2>Account audit log</h2></div><div class="table-scroll"><table><thead><tr><th>TIME</th><th>ACTION</th><th>DETAIL</th></tr></thead><tbody>${data.audit.map(row => `<tr><td>${safe(new Date(row.timestamp).toLocaleString())}</td><td>${safe(row.action)}</td><td>${safe(row.detail)}</td></tr>`).join('') || '<tr><td colspan="3">No recorded actions.</td></tr>'}</tbody></table></div></section>`;
}

export function agentSetup(data, server) {
  return title('Connect the Minecraft agent', 'Paper plugin · Java 17+ · HTTPS telemetry.', data.servers, server?.id) +
    `<section class="panel panel-pad"><h2>From a running world to real telemetry.</h2><div class="step"><b>01 / Register a server connection</b><p>Choose “Connect server” to register your Minecraft server. You receive a server-specific key once. Store that key only in the plugin configuration on your server.</p></div><div class="step"><b>02 / Install the Paper plugin</b><p>Download the compiled plugin and place it in your Paper server’s <code>plugins</code> folder. The Java source is also available to study or build yourself with <code>mvn package</code>.</p><div class="actions"><a class="button primary small" href="igso-agent.jar" download>↓ Download plugin JAR</a><a class="button small" href="agent-source.zip" download>↓ Readable Java source</a></div></div><div class="step"><b>03 / Configure and start the agent</b><p>Start Paper once to create the plugin folder, stop it, and place your downloaded <code>config.yml</code> in <code>plugins/IGSOAgent</code>. Restart Paper. Every five seconds, the agent sends genuine readings.</p><pre class="code">endpoint: ${safe(agentEndpoint() || 'YOUR_INGESTION_ENDPOINT')}
server-id: ${safe(server?.id || 'YOUR_SERVER_ID')}
agent-key: YOUR_PRIVATE_AGENT_KEY
interval-seconds: 5</pre></div><div class="step"><b>04 / Verify the connection</b><p>The Overview begins showing details after fresh telemetry arrives. A connection expires from the live view after 30 seconds without a new sample.</p></div><div class="step"><b>05 / Live players and console</b><p>Install the latest plugin. Set <code>player-tracking: true</code> to share positions privately. For commands, set <code>remote-console.enabled</code> to <code>true</code> and configure its <code>allowed-commands</code> list. Default roots: list, say, time, weather, difficulty, save-all. Restart Paper after editing. Commands run with console permissions.</p></div><p class="field-hint">A hosting address alone cannot expose Minecraft CPU or loaded entities. The authenticated agent is required. Vanilla, Forge and other games are not supported by this Paper plugin.</p></section>`;
}

export function settingsPage(data, server) {
  if (!server) return emptyDashboard(data.servers, server);
  return title('Server policy', 'Simple settings, saved securely with your account.', data.servers, server?.id) + (!server ? emptyDashboard(data.servers, server) : `<form id="policy-form" class="panel panel-pad"><div class="field-grid"><div><label for="server-name">Server name</label><input id="server-name" name="name" maxlength="60" value="${safe(server.name)}" required></div><div><label for="threshold">Future alert confidence threshold (%)</label><input id="threshold" name="threshold" type="number" min="50" max="99" value="${server.threshold}" required></div></div><p class="field-hint">The threshold is stored for the future model integration. It does not produce predictions or execute actions in this version.</p><div class="actions" style="margin-top:25px"><button class="button primary small" type="submit">Save policy</button><button class="button small" type="button" id="rotate-key">Replace agent key</button></div><p class="field-hint">Replacing a key immediately disables the old one. Update the plugin configuration to reconnect.</p></form><section class="panel panel-pad danger-zone"><h2>Delete server connection</h2><p>Removes saved telemetry, player snapshot and command history, and disables the agent key. It does not delete your Minecraft world or stop the server.</p><button class="button danger" id="delete-server" type="button">Delete server</button></section>`);
}

export function livePlayers(data, server) {
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
