# Audit: the admin portal as it ships

Source: the repository at `4c1ff468` (`app/portal/admin`, `components/admin-portal`,
`app/api/platform-admin`, `lib/admin-portal*`, `scripts/platform`, `prisma/schema.prisma`).
Date: 13 October 2026. No screenshots yet; values below are read from code, not measured.

## Screens

| Screen | Route | Job | States present | States missing |
|---|---|---|---|---|
| Sign in | `/admin/login` | Get in | Email link sent | Password, second factor, locked, wrong code |
| Dashboard | `/admin/dashboard` | "Live queues" | Charts, metric cards, loading | A queue someone works through; nothing on it is a task |
| Workspaces | `/admin/clients` | Find a workspace | List, search | Filters by state, payment state, last sign-in |
| Companies | `/admin/companies` | Same as Workspaces | — | Duplicate; delete |
| Workspace overview | `/admin/clients/[id]` | Understand one workspace | Health, pricing, "next actions" | Its members, payments and audit on one record |
| Workspace dashboard | `/admin/company/[id]/dashboard` | Same as overview | — | Duplicate; delete |
| Identity | `/admin/identity`, `/admin/company/[id]/identity` | Admins, users, "access posture" | Lists, wizards | Find one person across workspaces; reset, unlock, resend |
| Support access | `/admin/support-access`, `/admin/company/[id]/support-access` | Request, approve, start a session | Three views, metric cards, charts | An actual sign-in; the banner in the tenant app; the end |
| Reliability | `/admin/reliability`, `/admin/company/[id]/reliability`, `/admin/health`, `/admin/audit-log` | Incidents, contracts, runbooks, audit | Tables | Nobody works this; the audit log is buried in it |
| Commercial | `/admin/commercial`, `/admin/company/[id]/commercial`, `/admin/subscriptions`, `/admin/add-ons`, `/admin/features`, `/admin/feature-catalog`, `/admin/templates` | Plans, add-ons, features | Tables, wizards | Payments, proof of payment, trials, the money owed |
| Operations / advanced | `/admin/company/[id]/operations`, `/admin/advanced`, `/admin/company/[id]/advanced` | Run platform service methods | Generic operations table | — |
| Settings | `/admin/settings` | Portal preferences | Form | Operators, their roles and second factor |

## Components

| Component | Variants found | Where | Keep, merge or replace |
|---|---|---|---|
| Button | shadcn `Button` with local class overrides | everywhere | Keep the DS button; drop local overrides |
| Metric card | `MetricCard`, `admin-metric-card`, chart cards | dashboard, support access, identity | Remove: no stat rows on working pages |
| Charts | `AdminTrendChart`, `AdminStackedBarChart` | dashboard, support access | Remove: no question behind them |
| Status badge | a local `StatusBadge` per page, mapping raw enum strings ("READ_WRITE") | support access, identity, commercial | One status component reading `world.json` states, words not enums |
| Empty state | a local `EmptyState` per page | several | One kit empty state |
| Wizard dialog | `operation-wizard-dialog`, five wizard files | every write | A peek or a page for the job; dialogs only for irreversible decisions |
| Table | `operations-table`, `VerticalDataViews`, ad hoc lists | several | One full-bleed table with a footer |
| Navigation | `PLATFORM_NAV` (7) and `getCompanyNav` (5), a workspace switcher, a command bar, quick actions (7) | shell | One sidebar of six; the workspace is a record, not a context to switch into |

## The model the app has now

- **Nouns:** client, company, workspace, organization, tenant (one thing); admin, user, identity
  (one thing); support access request, support session; subscription, plan, bundle, add-on,
  feature, feature flag, template; contract; incident, runbook, SLO metric.
- **Statuses:** `TenantStatus` (4), `SubscriptionStatus` (5), `ContractAccessState` (4),
  `SupportAccessStatus` (6, shared by requests and sessions), `HealthIncidentStatus` (3).
- **Roles:** one. Any allow-listed email holding `SUPERADMIN` can do everything, including through
  `/api/platform-admin/execute`, which calls any service method by name.
- **Where it differs from how the business works:**
  - A workspace's "can they use it?" is three enums. The business has one answer: trial, active,
    past due, read-only, suspended, closed.
  - Support access is modelled as a customer approving staff. In fact the same operator requests
    and approves, and nobody gets signed in. The real need is a time-boxed session as a named
    member, with a reason the customer can see.
  - The thing billing does most (confirm a proof of payment) has no screen. The thing nobody does
    (runbooks, SLOs) has three.
  - An operator is a tenant user in "the first company". An operator is not a member of any
    workspace.

## Defects, ranked by where the cause lives

| # | Severity | Cause lives in | Rule | What is wrong | Screens affected |
|---|---|---|---|---|---|
| 1 | Model | Operator identity | Model 1 | Operators are tenant `SUPERADMIN`s on an env allow-list, one level, magic link only | all |
| 2 | Model | API | Model 6 | `/execute` runs any service method for any operator; no per-action role check or reason | all writes |
| 3 | Model | Support sessions | Model 4 | Sign in as does not sign in; three steps by one person | support access |
| 4 | Model | Workspace state | Model 1, 5 | Three enums for one answer | workspaces, commercial, reliability |
| 5 | Model | Billing | Model 4 | No proof-of-payment queue, no payment record view, no trial extension | commercial |
| 6 | System | Shell | Shell §1 | 7 + 5 nav items named after teams (Identity, Commercial, Reliability); the workspace is a context switch, so every page exists twice | all |
| 7 | System | Words | Words 1 | Five names for a workspace; raw enums on screen ("READ_WRITE", "IMPERSONATE") | all |
| 8 | System | Components | Layout 9, banned | Metric-card rows and charts above working tables | dashboard, support access, identity |
| 9 | System | Components | Surfaces 1 | Wizard dialogs for every write, cards around tables | all writes |
| 10 | Screen | Home | Shell §1 | The home is a dashboard; the job starts from a search and a queue | dashboard |

## Keep

- The admin host and the proxy gate (`proxy.ts`): the portal is unreachable from tenant hosts.
- `PlatformAuditEvent` and its hash chain. It becomes the spine of every record's activity.
- `SessionHandoff` and the `handoff` strategy: the seed of a real sign-in-as.
- The admin theme's choices: flat, bordered, dense.
- The command bar's shortcut (it becomes the search).

## Order of work

1. **Model:** operator identity and roles; one workspace standing; sign in as; payments and
   proof; the audit log as the record's activity. Written in `world.json`.
2. **Shell:** six items, the workspace as a record, search first.
3. **Tokens:** read from the Corelith DS; record the admin re-tune.
4. **Components, by screens repaired:** status (every screen), table with footer (5), record
   header and activity feed (3), peek (4), empty states (all).
5. **First three workflows:**
   - A customer writes in and an operator signs in as them.
   - A proof of payment is confirmed or rejected.
   - A new workspace is set up.
   - Fourth: an operator signs in to the portal with a password and an authenticator code.
