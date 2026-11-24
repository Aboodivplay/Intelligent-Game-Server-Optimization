# GP2 design and implementation review

Reviewed against **Full Documentation GP2 Revised** and **GP2 Project Analysis and Design**. This comparison covers the GitHub Pages workspace, its deployed Supabase API, the downloadable Paper agent and the offline training package.

## What can be demonstrated

Sign in, open Minecraft and select Remediation. The account audit log works even before a server has been connected. Clear history asks for confirmation, saves the account’s position in the log and leaves later events visible. Show cleared entries brings retained actions back into view. The page shows the newest 100 records within the 90-day window. A database test with two temporary accounts checked ownership, retry behavior and preservation of action records.

The terrain and item graphics are interface artwork. Monitoring, predictions and command history use backend data. An empty workspace shows how to connect a server. A disconnected model has an explicit status. The research target shown on the site is five minutes before degradation.

The Paper dashboard now supports separate configurations and downloadable builds for 1.20.1 and 26.3. The version setting selects setup instructions and artwork. The agent independently reports its running Minecraft version. The public roadmap lists one-use, server-scoped player invitations under development.

The local GP1 submission already contains Forge 1.20.1 Java source, a compiled mod and a Python prototype with an in-memory store. It samples on a 40-tick schedule. Its player/entity logic and optional cleanup controls provide a starting point. The final design still requires the aggregate telemetry pipeline, SQLite persistence and the bounded, reversible action described below.

## Functional requirements

| GP2 requirement | Evidence in the preview | Work remaining for the final system |
| --- | --- | --- |
| FR01, FR06 · Agent and hosting | The downloadable Java Paper plugin collects host CPU, heap, TPS, players and entities. The running website uses GitHub Pages and Supabase/PostgreSQL. The design distinguishes the Paper preview from the reference architecture. | Integrate the local Forge 1.20.1 / Java 17 prototype, add aggregate signals including MSPT, and persist readings in the reference Python service with SQLite. The Paper agent clamps sampling to 5–60 seconds. The specification calls for a configurable 1–5 seconds with a 2-second reference interval. |
| FR02, FR03, FR07 · Predictions and contributors | The downloadable logistic baseline builds windows from past observations and uses a five-minute target. The Predictions tab explains that inference is disconnected. | Integrate the LSTM, store the score, horizon, model version and timestamp, and display contributing signals. Validate warnings against degradation events. |
| FR04, FR09 · Monitoring and input quality | The dashboard displays real readings, historical charts and an offline state. The ingestion API validates signal ranges and records receipt time. | Carry sample time through ingestion, handle duplicate and out-of-order samples, and use the configured interval to determine freshness. The preview currently uses a fixed 30-second cutoff. |
| FR05, FR15 · Access and enrollment | Accounts own their registered servers. The API checks account sessions. A server gets a dedicated hashed key which its owner can replace. Authenticator enrollment is available. | Implement administrator and observer assignments per server and verify that observer accounts cannot change policies or approve actions. |
| FR08 · Retention | The dashboard queries 30 days of telemetry and 90 days of audit entries. Clearing the visible history preserves the stored records. | Verify scheduled physical expiry for telemetry, predictions and alerts at 30 days and audits at 90 days. No cleanup job was visible in the deployed scheduler during review. |
| FR10, FR11 · Model lifecycle and alerts | The offline baseline uses chronological splits, a six-minute gap and training-only normalization. A per-server threshold can be saved. | Implement reviewed model promotion, inference, 0.80 alert threshold behavior, preferences and duplicate suppression. Measure event-level outcomes on independent sessions. |
| FR12, FR14, FR17 · Recovery controls | The preview saves a manual override and supports opt-in, allowlisted manual console commands. | Implement recommendation approval, rejection and override, bounded simulation-distance changes, cooldowns, restoration and before/after audit evidence. |
| FR13 · Export | Telemetry CSV and JSON include the server ID and sample times. Both telemetry and training downloads include the server ID and export time in the filename. The training JSON includes samples and incident labels. | Add activity and prediction exports when the corresponding records are available. |
| FR16 · Delivery under load | The Paper agent sends asynchronously, avoids overlapping sends and limits repeated warnings. | Demonstrate queue limits, retries and recovery from a controlled outage with real measurements. |
| FR18 · Demonstration | Without a connected server the live workspace displays an empty state. | Verify the separately labeled demonstration path if using prerecorded scenarios for assessment. |

## Acceptance evidence still needed

The documents call for at most five percentage points of additional host CPU, at least 95% of updates within two seconds, and at least 80% event-level precision and recall at five minutes. They also specify an eight-hour run, a 60-second outage, recovery within 30 seconds, stale status after three sampling intervals, and reaching an alert or action in at most two interactions. These remain evaluation targets. The downloadable baseline and a working website do not establish these measurements.

The remaining checks include privacy of player-level data, observer permission tests and an incident trace linking a recommendation, the operator’s decision and the measured outcome. The generated Paper configuration currently enables private player tracking. Record the intended consent and collection defaults when validating the final agent.
