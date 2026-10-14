# App brief: the admin portal

Assumptions made without asking. Overturn any of them before `domain-model` runs.

- **Project files live in `design/admin/`.** `app/` is the Next.js route folder in this repo,
  and `design/campus/` set the precedent.
- **No brand project exists.** The Corelith design system (`@corelithzw/react` 0.4.0,
  `docs/design-system/`) is the brand, and `app/themes/admin.css` is its admin re-tune: flatter,
  squarer, faster, denser. Both stay.
- **Operators are a small in-house team**, two to six people, on laptops. The portal is built
  for a desktop first. A phone has to work for looking someone up and confirming a payment, and
  nothing more.
- **Operators get their own identity.** Today an operator is a tenant `User` with `SUPERADMIN`,
  attached to "the first company" and let in by an env allow-list. That goes. An operator is a
  separate record with one of three roles: **Owner** (everything, including operators),
  **Support** (look up, sign in as, manage members, provision) and **Billing** (payments, plans,
  add-ons, read-only elsewhere).
- **Password login, with an authenticator code on every sign-in.** Email-only sign-in goes.
  Email is kept for the invite that sets a first password and for resetting a lost one. An
  operator cannot use the portal until a second factor is set up.
- **Signing in as a member takes one step, not three.** The current request, approve and start
  sequence is run by the same person, so it protects nothing. The operator picks the member,
  types a reason, and gets a session that ends after 30 minutes. It is read-only unless they ask
  for changes at the start, which only Owner and Support can do. There is no customer approval
  gate. Instead, the workspace's owners are told by email, the session appears in their
  workspace's activity, and the tenant app shows a banner with an End button for the whole
  session. Nobody can sign in as another operator. While signed in as someone, an operator
  cannot change that person's password, second factor, email or payment method.
- **The reliability cluster leaves the portal.** Runbooks, SLO snapshots, health incidents and
  contract enforcement are not in the request and have no operator today. Contract state merges
  into the workspace's billing state, so one state answers "can they use it?"
- **The catalog stays in code.** Plans, add-ons and features are code-defined (commit
  `76ca67134`). The portal shows them and applies them to a workspace. It does not edit them.
- **The generic execute endpoint goes.** `/api/platform-admin/execute` calls any method of
  `createPlatformServices()` by name for any operator. Every action becomes its own server
  action with a role check and an audit entry.

## The idea

One place where Corelith's own staff find any workspace or person in seconds, see what is wrong,
and fix it, whether that means signing in as them, taking their payment, setting up a new
workspace or shutting a door, with every action on the record.

## People

| Role | Buys or uses | Device and conditions | Opens the app to |
|---|---|---|---|
| Founder (Owner) | Buys: it is internal tooling | Laptop. Between sales calls, often with a customer on WhatsApp at the same time. | Provision a sold workspace, settle a billing dispute, add or remove an operator |
| Support operator (Support) | Uses | Laptop, all day, with WhatsApp and email open beside it. A customer is usually waiting for a reply. | Find the person who wrote in, see what they see, fix their access |
| Billing operator (Billing) | Uses | Laptop, at month end and whenever a proof of payment lands. Has the EcoCash and InnBucks merchant statements open in another tab. | Confirm or reject payment proofs, chase past-due workspaces, change plans |
| Workspace owner (customer) | Is affected, never signs in here | Their own app | Sees when Corelith staff signed in as one of their members, and why |

## Jobs, most frequent first

1. **Find who wrote in.** "Tendai from Chikuru Motors can't get in." Search by name, email,
   phone, workspace name or slug, or payment reference, and land on the person or workspace with
   its state visible: plan, billing state, last sign-in, locked or not.
2. **See what they see.** Sign in as that member, read-only by default, to reproduce the
   problem, then end the session and go back to the same place in the portal.
3. **Take a payment.** Confirm or reject a proof of payment against the merchant statement,
   record a payment that came in some other way, extend a trial, change a plan or seat count,
   switch an add-on on or off.
4. **Fix a member's access.** Send a password reset, resend an invite, unlock, suspend or
   restore a member, change their role, move ownership of a workspace to another member.
5. **Set up a workspace.** Name, product (Flare, Corelith and the rest), profile, owner's email,
   plan and trial, slug. Watch the provisioning steps finish, and retry the one that failed.
6. **Keep it safe.** Read the operator audit log (who signed in as whom, who changed what), add
   or remove operators and reset their second factor, suspend a workspace, and export a
   workspace's access record when a customer or POTRAZ asks for it.

The first job decides the home screen: a search box and the queue of things waiting on an
operator (payment proofs, failed provisioning, workspaces newly past due, sign-in-as sessions
still open). It is not a dashboard of charts.

## Scope

- **Kind of work:** a redesign of a working surface, and a rebuild of the model under it.
- **In:**
  - The shell and navigation.
  - Home: the search and the queue.
  - The workspace list and the workspace record.
  - Search for people across workspaces.
  - Signing in as a member, end to end. Today it writes a `SupportSession` row and never signs
    anyone in. `SessionHandoff` and the `handoff` strategy are the start of the real thing.
  - Payments and the proof-of-payment queue.
  - Plans and add-ons as applied to a workspace.
  - Provisioning.
  - Operators, their roles and their second factor.
  - The audit log.
  - Password and authenticator sign-in for the portal.
- **Out:**
  - The tenant-side billing page and pay flow (S-12 to S-16 in
    `docs/saas/self-serve-onboarding-design.md`). This portal only consumes what they write.
  - Editing the plan and feature catalog.
  - Runbooks, SLOs, health incidents and contract enforcement.
  - Marketing leads.
  - Branding, domains and templates per workspace, beyond what provisioning sets.
  - The Ink terminal console in `scripts/platform/`. Its domain services move into `lib/` where
    the portal needs them; the TUI itself is not redesigned.
- **Already shipping, and what is wrong with it:**
  - **Routes.** 22 pages under `app/portal/admin`, served at `/admin/*` on
    `portal.admin.pagka.dev`. There are seven platform nav items (Dashboard, Workspaces, Identity,
    Support Access, Reliability, Commercial, Settings) and five more repeated inside each
    workspace.
  - **Duplicate pages.** `companies` repeats `clients`. `subscriptions`, `add-ons`, `features`
    and `templates` repeat `commercial`. `health` and `audit-log` repeat `reliability`.
    `company/[id]/dashboard` repeats `clients/[id]`.
  - **Five names for one thing.** Client, company, workspace, organization and tenant all mean
    the same thing. Identity, Commercial and Reliability don't say what is behind them.
  - **Two answers to one question.** A workspace's access is held twice: in
    `CompanySubscription.status` and in `ContractAccessState`.
  - **Size.** About 14,600 lines in `components/admin-portal` and `lib/admin-portal`, plus
    6,500 in `scripts/platform/domain` and `services.ts`.

## Stack

| | |
|---|---|
| Framework | Next.js 16.1 App Router, React 19.2. Admin routes are `app/portal/admin/**`, rewritten from `/admin/*` by `proxy.ts` on the admin host |
| Styling | Tailwind 4, Corelith tokens through `app/themes/corelith-bridge.css`, admin scope `[data-portal="admin"]` in `app/themes/admin.css` |
| Component library | `@corelithzw/react` 0.4.0 (linked from `../corelith-design-docs`), shadcn/Radix primitives in `components/ui`, cmdk for the command menu, TanStack Table |
| Icons | `@/lib/icons` (Phosphor fill, plus the Medusa-named set the admin shell uses) |
| Data layer | Prisma 7 on Postgres (Neon). TanStack Query on the client. NextAuth 4 with the strategy registry in `lib/auth-core/strategy-registry.ts`. bcryptjs is already in use for tenant passwords. `PlatformAuditEvent` is a hash-chained log |
| Deploys to | Vercel. One deployment serves every product host. Production migrations run in `pnpm build` |

## Constraints

- **Connection.** Operators are on office or home broadband in Zimbabwe, and power cuts happen.
  The portal is online-only. A failed action says so and can be retried. No offline layer.
- **Regulation.**
  - The Cyber and Data Protection Act [Chapter 12:07] applies, with POTRAZ as the Data
    Protection Authority.
  - Signing in as a member is processing that member's personal data. It needs a stated reason
    and a record that can be produced on request.
  - Under SI 155 of 2024, a breach is reported to POTRAZ within 24 hours of becoming aware of
    it, and affected people within 72 hours when the risk is high. Check the gazetted SI before
    relying on these deadlines.
  - POTRAZ inspections began on 1 September 2026.
  - The operator audit log must be complete, append-only and exportable per workspace.
- **Security.**
  - Operators sign in with a password and an authenticator code.
  - The portal is reachable only on the admin host.
  - Every write is checked against the operator's role on the server.
  - A destructive action asks for the workspace's slug to be typed.
  - Operator sessions time out after a period of inactivity.
- **Languages and currencies.** English. USD is the billing currency. EcoCash also takes ZiG.
  Pesepay is the gateway, with Contipay second. Manual proofs come from EcoCash and InnBucks.
- **Hardware.** A laptop at 1280px and up. A phone is for lookups and payment confirmation only.
- **Dates.** Times are shown in Africa/Harare. No ship date is set.

## Where the work happens

Both, but mostly the repository.
- **Design work:** layouts and screens are drawn as canvases in `design/admin/` for each gate,
  then built in this worktree, `claude/admin-portal-redesign-6bcaf1`.
- **Running it:** `pnpm dev:up`. In dev, `localhost` is the admin host, so the portal is at
  `http://localhost:3000/admin`.
- **Checks:** `pnpm typecheck` and `pnpm lint`. Vitest suites live beside the code, as in
  `lib/auth-core/*.test.ts`.

## From the brand

- **Accent, typeface, mark.**
  - Accent: Corelith brand blue `#0B5DF0`, one primary action per surface.
  - Typeface: Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono. It is already the
    interface face across the product, so it needs no re-test.
  - Mark: the Corelith mark. The portal is staff-only and carries no product brand.
- **Rules carried over.**
  - From `AGENTS.md`: one page is about one thing; tabs and filters sit on separate rows; no
    summary band on a working page; tables are not wrapped in cards; numbers and times are set
    in `font-mono`.
  - From `admin.css`: no resting shadows.
