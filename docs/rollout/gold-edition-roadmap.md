# Gold Edition Productisation — Implementation Status

Single source of truth for turning the gold module into a listed, agent-sellable US$299 edition
and making it campaign-ready for the mining-compliance deadlines. The gold module itself is the
platform's most hardened vertical (Decimal money, append-only reversal ledger, FIFO advisory
locks, period close, audit hash chain); this document is about closing its open epics and making
the commercial wrapper true. Part of the rollout program governed by
`docs/rollout/master-rollout-plan.md`.

## How this document works

- **The structure never changes.** Iterations, stories and their IDs are fixed. Work updates the
  `Status` cell and appends to the changelog — nothing else.
- **A story is a promise to a person.** The acceptance signal is the test.
- **Story IDs are permanent.** Iterations ship in order.
- Existing epic documents are referenced, never restated — their content stays where it is.

Sources this roadmap is derived from: `docs/gold-team-status-2026-05-10.md`,
`docs/gold-epic-13-mvp-2026-05-10.md`, `docs/gold-epic-9a-worker-decision-2026-05-10.md`,
`docs/gold-module-review-2026-05-09.md`, `lib/platform/client-templates.ts`
(`TEMPLATE_GOLD_MINE`), `lib/commodity-billing.ts`, the `.claude/agents/` gold specialist
charters.

## Why this edition leads

One Gold deal is worth roughly 26 Start deals in first-year value. Medium-scale gold operations
are paid 90% USD, face two hard regulatory deadlines (title regularisation, then the 1 January
2027 re-registration with beneficial-ownership, environmental, labour, tax and marketing
verification), and the 2024 Responsible Mining Audit suspended 161 mines over exactly the
payroll and record failures this platform fixes. Huchu Mine is the live reference.

## Standing instructions

- Gold work goes through the module's specialist ownership boundaries (the `.claude/agents/`
  gold charters): schema work, domain backend, frontend, import workflow, integration and review
  stay separated as established.
- The Gold Edition's commercial composition (price, bundle contents, template) is owned by
  `docs/rollout/pricing-packaging-roadmap.md` PR-5; this document owns whether the product
  behind it is true.
- `lib/commodity-billing.ts` is shared infrastructure — treat changes as cross-module
  (scrap-metal history depends on the documents it created; see ST-2.3).

## Definition of Done

The program DoD in `docs/rollout/master-rollout-plan.md`. For this document additionally: every
story that touches money or inventory events keeps the reversal-ledger and hash-chain invariants
under test.

## Status legend

| Mark | Meaning |
|---|---|
| `done` | Acceptance signal demonstrated, DoD met |
| `wip` | In progress on the current branch |
| `todo` | Accepted into the roadmap, not started |
| `blocked` | Cannot start; blocker named in the row |
| `parked` | Deliberately not being built; reason named in the row |

## Iteration 1 — Close the open epics

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| GE-1.1 | As a gold clerk, price fallback works end-to-end (Epic 5b) | Price-fallback service wired per the epic's remaining scope; role-gate test coverage closed | `todo` |
| GE-1.2 | As an operator, large ledger imports run in the background (Epic 9a) | The importer background worker per `docs/gold-epic-9a-worker-decision-2026-05-10.md`; the oversized import route decomposed | `todo` |
| GE-1.3 | As a mine manager, reconciliation reporting is complete (Epic 10) | The in-progress reconciliation reporting finished per the epic's definition | `todo` |
| GE-1.4 | As an operator, the module is operationally ready (Epic 13) | Runbooks and operational-readiness items per `docs/gold-epic-13-mvp-2026-05-10.md` | `todo` |

## Iteration 2 — The edition is true

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| GE-2.1 | As an agent, I can sell Gold Edition without a founder in the room | A fresh `TEMPLATE_GOLD_MINE` provision (post PR-5) lands on the US$299 tier and every advertised capability works end-to-end on the new tenant — intake, dispatch, settlement, payroll, reconciliation — demonstrated as one scripted walkthrough | `todo` |

## Iteration 3 — Gold fiscalisation

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| GE-3.1 | As a mine, my sales invoices fiscalise | Depends FD-3; gold sales documents (already Decimal — the clean case) issue native fiscal receipts; sandbox-validated | `todo` |

## Iteration 4 — Mining-campaign readiness

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| GE-4.1 | As a prospect mine, Huchu Mine's story convinces me | Written case-study permission; the case study drafted with real numbers (feeds MK-5.1) | `todo` |
| GE-4.2 | As a mine facing the 1 January 2027 deadline, the compliance pack answers the audit findings | The Mining Compliance Pack collateral — production returns, compliant payslips, registers, royalty calculation — assembled from shipped capabilities only, positioned against the audit findings; input to MK-5.3 | `todo` |

## Changelog

Newest first. One entry per commit that changes implementation status.

| Date | Commit | Stories | Description |
|---|---|---|---|
| 2026-08-18 | — | — | Document created; open epics 5b/9a/10/13 carried in as GE-1, edition truth and campaign readiness scoped. |
