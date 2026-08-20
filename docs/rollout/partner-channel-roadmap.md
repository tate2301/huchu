# Accountant Partner Channel & Referrals — Implementation Status

Single source of truth for the accountant practice channel and referral mechanics. Deliberately
mostly **post-90-day**: the load-bearing schema change (multi-organisation membership) does not
belong in the same quarter as the FDMS build. One thin referral slice ships inside the 90 days.
Part of the rollout program governed by `docs/rollout/master-rollout-plan.md`.

## How this document works

- **The structure never changes.** Iterations, stories and their IDs are fixed. Work updates the
  `Status` cell and appends to the changelog — nothing else.
- **A story is a promise to a person.** The acceptance signal is the test.
- **Story IDs are permanent.** Iterations ship in order — except PC-4, which is explicitly
  ordered first despite its number, because the marketing plan needs a referral offer inside the
  90 days and it does not depend on the membership work.

Sources this roadmap is derived from: `prisma/schema.prisma` (`User.companyId` — a single
required FK today), `components/admin-portal/` (the staff multi-client console whose patterns
this borrows), `lib/platform/gating/portal-isolation.ts`, the `SupportAccessRequest`
approval-gated impersonation model, `lib/platform/client-templates.ts`
(`TEMPLATE_PAYROLL_BUREAU` — a bureau is anticipated as a client type but still gets one tenant).

## Why this channel

Zimbabwe's dominant software distribution pattern is tax-and-audit consultancies that resell
software; no local vendor offers an accountant-facing practice layer — no multi-client dashboard,
no bulk submissions, no revenue share. The commercial terms adopted: **20% recurring revenue
share for the life of the account**. The claim that accountants gatekeep SME software choice is
inference, not evidence — it is tested with the first ten partner conversations before the year
is bet on it.

## Standing instructions

- **PC-1 is the load-bearing change; nothing else in this document starts before it** (except
  PC-4). Membership must compose with tenant isolation in `proxy.ts`, portal isolation, and
  feature gating — the enumeration of those implications is part of PC-1, not an afterthought.
- Cross-tenant access is always explicit, audited (`PlatformAuditEvent`), and revocable by the
  client — the `SupportAccessRequest` model is the consent-and-audit precedent.
- Rev-share is computed from collected revenue, not invoiced revenue (depends SS-4).

## Definition of Done

The program DoD in `docs/rollout/master-rollout-plan.md`. For this document additionally: every
cross-tenant read path ships a test proving a partner sees nothing from a company that has not
granted them membership.

## Status legend

| Mark | Meaning |
|---|---|
| `done` | Acceptance signal demonstrated, DoD met |
| `wip` | In progress on the current branch |
| `todo` | Accepted into the roadmap, not started |
| `blocked` | Cannot start; blocker named in the row |
| `parked` | Deliberately not being built; reason named in the row |

## Iteration 4 — Referral thin slice (in the 90 days, ships first)

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| PC-4.1 | As a customer, referring a peer is recorded and rewarded | A referral code exists at signup (SS-3) and attribution is stored against both accounts; the reward terms from MK-5.2 applied manually by an operator from a report — no membership model required | `todo` |

## Iteration 1 — Multi-organisation membership (post-90)

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| PC-1.1 | As a person, I can belong to more than one company | A membership model replaces the single `User.companyId` assumption where it matters; session carries an active company; switching is explicit; tenant isolation, portal isolation and feature gating all keyed off the active membership; the isolation test suite passes for a two-company user | `todo` |

## Iteration 2 — Practice dashboard (post-90)

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| PC-2.1 | As an accountant, I see all my client organisations in one list | A tenant-side practice console borrowing the `components/admin-portal/` patterns: client list with subscription and compliance signals; entering a client is an audited membership action | `todo` |
| PC-2.2 | As a client, I control what my accountant sees | Grant and revoke per-company; scoped roles for partner members; revocation takes effect on next request | `todo` |

## Iteration 3 — Revenue share (post-90)

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| PC-3.1 | As a partner, my 20% recurring share is computed from what my referrals actually paid | Attribution from PC-4 plus payments from SS-4 produce a per-partner statement; a refunded or failed payment never counts | `todo` |

## Changelog

Newest first. One entry per commit that changes implementation status.

| Date | Commit | Stories | Description |
|---|---|---|---|
| 2026-08-18 | — | — | Document created; single-company `User.companyId` constraint and the deliberate post-90 sequencing recorded. |
