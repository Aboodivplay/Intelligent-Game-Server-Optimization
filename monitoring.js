import { agentEndpoint, escapeHtml as safe } from './api.js?v=accounts-20261120';

export function loaderField(selected = 'Paper') {
  return `<label for="server-loader">Server software</label><select id="server-loader" name="loader">
    ${['Paper','Forge','Fabric'].map(name=>`<option ${selected===name ? 'selected' : ''}>${name}</option>`).join('')}</select>`;
}

// Existing Paper servers use YAML. Both mod loaders read the same properties file.
export function agentConfig(server, key) {
  if (server.loader === 'Forge' || server.loader === 'Fabric') {
    return {name:'igso.properties', folder:'config/', text:`endpoint=${agentEndpoint()}\nserver-id=${server.id}\nagent-key=${key}\ninterval-seconds=2\n`};
  }
  return {name:'config.yml',folder:'plugins/IGSOAgent/',text:`endpoint: ${agentEndpoint()}\nserver-id: ${server.id}\nagent-key: ${key}\ninterval-seconds: 5\nplayer-tracking: true\nremote-console:\n  enabled: false\n  allowed-commands: [list, say, time, weather, difficulty, save-all]\n`};
}

export function modGuide(server) {
  const loader = server.loader;
  const version = server.minecraftVersion;
  const jar = `igso-${loader.toLowerCase()}-${version}.jar`;
  return `<section class="panel panel-pad"><h2>${safe(loader)} ${safe(version)} monitoring</h2>
    <ol><li>Stop the dedicated server. Place <a href="mods/${safe(jar)}" download>${safe(jar)}</a> in its <code>mods/</code> directory.
    ${loader==='Fabric' ? 'Install Fabric API for the same Minecraft version alongside it.' : ''}</li>
    <li>Place the private <code>igso.properties</code> file from registration in <code>config/</code>.
    Set <code>interval-seconds</code> between 1 and 5. The default is 2.</li>
    <li>Start the server. Overview shows CPU, heap, TPS, MSPT, entities and players after the first sample.</li></ol>
    <h3>Local SQLite recording</h3><p>To keep a local copy, extract the collector in the server directory. Set the agent endpoint in the properties file to <code>http://127.0.0.1:8765/telemetry</code>.
    Run this command before starting Minecraft to forward stored samples to this dashboard.</p>
    <pre class="code">python collector/collector.py --config config/igso.properties --upstream ${safe(agentEndpoint())}</pre>
    <div class="actions"><a class="button small" href="collector.zip" download>Download SQLite collector</a></div></section>`;
}
