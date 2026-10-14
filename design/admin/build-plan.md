# Build plan: the admin portal, in layers

Started 14 October 2026 on `claude/admin-portal-redesign-6bcaf1`. Each layer works end to end on
top of the last, and the screens it replaces are deleted in the same layer.

Local database: `huchu_admin` in the Docker Postgres (the worktree `.env` points there). The shared
Neon database is never touched from this branch; the migrations reach it when the PR merges.

| # | Layer | What an operator can do afterwards | Replaces |
|---|---|---|---|
| 1 | Operators and sign-in | Sign in with a password and an authenticator code; first sign-in sets up the authenticator; sign out | `admin-email-link`, `ADMIN_PORTAL_ALLOWED_EMAILS`, `isPlatformSuperuser`, the login-link API |
| 2 | Shell, two contexts | See which context they are in (switcher, scope bar, context sidebar); find a workspace; open one; leave with Esc | `admin-portal/shell/*`, dashboard, clients, companies, company/[id]/dashboard |
| 3 | Members | List a workspace's members; unlock, send a reset, sign out everywhere, change role, make owner, suspend, remove, resend an invite | identity pages and wizards |
| 4 | Sign in as | Sign in as a member for 30 minutes, look only or make changes, with a reason; the owner is emailed; the member's app shows a banner with the time left and an end button | support-access pages, `SupportAccessRequest`, `SupportSession` |
| 5 | Plan and billing, payments | Extend a trial, change plan or seats, turn add-ons on or off, record a payment; confirm or reject a proof of payment from the queue | commercial, subscriptions, add-ons, features, templates pages |
| 6 | Settings and closing | Rename, change the owner, sign everyone out, export data, suspend, close (type the address) | operations, advanced, reliability, health |
| 7 | Home, audit log, operators | Work the queue on Home; read the audit log in both contexts; invite operators, change their role, reset their authenticator | audit-log page, settings page, `/api/platform-admin/execute` |

## Status, 14 October 2026

All seven layers are built and walked in the browser at desktop and phone width,
with the local seed (`pnpm admin:seed-dev`). Not committed.

- **Migrations:** `20261014090000_operators`, `20261014100000_member_sessions_ended_at`,
  `20261014110000_sign_in_as` (drops `SupportAccessRequest` and `SupportSession`, and their
  rows), `20261014120000_operator_invites`. Each has a witness test.
- **Deleted:** the old portal's 22 pages, `components/admin-portal`, every
  `/api/platform-admin/*` route including `execute`, `lib/admin-portal/{auth,server,manifest,chart-series}`,
  the admin magic-link provider and allow-list, `requireAdmin` in the shared guards, and the
  support module of `pnpm platform`.
- **New environment variable:** `OPERATOR_SECRET_KEY`.
- **Not reachable from the browser pane:** the tenant side of sign in as (the pane blocks
  scripts on `*.localtest.me`). Checked over HTTP instead: the ticket signs in, look only
  refuses writes, making changes refuses the member's password and profile, the banner is in
  the server HTML, and ending works.

## Decisions taken in the build (the owner may overturn)

- **Operator sessions are not NextAuth sessions.** An operator is not a member of any workspace, so
  they get their own table and their own cookie (`corelith_operator`), checked against the database
  on every request, so signing an operator out takes effect at once.
- **The authenticator secret is encrypted at rest** with `OPERATOR_SECRET_KEY` (AES-256-GCM). A new
  environment variable for deploys.
- **Standing is worked out, not stored.** `lib/admin/standing.ts` reads `tenantStatus` and the
  latest subscription, the same rules `getSubscriptionHealth` applies to the tenant app, so the
  portal and the product cannot disagree. Collapsing the three enums in the database is a separate
  change.
- **Writes are server actions.** Each one checks the operator's role and, inside a workspace, takes
  the workspace from the URL segment and refuses an id from anywhere else.
