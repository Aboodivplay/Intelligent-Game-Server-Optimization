# GP2 design and implementation review

Reviewed against **Full Documentation GP2 Revised** and **GP2 Project Analysis and Design**. This comparison covers the GitHub Pages workspace, its deployed Supabase API, the Forge and Fabric monitoring mods and the offline training package.

## What can be demonstrated

Sign in, open Minecraft and select Remediation. The account audit log works even before a server has been connected. Clear history asks for confirmation, saves the account’s position in the log and leaves later events visible. Show cleared entries brings retained actions back into view. The page shows the newest 100 records within the 90-day window. A database test with two temporary accounts checked ownership, retry behavior and preservation of action records.

The terrain and item graphics are interface artwork. Monitoring uses recorded server telemetry. An empty workspace shows how to connect a server. A disconnected model has an explicit status. The research target shown on the site is five minutes before degradation.

Administrators can register a Forge or Fabric server on any stable Java release from 1.20.1 through 26.3 and grant read-only dashboard sections to specific verified emails. Invitation codes are single-use, expire in 24 hours and can be revoked. Database checks exercise the owner and observer boundaries, edits, replay and revocation.

The Forge and Fabric agents capture six aggregate game and host signals. Source timestamps and sample IDs survive retries. The optional Python collector stores samples in SQLite and relays them to the cloud. In a controlled one-minute upstream outage, 30 two-second samples remained available after a relay restart and drained in source order. Dedicated gameplay and the eight-hour evaluation still require recorded runs.

## Functional requirements

| GP2 requirement | Evidence in the preview | Work remaining for the final system |
| --- | --- | --- |
| FR01, FR06 · Agent and hosting | Four dedicated server mods cover Forge and Fabric 1.20.1 and 26.3. They collect CPU, heap, TPS, MSPT, entities and players every 1–5 seconds (default 2). The Python receiver uses SQLite. | Verify installation and observed signals on dedicated game servers under load. |
| FR02, FR03, FR07 · Predictions and contributors | The downloadable logistic baseline builds windows from past observations and uses a five-minute target. The Predictions tab explains that inference is disconnected. | Integrate the LSTM, store the score, horizon, model version and timestamp, and display contributing signals. Validate warnings against degradation events. |
| FR04, FR09 · Monitoring and input quality | Mod samples keep source timestamps and IDs, are deduplicated and can fill gaps without moving the heartbeat backwards. Mod freshness expires after three configured intervals. | Measure update latency on actual gameplay. |
| FR05, FR15 · Access and enrollment | Owners issue, scope, edit and revoke invitations. Observers receive only permitted sections for their server. Owner controls still require the owner session. | Record the two-role demonstration for the final assessment. |
| FR08 · Retention | The dashboard queries 30 days of telemetry and 90 days of audit entries. Clearing the visible history preserves the stored records. | Verify scheduled physical expiry for telemetry, predictions and alerts at 30 days and audits at 90 days. No cleanup job was visible in the deployed scheduler during review. |
| FR10, FR11 · Model lifecycle and alerts | The offline baseline uses chronological splits, a six-minute gap and training-only normalization. A per-server threshold can be saved. | Implement reviewed model promotion, inference, 0.80 alert threshold behavior, preferences and duplicate suppression. Measure event-level outcomes on independent sessions. |
| FR12, FR14, FR17 · Recovery controls | The dashboard saves a manual override. The monitoring mods collect readings only. | Implement recommendation approval, rejection and override, bounded simulation-distance changes, cooldowns, restoration and before/after audit evidence. |
| FR13 · Export | Telemetry CSV and JSON include the server ID and sample times. Both telemetry and training downloads include the server ID and export time in the filename. The training JSON includes samples and incident labels. | Add activity and prediction exports when the corresponding records are available. |
| FR16 · Delivery under load | The mod has a bounded asynchronous queue. SQLite-backed relay retries survive restart. A controlled one-minute outage exercises backlog recovery. | Measure overhead and recovery with a running game under load. |
| FR18 · Demonstration | Without a connected server the live workspace displays an empty state. | Verify the separately labeled demonstration path if using prerecorded scenarios for assessment. |

## Acceptance evidence still needed

The automated outage check restarted the relay halfway through a 60-second outage. All 30 samples reached the test receiver in source order, and the queue drained 1.11 seconds after recovery. Browser checks exercised creating a code, using it once in a separate session, changing visible sections, revoking access and downloading each loader/version pair. [Workspace test run](https://github.com/Aboodivplay/Intelligent-Game-Server-Optimization/actions/runs/45463715141)

For the live demonstration, connect a player to the dedicated server and compare its version and player count with Overview. Check consecutive source timestamps and MSPT in Telemetry history. Stop the server and record the first dashboard refresh that shows it offline after three sampling intervals.

The documents call for at most five percentage points of additional host CPU, at least 95% of updates within two seconds, and at least 80% event-level precision and recall at five minutes. They also specify an eight-hour run, a 60-second outage, recovery within 30 seconds, stale status after three sampling intervals, and reaching an alert or action in at most two interactions. These remain evaluation targets. The downloadable baseline and a working website do not establish these measurements.

The remaining checks include privacy of player-level data under live conditions and an incident trace linking a recommendation, the operator’s decision and the measured outcome. The monitoring mods report aggregate player counts. Validate these counts and the observer permissions during the final server run.
