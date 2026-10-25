import { escapeHtml as safe } from './api.js';
import { brand } from './pages.js';

export const dashboardTabs = ['Overview', 'Telemetry history', 'Predictions', 'Remediation', 'Agent setup', 'Settings'];

export function dashboardShell(user, activeTab, content) {
  return `<header class="workspace-header">${brand()}<div class="actions"><span class="user-label">${safe(user.name)}</span><a class="text-link" href="#games">← Games</a><button class="button small" id="logout">Log out</button></div></header><div class="workspace"><aside class="workspace-sidebar"><div class="current-game"><strong>Minecraft</strong><small>JAVA EDITION / PAPER</small></div><nav aria-label="Minecraft workspace">${dashboardTabs.map(tab => `<button data-tab="${tab}" class="${tab === activeTab ? 'active' : ''}" ${tab === activeTab ? 'aria-current="page"' : ''}>${tab}</button>`).join('')}</nav><p>Only your real servers appear here.<br>No generated metrics.<br>No demonstration forecasts.</p></aside><main class="workspace-main" id="content">${content}</main></div>`;
}

function title(titleText, subtitle, servers = [], selectedId = '') {
  return `<div class="workspace-title"><div><div class="eyebrow">MINECRAFT / CONTROL ROOM</div><h1>${titleText}</h1><p>${subtitle}</p></div><div class="actions">${servers.length ? `<select class="server-select" id="server-select" aria-label="Selected server">${servers.map(server => `<option value="${safe(server.id)}" ${server.id === selectedId ? 'selected' : ''}>${safe(server.name)}</option>`).join('')}</select>` : ''}<button class="button primary small" id="connect-server">+ Connect server</button></div></div>`;
}

export function emptyDashboard(servers, selected) {
  return title('Your world starts with a connection.', 'Server readings appear after your Minecraft agent connects.', servers, selected?.id) + `<section class="empty-state"><div class="empty-symbol">▧</div><div class="eyebrow">${selected ? 'WAITING FOR REAL TELEMETRY' : 'NO SERVER CONNECTED'}</div><h2>${selected ? safe(selected.name) + ' is waiting for its agent.' : 'Connect your first Minecraft server.'}</h2><p>${selected ? 'The connection has been registered, but no fresh server telemetry is available. Install the Paper plugin using your server’s configuration, then return here.' : 'Install the lightweight Paper plugin, connect it with a server-specific key, and your real server details will appear here.'}</p><button class="button primary" ${selected ? 'data-tab="Agent setup"' : 'id="first-server"'}>${selected ? 'View agent setup' : 'Set up a connection'} ↗</button><p class="field-hint">No CPU, memory, tick rate, entity count or prediction is shown without a fresh sample from your server.</p></section>`;
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
    `<div class="notice"><span class="live-dot"></span> Agent connected · last sample ${safe(new Date(sample.timestamp).toLocaleTimeString())} · ${sample.players} player${sample.players === 1 ? '' : 's'} online</div><div class="metrics-grid">${cards.map(([name, value, unit, caption]) => `<article class="metric"><label>${name}</label><strong>${value}<small>${unit}</small></strong><small>${safe(caption)}</small></article>`).join('')}</div><div class="two-columns"><section class="panel"><div class="panel-heading"><h2>CPU over time</h2><span class="tag green">REAL TELEMETRY</span></div><div class="telemetry-chart">${telemetryChart(data.telemetry, 'cpu')}</div></section><section class="panel"><div class="panel-heading"><h2>Connection details</h2></div><div class="panel-pad"><dl class="definition-list"><div><dt>Game</dt><dd>Minecraft Java</dd></div><div><dt>Platform</dt><dd>${safe(sample.platform || 'Paper')}</dd></div><div><dt>Players</dt><dd>${sample.players}</dd></div><div><dt>Agent sample time</dt><dd>${safe(new Date(sample.timestamp).toLocaleString())}</dd></div><div><dt>Prediction model</dt><dd>Not connected</dd></div></dl></div></section></div><section class="panel panel-pad"><h2>A clear separation between observation and prediction.</h2><p style="margin:14px 0 0">These are measured server values. The project’s LSTM model is not bundled or running. No failure probability is invented from a CPU threshold.</p></section>`;
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
  return title('Predictions & model status', 'Measured confidence belongs here, once a trained model is connected.', data.servers, server?.id) + `<section class="empty-state"><div class="empty-symbol">◇</div><span class="tag purple">MODEL NOT CONNECTED</span><h2 style="margin-top:22px">No predictions available.</h2><p>A trained LSTM inference service has not been connected to this version. Precision, recall, latency and failure probability cannot be reported yet.</p></section><section class="panel panel-pad" style="margin-top:22px"><h2>Research targets</h2><dl class="definition-list"><div><dt>Prediction horizon</dt><dd>5–10 minutes before instability</dd></div><div><dt>Precision / recall baseline</dt><dd>80% target, not measured</dd></div><div><dt>Processing latency</dt><dd>Below 2 seconds target</dd></div><div><dt>Input signals</dt><dd>CPU, memory, TPS, entities</dd></div></dl><p style="margin:20px 0 0">Train, evaluate and version the Python/LSTM model using time-ordered telemetry and labeled failures before enabling real alerts.</p></section>`;
}

export function remediation(data, server) {
  return title('Remediation controls', 'Observe first. Review evidence. Keep the administrator in control.', data.servers, server?.id) +
    `<section class="panel panel-pad"><div class="setting-row"><div><b>Manual override</b><p>Block automated actions for this server. Enforced in saved server policy.</p></div><button class="switch ${server?.manualOverride ? 'on' : ''}" id="override" role="switch" aria-checked="${!!server?.manualOverride}" aria-label="Manual override" ${!server ? 'disabled' : ''}><span></span></button></div><div class="setting-row"><div><b>Automatic server commands</b><p>No game-server command executor is integrated. No command is sent by this website.</p></div><span class="tag">UNAVAILABLE</span></div><div class="setting-row"><div><b>Garbage collection and entity removal</b><p>These operations are not reversible by default and are excluded from automatic execution.</p></div><span class="tag amber">NOT ENABLED</span></div></section><section class="panel"><div class="panel-heading"><h2>Account audit log</h2></div><div class="table-scroll"><table><thead><tr><th>TIME</th><th>ACTION</th><th>DETAIL</th></tr></thead><tbody>${data.audit.map(row => `<tr><td>${safe(new Date(row.timestamp).toLocaleString())}</td><td>${safe(row.action)}</td><td>${safe(row.detail)}</td></tr>`).join('') || '<tr><td colspan="3">No recorded actions.</td></tr>'}</tbody></table></div></section>`;
}

export function agentSetup(data, server) {
  return title('Connect the Minecraft agent', 'Paper plugin · Java 17+ · HTTPS telemetry.', data.servers, server?.id) +
    `<section class="panel panel-pad"><h2>From a running world to real telemetry.</h2><div class="step"><b>01 / Register a server connection</b><p>Choose “Connect server” to register your Minecraft server. You receive a server-specific key once. Store that key only in the plugin configuration on your server.</p></div><div class="step"><b>02 / Install the Paper plugin</b><p>Download the compiled plugin and place it in your Paper server’s <code>plugins</code> folder. The Java source is also available to study or build yourself with <code>mvn package</code>.</p><div class="actions"><a class="button primary small" href="igso-agent.jar" download>↓ Download plugin JAR</a><a class="button small" href="agent-source.zip" download>↓ Readable Java source</a></div></div><div class="step"><b>03 / Configure and start the agent</b><p>Start Paper once to create the plugin folder, stop it, and place your downloaded <code>config.yml</code> in <code>plugins/IGSOAgent</code>. Restart Paper. Every five seconds, the agent sends genuine readings.</p><pre class="code">endpoint: https://sentinel-game-server-engine.abdiviwjjdjdjsjjehh.chatgpt.site/api/telemetry
server-id: ${safe(server?.id || 'YOUR_SERVER_ID')}
agent-key: YOUR_PRIVATE_AGENT_KEY
interval-seconds: 5</pre></div><div class="step"><b>04 / Verify the connection</b><p>The Overview begins showing details after fresh telemetry arrives. A connection expires from the live view after 30 seconds without a new sample.</p></div><p class="field-hint">A hosting address alone cannot expose Minecraft CPU or loaded entities. The authenticated agent is required. Vanilla, Forge and other games are not supported by this Paper plugin.</p></section>`;
}

export function settingsPage(data, server) {
  if (!server) return emptyDashboard(data.servers, server);
  return title('Server policy', 'Simple settings, saved securely with your account.', data.servers, server?.id) + (!server ? emptyDashboard(data.servers, server) : `<form id="policy-form" class="panel panel-pad"><div class="field-grid"><div><label for="server-name">Server name</label><input id="server-name" name="name" maxlength="60" value="${safe(server.name)}" required></div><div><label for="threshold">Future alert confidence threshold (%)</label><input id="threshold" name="threshold" type="number" min="50" max="99" value="${server.threshold}" required></div></div><p class="field-hint">The threshold is stored for the future model integration. It does not produce predictions or execute actions in this version.</p><div class="actions" style="margin-top:25px"><button class="button primary small" type="submit">Save policy</button></div></form>`);
}
