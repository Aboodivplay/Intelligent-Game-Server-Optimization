# IGSO Paper agent

This small plugin measures real host CPU, Java heap usage, TPS, loaded entities and online players. It sends authenticated telemetry every five seconds. It does not predict failures or run automatic remediation. Manual commands can be enabled locally.

1. Install Java 17+ and Maven. Paper versions requiring Java 21 must run on Java 21.
2. Run `mvn package` in this folder. Dependencies are downloaded from PaperMC's repository.
3. Copy `target/igso-agent-1.0.0.jar` into your Paper server's `plugins` folder.
4. Start Paper once to generate `plugins/IGSOAgent/config.yml`, then stop it.
5. Register a connection in the website. Download its private `config.yml` and put it in `plugins/IGSOAgent/`.
6. Restart Paper. The website shows live readings only after a valid sample arrives.

Compatibility target: Paper 1.20.1+ API, Minecraft Java only. Forge, Fabric, vanilla and other games are not implemented. Check compatibility on your actual Paper version before relying on it. CPU/TPS overhead and the research latency targets have not been benchmarked.

Game-state collection uses Paper's main-thread scheduler. HTTPS transmission runs asynchronously. Overlapping sends are skipped, requests have timeouts, and failures are logged at most once a minute. Unavailable CPU readings are skipped instead of being presented as a real zero. If telemetry stops for 30 seconds, the website marks the connection offline and hides live details.

The agent key permits telemetry ingestion for one server. Keep it out of Git and public screenshots. Account passwords are never placed on the Minecraft server.

## Live players

`player-tracking: true` shares the latest snapshot (up to 200 online players) with the website account owning the connection. Data includes UUID, name, world and block coordinates, never IP addresses or chat. Moving means position changes within 10 seconds, Fighting means damage dealt or received within 10 seconds, AFK means no position changes for 300 seconds, otherwise Idle. Turning a camera alone does not reset AFK. Tracking restarts after plugin restart. Positions are replaced on each sample, not saved in telemetry history.

## Manual console

Remote console is off by default. To enable it, set:

```yaml
remote-console:
  enabled: true
  allowed-commands: [list, say, time, weather, difficulty, save-all]
```

Only the listed root commands can execute; namespaced variants must be listed explicitly. Add powerful commands only after reviewing their effects. The website owner reviews every command, the agent executes on the game thread and returns text where the command supports the standard sender interface. Some plugins write to server logs instead. Commands have console permissions. They are claimed once, expire if uncollected after 30 seconds and are not automatically retried after uncertain delivery. This is a manual command/reply view, not continuous streaming of all server logs.

## Minecraft versions

Use Java 17 and `mvn package` for the 1.20.1 agent. Use Java 25 and `mvn -Ppaper-26.3 package` for the 26.3 agent. Set the same target in the server’s dashboard Settings. Each heartbeat includes the game version reported by Paper.
