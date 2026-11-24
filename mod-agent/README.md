# Forge and Fabric monitoring

Choose the file matching both the **dedicated server's loader** and its **Minecraft version**. Put it in the server's `mods` directory. Players do not install this monitoring mod.

| Game | Server loader and dependencies | Java |
| --- | --- | --- |
| 1.20.1 | Forge 47.1.0+ in the 47.x line, or Fabric Loader with Fabric API 0.92.5+1.20.1 | 17 |
| 26.3 | Forge 66.1.5+ in the 66.x line, or Fabric Loader 0.20.1 with Fabric API 0.166.2+26.3 | 25 |

Create `config/igso.properties` in the server directory. Use the server ID and private key from the dashboard. Restart to read the file. For local SQLite collection, point `endpoint` at the collector's loopback telemetry route.

```properties
endpoint=https://YOUR_PROJECT.supabase.co/functions/v1/igso-api/telemetry
server-id=YOUR_SERVER_UUID
agent-key=YOUR_64_CHARACTER_AGENT_KEY
interval-seconds=2
```

The interval accepts 1 to 5 seconds. Server tick callbacks capture observed TPS, the game's average milliseconds per tick, loaded entity and player counts, system CPU load and JVM heap usage. When a dedicated server pauses its simulation, sample collection pauses too. No player names, chat, coordinates or commands are collected.

One background worker sends timestamped samples with stable IDs. It retries transport failures, HTTP 408, 429 and 5xx responses after 1, 2, 4 and then 8 seconds. At most 120 samples wait in memory, plus one in flight. When full, the oldest waiting sample is replaced. Outstanding samples are discarded when the server shuts down.

## Build

Run `python mod-agent/build.py forge 1.20.1` from the project root, changing the loader or release as needed. Use JDK 17 to build Forge 1.20.1 and JDK 25 for the other targets. The build downloads the official loader development kit or Gradle wrapper and resolves dependencies, including the 1.20.1 production mappings. Each JAR contains only this project's monitor and its loader metadata.

[Forge downloads](https://files.minecraftforge.net/) · [Fabric server setup](https://fabricmc.net/use/server/) · [Fabric API](https://modrinth.com/mod/fabric-api)
