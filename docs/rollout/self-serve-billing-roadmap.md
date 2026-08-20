# Self-Serve Trial, Payments & Lifecycle Messaging — Implementation Status

Single source of truth for opening the platform to strangers: hardening the gates, automating
provisioning, the public 14-day trial, payment rails, the WhatsApp lifecycle sequences, and
activation instrumentation. One document because these share one state machine
(`CompanySubscription`) and one messaging layer — splitting them invites two owners for one
lifecycle. Part of the rollout program governed by `docs/rollout/master-rollout-plan.md`.

## How this document works

- **The structure never changes.** Iterations, stories and their IDs are fixed. Work updates the
  `Status` cell and appends to the changelog — nothing else.
- **A story is a promise to a person.** The acceptance signal is the test.
- **Story IDs are permanent.** Iterations ship in order — the gates harden before the doors open.

Sources this roadmap is derived from: `lib/platform/gating/policy.ts`,
`lib/platform/gating/route-registry.ts`, `proxy.ts`, `lib/platform/subscription.ts`,
`prisma/schema.prisma` (`CompanySubscription`), `scripts/provision-school.ts`,
`lib/schools/provision.ts`, `scripts/seed-staging-tenant.ts`, `components/onboarding/`,
`components/preferences/organization/billing-preferences.tsx`, `lib/audit/platform.ts`,
`lib/notifications.ts`, `scripts/platform/audit-feature-gates.ts`.

## Current state being changed

- Feature gating is **fail-open**: `isAllowByDefaultFeaturePolicy()` allows unless
  `FEATURE_GATE_POLICY=deny` is set.
- Subscription health (`getSubscriptionHealth`/`shouldBlock`) is computed but **never enforced**
  in `proxy.ts` — an expired tenant is not restricted.
- There is **no public signup**: tenants are provisioned by operators; `TRIALING` is a manual
  dropdown with no length, expiry job, or conversion prompt.
- There are **no payment integrations** and no upgrade path; the tenant billing page is
  read-only; `CompanySubscription.externalSubscriptionId` is the prepared, unused seam.
- There is **no outbound messaging** of any kind (no email, SMS, or WhatsApp provider), and no
  product analytics beyond pageviews; the hash-chained `PlatformAuditEvent` ledger is the best
  activation substrate.

## Standing instructions

- **Degradation, never hard cutoff.** A tenant that stops paying goes read-only with a banner —
  writes blocked, reads allowed. A locked-out merchant on a market day becomes an angry referral.
- The trial identifier is the WhatsApp number, normalised to E.164, unique per user
  (master-plan risk #14). Signup never requires a card.
- Every lifecycle transition (trial start, expiry, payment, past-due, degradation) writes a
  `PlatformAuditEvent` and is idempotent — a replayed webhook must not double-transition.
- WhatsApp templates go through provider approval; the sequences in SS-5 are drafted and
  submitted the week the provider is chosen (master-plan risk #9), not when the code is ready.

## Definition of Done

The program DoD in `docs/rollout/master-rollout-plan.md`. For this document additionally: every
externally-triggered transition (webhook, scheduled job) has a test for the replayed and the
out-of-order case.

## Status legend

| Mark | Meaning |
|---|---|
| `done` | Acceptance signal demonstrated, DoD met |
| `wip` | In progress on the current branch |
| `todo` | Accepted into the roadmap, not started |
| `blocked` | Cannot start; blocker named in the row |
| `parked` | Deliberately not being built; reason named in the row |

## Iteration 1 — Gate hardening

Prerequisite for letting strangers in. Runs on the post-trim route surface (ST-1.3).

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| SS-1.1 | As a platform operator, the platform denies by default | `pnpm platform:audit-feature-gates` clean; uncovered routes fixed in `lib/platform/gating/route-registry.ts`; `FEATURE_GATE_POLICY=deny` flipped in staging, soaked, then production; a tenant without a feature gets the feature-disabled response while entitled tenants are unaffected | `todo` |
| SS-1.2 | As a platform operator, an expired tenant is actually restricted | `getSubscriptionHealth().shouldBlock` wired into `proxy.ts` as read-only degradation: mutating requests blocked with a named error, reads allowed, banner shown; an `EXPIRED_BLOCKED` tenant can view but not create an invoice | `todo` |

## Iteration 2 — Provisioning automation

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| SS-2.1 | As an engineer, one function call yields a working tenant | `lib/schools/provision.ts` generalised into a platform provisioning service (template + tier + host + admin user), callable from an API route as well as the TUI; provisioning a Start and a Fiscal tenant lands each on a working workspace on its own subdomain | `todo` |
| SS-2.2 | As a new trial user, my workspace is not empty | Sample data seeded on first login per template (the `scripts/seed-staging-tenant.ts` precedent, production-safe subset); an empty-POS first impression is gone; sample data clearly marked and one-click removable | `todo` |

## Iteration 3 — Public trial signup

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| SS-3.1 | As a visitor, I can start a 14-day trial on Fiscal or Start without talking to anyone and without a card | Public signup flow; WhatsApp number as identifier (E.164, unique, recovery path decided per master-plan risk #14); `TRIALING` subscription with `trialEndsAt` +14 days; lands in the workspace with sample data. Incognito-browser test: signup → first sandbox fiscal invoice with zero staff involvement | `todo` |
| SS-3.2 | As a platform operator, trials end by themselves | A scheduled job (worker precedent) transitions expired trials; conversion prompt in-app before expiry; post-expiry the SS-1.2 degradation applies | `todo` |

## Iteration 4 — Payment rails

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| SS-4.1 | As a founder, the gateway choice is made on evidence | Written evaluation memo — Paynow vs Pesepay vs ContiPay — against the fixed criteria: recurring-billing support and settlement time first, headline rate last (master-plan risk #10). The memo is the artifact; the decision lands in this changelog | `todo` |
| SS-4.2 | As a tenant admin, I can pay for my subscription myself | Gateway integrated behind `CompanySubscription.externalSubscriptionId`; webhook route with replay-safe transitions; checkout/upgrade actions on the currently read-only `components/preferences/organization/billing-preferences.tsx`; a sandbox payment flips `TRIALING` → `ACTIVE`; TUI reflects it | `todo` |
| SS-4.3 | As a buyer, annual prepay is the path of least resistance | Annual (20% off, per PR-2.1) presented first at checkout; quarterly as the middle option; monthly the fallback | `todo` |

## Iteration 5 — Lifecycle messaging

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| SS-5.1 | As a founder, the platform can send WhatsApp messages | Provider chosen (master-plan risk #9) and integrated as a messaging service; templates approved; a test message delivers; failure falls back to in-app notification via `lib/notifications.ts` | `todo` |
| SS-5.2 | As a new trial user, I am walked to my first validated invoice | Onboarding sequence on WhatsApp — Day 0 setup confirmation, Day 1 fiscalisation walkthrough, Day 3 validated-invoice check with human follow-up if not, Day 7 second-module nudge, Day 12 trial-end with the annual offer. Clock-advanced test tenant receives the full sequence | `todo` |
| SS-5.3 | As a paying customer, I am reminded before I lapse, and degraded gently after | Payment reminders at T-7, T-3, T-0, T+3; `PAST_DUE` applies the SS-1.2 read-only degradation after grace, never a hard cutoff; recovery on payment is immediate | `todo` |

## Iteration 6 — Activation instrumentation

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| SS-6.1 | As a founder, I can see the activation funnel | Signup → first login → device registered → first validated fiscal invoice, each written via `writePlatformAuditEvent` (`lib/audit/platform.ts`); a funnel report in the admin control plane (`components/admin-portal/`) shows a real trial's timestamps and whether it beat 30 minutes | `todo` |
| SS-6.2 | As a founder, the leading indicators are on one screen | Trials/month, trial→paid rate, time-to-first-validated-invoice, annual-prepay mix, monthly logo churn — computed from subscription and audit data, matching the program's 90-day targets | `todo` |

## Changelog

Newest first. One entry per commit that changes implementation status.

| Date | Commit | Stories | Description |
|---|---|---|---|
| 2026-08-18 | — | — | Document created; fail-open gating, unenforced expiry, and the absent signup/payments/messaging surfaces recorded as the starting state. |
