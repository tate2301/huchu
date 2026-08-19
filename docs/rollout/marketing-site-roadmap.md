# Marketing Site Fiscalisation Reposition & Free Tools — Implementation Status

Single source of truth for repositioning corelith.co.zw around ZIMRA fiscalisation and shipping
the free tools. The site lives in this repo (`app/home/*`, host-switched), so this is code work.
Part of the rollout program governed by `docs/rollout/master-rollout-plan.md`.

## How this document works

- **The structure never changes.** Iterations, stories and their IDs are fixed. Work updates the
  `Status` cell and appends to the changelog — nothing else.
- **A story is a promise to a person.** The acceptance signal is the test.
- **Story IDs are permanent.** Iterations ship in order.

Sources this roadmap is derived from: `app/home/site-data.ts`, `app/home/site-components.tsx`,
`lib/marketing/pricing.ts`, `lib/marketing/seo.ts`, `app/sitemap.ts`,
`app/api/marketing/demo-request/route.ts`, `app/home/pricing/page.tsx`.

## Current state being changed

The site mentions ZIMRA, FDMS, fiscalisation and VAT **zero times** — including on the pricing
page. Every CTA routes to `/home/book-demo`. Demo requests go to a webhook or `console.error`;
there is no lead table. `buildQuote()` in `lib/marketing/pricing.ts` is exported and tested but
never rendered.

## Standing instructions

- **Name the regulation, not the benefit.** "Your FDMS invoice validates on the ZIMRA portal"
  beats "stay compliant effortlessly."
- **Never claim a compliance capability that has not shipped.** Fiscalisation copy that outruns
  `docs/rollout/fdms-roadmap.md` status is a defect; comparison and campaign pages state what is
  live, not what is planned.
- **Every piece of content ends in a WhatsApp CTA** (`whatsappHref()` in `app/home/site-data.ts`),
  not an email form. WhatsApp is the primary conversion surface.
- **Price in public.** The pricing page always renders from the live catalog via
  `lib/marketing/pricing.ts` — never hand-typed figures.
- The penalty calculator's formula is tills × days × US$25, **capped at 181 days** (after which
  liability converts to criminal). An uncapped calculator produces absurd numbers and loses the
  accountants it exists to win — the cap is a test, not a comment.

## Definition of Done

The program DoD in `docs/rollout/master-rollout-plan.md`. For this document additionally: every
new public page carries metadata and JSON-LD via `lib/marketing/seo.ts`, is listed in
`app/sitemap.ts`, and is screenshot-verified at 390×844.

## Status legend

| Mark | Meaning |
|---|---|
| `done` | Acceptance signal demonstrated, DoD met |
| `wip` | In progress on the current branch |
| `todo` | Accepted into the roadmap, not started |
| `blocked` | Cannot start; blocker named in the row |
| `parked` | Deliberately not being built; reason named in the row |

## Iteration 1 — Reposition

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| MK-1.1 | As a VAT-registered buyer, the homepage tells me this product fiscalises | Homepage rewritten around the compliance-layer claim; ZIMRA/FDMS named above the fold; the fiscal wedge (multi-till, offline, credit notes, fiscal-day management) is the lead story | `done` |
| MK-1.2 | As a buyer, the pricing page shows the six new tiers with the fiscal SKU first | Depends PR-1; `app/home/pricing/page.tsx` renders the new structure from `MARKETING_TIERS`; onboarding fees and the 20% annual default stated plainly; payment methods published | `done` |
| MK-1.3 | As a buyer comparing options, honest comparison pages exist | Comparison pages positioned at multi-till/multi-site — explicitly not competing with US$3 single-shop products; every capability claim cross-checked against shipped status | `todo` |

## Iteration 2 — Free tools

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| MK-2.1 | As a shop owner, I can compute my fiscalisation penalty exposure | Penalty calculator page: tills × days × US$25 with the 181-day cap under test; WhatsApp CTA; lead capture; indexed in `app/sitemap.ts` | `done` |
| MK-2.2 | As a business owner, I can check whether I must register for VAT | VAT threshold checker with current thresholds; same CTA and capture pattern | `done` |

## Iteration 3 — Leads that persist

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| MK-3.1 | As a founder, a lead is never lost | A lead/demo-request table replaces the webhook-else-`console.error` path in `app/api/marketing/demo-request/route.ts`; tool submissions and demo requests land in it; surfaced in the admin portal or CRM; a submission with the webhook down is still visible in-app | `wip` |

## Iteration 4 — Conversion surface swap

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| MK-4.1 | As a visitor, the primary CTA starts a trial | Depends SS-3; homepage and pricing CTAs move from `/home/book-demo` to trial signup; WhatsApp remains the assisted path; book-demo survives for Grow/Scale/Gold | `todo` |

## Iteration 5 — Campaign and proof

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| MK-5.1 | As a prospect, I can read real case studies with real numbers | Depends FD-8; written permission from the four pilots; four short case studies published | `todo` |
| MK-5.2 | As a customer, referring a peer is worth something | Referral offer page (one month free for the referrer, 20% off first three months for the referred), linked from the activation moment (pairs with PC-4) | `todo` |
| MK-5.3 | As a mine owner facing the 1 January 2027 re-registration deadline, there is a page that speaks to my deadline | Mining-compliance campaign landing page, positioned against the audit findings; distribution-ready before day 90; pairs with GE-4 collateral | `todo` |

## Changelog

Newest first. One entry per commit that changes implementation status.

| Date | Commit | Stories | Description |
|---|---|---|---|
| 2026-08-19 | — | MK-3.1 → `wip` | **A lead now survives the webhook being down.** `MarketingLead` is the record and the webhook is a side effect fired after the row is written, which is the whole inversion: the old path was webhook-else-`console.error`, so an unset or unreachable webhook meant a lead existed only in a log line nobody reads. `recordMarketingLead` throws if the row cannot be written, so a lost lead is a visible failure rather than a silent one. Both the demo-request route and a new `/api/marketing/leads` route (for the free tools) write through it, carrying UTM and referer context so a submission can be attributed to the page that produced it. `wip`, not `done`: the acceptance signal also asks for the leads to be *surfaced* in the admin portal or CRM, and nothing reads the table yet — a lead that is only in the database is better than one only in a log, but it is still not in front of anyone. |
| 2026-08-18 | `ee1c6ec` | MK-1.1, MK-1.2, MK-2.1, MK-2.2 → `done` | The homepage and pricing page lead with the fiscal SKU and the obligation it answers; every figure is read from the billing catalog rather than typed into the page. The penalty calculator caps at 181 days and reports the uncapped figure separately as a contrast, never as somebody's exposure — tested across the whole input range, because the first accountant who finds an uncapped number stops trusting the tool that exists to win accountants. One correction on the way in: the drafted status panel claimed FDMS was "in pilot" and "running with pilot businesses now", and neither is true — FD-8 is `todo` and no customer issues a fiscal invoice through us. It now says built and tested, not validated against ZIMRA's environment, not live with anyone. |
| 2026-08-18 | — | — | Document created; zero-ZIMRA-mentions baseline and webhook-only lead path recorded. |
