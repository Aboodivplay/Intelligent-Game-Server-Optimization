# Intelligent Game Server Optimization

The dashboard connects a Minecraft Paper server to a private workspace. The website runs on GitHub Pages. Supabase handles accounts, telemetry storage and the workspace API.

## Accounts

Use an email address and a unique password to create an account. A display name is optional. Open the confirmation email in the same browser that requested it. Password recovery uses the same browser check. The page keeps signed-in sessions in memory, so refreshing or closing it requires another login.

To enable two-step login, sign in, open **Account security** on the game selection page and add an authenticator. Scan the QR code or enter its setup key, then confirm a code from the app. Add a backup authenticator before replacing your phone. The setup key belongs in your authenticator and should stay private.

Open **Minecraft → Remediation → Account audit log** to review activity. **Clear history** hides the actions you have seen. **Show cleared entries** displays retained records again. New events appear in the default view.

See the [GP2 design comparison](docs/gp2-alignment.md) for the implemented features and outstanding evaluation targets. The [Minecraft artwork credits](assets/minecraft/CREDITS.md) identify the resource pack and font.

## Code guide

- `session.js` sends requests to Supabase Auth, handles email confirmation and refreshes the in-memory session.
- `account-security.js` handles adding and removing authenticators. `pages.js` contains the forms, and `app.js` selects the next page after each sign-in step.
- `supabase/functions/igso-api/index.ts` verifies the account before serving dashboard requests. Minecraft agents authenticate separately with their server key.
- `supabase/migrations/` contains the account-security change for the existing IGSO database. The database checks current session and verification status alongside its original server ownership policies.
- Run `node --test tests/session.test.mjs tests/audit.test.mjs` with Node.js 22 or later to check account handling locally.

## Deployment notes

The website URL, public project URL and publishable key are in `config.js`. Use only the public key in the frontend. The Supabase redirect allowlist must include the dashboard URL used for confirmation and recovery.

The project uses the Free plan. If the site loads but the account service is unreachable, check the project status in Supabase. A paused project can be restored from the project dashboard. Public signup and password recovery also need a mail sender that can deliver to the intended users. Supabase's default sender is limited to project team addresses.
