# Intelligent Game Server Optimization

The dashboard connects a Forge or Fabric Minecraft server to a private workspace. The website runs on GitHub Pages. Supabase handles accounts, telemetry storage and the workspace API.

## Choose a Minecraft version

A server owner can choose any of the 23 stable Minecraft Java releases from **1.20.1** through **26.3** for a Forge or Fabric connection. Set the version during registration or change it later in **Minecraft → Settings**. Each server saves its own choice. Agent setup offers monitoring downloads for **1.20.1** and **26.3** and shows availability for the other versions. Overview compares the configured version with the version the running agent reports.

In **Minecraft → Settings → Manage player access**, the server owner can create a 24-hour, one-use code for a verified email. The player signs in, opens **Shared servers**, and redeems the code to see the sections the owner selected. The owner can edit or revoke access. This grants read-only dashboard access. Minecraft game admission is controlled by the server’s own allowlist.

The [Forge and Fabric setup](mod-agent/README.md) covers all four mod builds. Use the [Python/SQLite collector](collector/README.md) for durable local storage and optional forwarding to the hosted dashboard.

## Crash predictions

Open **Minecraft → Predictions** after an agent has reported about five uninterrupted minutes of readings. The hosted API scores the next five minutes with a six-input adaptation of the supplied LSTM. The [model notes and evaluation](ml/README.md) document the live inputs, training procedure and synthetic test results.

## Accounts

Use an email address and a unique password to create an account. A display name is optional. Open the confirmation email in the same browser that requested it. Password recovery uses the same browser check. The page keeps signed-in sessions in memory, so refreshing or closing it requires another login.

To enable two-step login, sign in, open **Account security** on the game selection page and add an authenticator. Scan the QR code or enter its setup key, then confirm a code from the app. Add a backup authenticator before replacing your phone. The setup key belongs in your authenticator and should stay private.

Open **Minecraft → Remediation → Account audit log** to review activity. **Clear history** hides the actions you have seen. **Show cleared entries** displays retained records again. New events appear in the default view.

See the [GP2 design comparison](docs/gp2-alignment.md) for the implemented features and outstanding evaluation targets. The [Minecraft artwork credits](assets/minecraft/CREDITS.md) identify the game versions, artwork and font.

## Code guide

- `session.js` sends requests to Supabase Auth, handles email confirmation and refreshes the in-memory session.
- `account-security.js` handles adding and removing authenticators. `pages.js` contains the forms, and `app.js` selects the next page after each sign-in step.
- `supabase/functions/igso-api/index.ts` verifies the account before serving dashboard requests. Minecraft agents authenticate separately with their server key.
- `supabase/migrations/` contains the account-security change for the existing IGSO database. The database checks current session and verification status alongside its original server ownership policies.
- Run `node --test tests/session.test.mjs tests/audit.test.mjs` with Node.js 22 or later to check account handling locally.

## Deployment notes

The website URL, public project URL and publishable key are in `config.js`. Use only the public key in the frontend. Set **Authentication → URL Configuration → Site URL** to `https://aboodivplay.github.io/Intelligent-Game-Server-Optimization/` and add the same address under **Redirect URLs**. Confirmation and recovery share this callback. Supabase Auth stores salted bcrypt password hashes. Server configuration downloads contain a separate private telemetry key.

The project uses the Free plan. If the site loads but the account service is unreachable, check the project status in Supabase. A paused project can be restored from the project dashboard. Public signup and password recovery also need a mail sender that can deliver to the intended users. Supabase's default sender is limited to project team addresses.
