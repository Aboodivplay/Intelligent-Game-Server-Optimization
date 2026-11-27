import { agentEndpoint, escapeHtml as safe } from './api.js?v=accounts-20261120';

import { minecraftLoaders } from './supabase/functions/igso-api/minecraft-versions.js';

export function loaderField(selected = '') {
  return `<label for="server-loader">Server software</label><select id="server-loader" name="loader" required>
    <option value="" disabled ${selected ? '' : 'selected'}>Choose your server software</option>
    ${minecraftLoaders.map(name => `<option value="${name}" ${selected === name ? 'selected' : ''}>${name}</option>`).join('')}</select>`;
}

// Both monitoring mods read the same properties file from the server's config folder.
export function agentConfig(server, key) {
  return {name:'igso.properties', folder:'config/', text:`endpoint=${agentEndpoint()}\nserver-id=${server.id}\nagent-key=${key}\ninterval-seconds=2\n`};
}

export function modGuide(server) {
  const loader = server.loader;
  const version = server.minecraftVersion;
  const jar = `igso-${loader.toLowerCase()}-${version}.jar`;
  return `<section class="panel panel-pad"><h2>${safe(loader)} ${safe(version)} monitoring</h2>
    <ol><li>Stop the dedicated server. Place <a href="mods/${safe(jar)}" download>${safe(jar)}</a> in its <code>mods/</code> directory.
    ${loader==='Fabric' ? 'Install Fabric API for the same Minecraft version alongside it.' : ''}</li>
    <li>Place the private <code>igso.properties</code> file from registration in <code>config/</code>.
    If you have lost the key, Settings lets you replace it and download the new configuration.</li>
    <li>Start the server. Overview shows CPU, heap, TPS, MSPT, entities and players after the first sample.</li></ol>
    <details><summary>Agent configuration format</summary><pre class="code">endpoint=${safe(agentEndpoint())}
server-id=${safe(server.id)}
agent-key=YOUR_PRIVATE_AGENT_KEY
interval-seconds=2</pre><p>Sampling accepts 1 to 5 seconds.</p></details>
    <h3>Local SQLite recording</h3><p>To keep a local copy, extract the collector in the server directory. Set the agent endpoint in the properties file to <code>http://127.0.0.1:8765/telemetry</code>.
    Run this command before starting Minecraft to forward stored samples to this dashboard.</p>
    <pre class="code">python collector/collector.py --config config/igso.properties --upstream ${safe(agentEndpoint())}</pre>
    <div class="actions"><a class="button small" href="collector.zip" download>Download SQLite collector</a></div></section>`;
}
