# Local Minecraft telemetry collector

This receiver stores Forge and Fabric samples in SQLite on the Minecraft server host. It runs on Python 3.10 or later with the standard library. Each instance handles one registered server.

## Start the collector

1. In the Minecraft workspace, register the server and save its mod configuration as `config/igso.properties` in the Minecraft server directory.
2. In that file, set `endpoint=http://127.0.0.1:8765/telemetry`. Keep the registered `server-id` and `agent-key`. The sampling interval can be 1–5 seconds.
3. From the server directory, start the collector. Adjust the script path to where you extracted it.

```shell
python collector/collector.py --config config/igso.properties --db igso-telemetry.sqlite3
```

For local storage **and** the hosted dashboard, add the HTTPS telemetry endpoint shown in Agent setup.

```shell
python collector/collector.py --config config/igso.properties --db igso-telemetry.sqlite3 --upstream https://YOUR_PROJECT.supabase.co/functions/v1/igso-api/telemetry
```

4. Start the Minecraft server with the matching mod in its `mods` directory. Run the collector on the same host. To use a different port, pass `--port` and update the mod endpoint to match.

## Sample delivery

The receiver acknowledges a new sample after committing it to SQLite. The combination of server ID and sample UUID identifies retries. The original capture time determines which reading is current, including when samples arrive late. Freshness expires three sampling intervals after capture.

With `--upstream`, the collector forwards the oldest pending reading first. It retries a connection failure or temporary server error after 1, 2, 4 and then 8 seconds. A lost acknowledgement can cause a second upload with the same sample UUID. A payload that the cloud permanently rejects with HTTP 400, 413 or 422 stays in SQLite marked `rejected`.

The default relay queue holds 300 samples, or about ten minutes at the two-second interval. Set `--capacity` to choose another limit. A full queue returns HTTP 503 to the mod so it can retry. Restart with the same database, server ID and cloud endpoint to resume pending uploads. Samples collected in local-only mode stay local. The database retains the archive separately from the pending queue.

`GET /status` requires the same bearer key as ingestion. It returns the latest sample, freshness, total stored rows, pending and rejected counts. Protect the configuration and database on the host. They do not belong in the public website directory.

## Run the delivery checks

From this directory:

```shell
python -m unittest -v
python outage_check.py
```

The outage check sends a sample every two seconds for one minute through a loopback HTTP listener. Its simulated cloud service returns 503 for the first 60 seconds. The relay worker restarts halfway through. The check requires all 30 unique samples to reach the restored receiver in capture order within 30 seconds of recovery. Use `--in-process` on systems that block local TCP connections. This exercises the same HTTP handler over an in-memory connection.
