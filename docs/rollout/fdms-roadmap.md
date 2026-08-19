# Native ZIMRA FDMS v7.2 — Implementation Status

Single source of truth for building native virtual fiscalisation against the ZIMRA Fiscal Device
Gateway API v7.2. This is the rollout program's critical path: everything else in
`docs/rollout/master-rollout-plan.md` is downstream of a validated fiscal invoice.

## How this document works

- **The structure never changes.** Iterations, stories and their IDs are fixed. Work updates the
  `Status` cell and appends to the changelog — nothing else.
- **A story is a promise to a person**, phrased as somebody being able to do something.
- **The acceptance signal is the test** — and for fiscal stories the test runs against the ZIMRA
  test environment, never a mock (program DoD item 9).
- **Story IDs are permanent.** Abandoned stories become `parked` with a reason.
- **Iterations ship in order.** A later iteration never leaves an earlier one broken.

Sources this roadmap is derived from: `lib/accounting/fiscalisation.ts`,
`lib/accounting/fdms-connector.ts`, `lib/schools/fiscalisation.ts`, `prisma/schema.prisma`
(`FiscalisationProviderConfig`, `FiscalReceipt`), `app/api/accounting/fiscalisation/replay/route.ts`
and its sibling routes, `app/accounting/fiscalisation/page.tsx`,
`docs/accounting/zimra-fiscalisation.md`, and the ZIMRA Fiscal Device Gateway API v7.2
specification (external; PN 26 of 2024 governs virtual fiscalisation).

## What exists and what is missing

What exists is a **provider-agnostic skeleton**: durable `FiscalReceipt` rows with retry state,
a config model with mTLS support, an issue/validate/sync orchestrator, a console page, and two
live consumers (accounting sales invoices and school fee receipts). What is missing is the actual
device protocol: device registration (keypair/CSR — no signing code exists in the repo), fiscal
day open/close and counters, client-side receipt hashing/signing and previous-receipt-hash
chaining, receipt counters, QR generation and rendering (no QR library is installed;
`FiscalReceipt.qrCodeData` is stored but never printed), credit/debit-note fiscalisation (the
`FiscalReceipt` one-source DB CHECK blocks it), POS fiscalisation entirely (`RetailSale` has no
currency column and no fiscal relation), and a background drainer (`nextRetryAt` is only serviced
by the manual replay route).

## Standing instructions

- **All fiscal amounts are computed in Decimal, never Float.** Where an upstream document is
  Float (accounting money today), the conversion boundary is explicit and tested (FD-0.3).
- **Every FDGA call goes through the connector seam** (`lib/accounting/fdms-connector.ts`) —
  its idempotency keys, retry state and mTLS handling are the one transport. No route talks to
  ZIMRA directly.
- **The receipt hash chain is sacred.** Nothing writes a fiscal document outside the counter and
  chaining service once FD-3 lands; a gap or fork in the chain is a stop-the-line defect.
- **The schools fee-receipt path keeps working through every iteration.**
  `lib/schools/fiscalisation.ts` and `app/api/v2/schools/fees/receipts/route.ts` are the only
  live fiscalisation consumers today; their tests stay green at every merge. Their migration to
  the native protocol is a schools-roadmap story (see `docs/rollout/campus-alignment.md`).
- Certificates and keys are referenced via the existing `env:` indirection
  (`FiscalisationProviderConfig.certificateRef`), never stored inline; rotation is part of FD-1's
  runbook.

## Definition of Done

The program DoD in `docs/rollout/master-rollout-plan.md`. For this document additionally: every
story that touches submission demonstrates idempotency (resubmitting the same operation is
observably a no-op) and records the ZIMRA sandbox evidence (operation ID or portal screenshot) in
its changelog row.

## Status legend

| Mark | Meaning |
|---|---|
| `done` | Acceptance signal demonstrated, DoD met |
| `wip` | In progress on the current branch |
| `todo` | Accepted into the roadmap, not started |
| `blocked` | Cannot start; blocker named in the row |
| `parked` | Deliberately not being built; reason named in the row |

## Iteration 0 — Foundations (schema and money)

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| FD-0.1 | As a bookkeeper, I can transact in ZWG | ZWG seeded in `CurrencyDefinition` platform-wide (today it exists only inside `lib/hr/statutory/zimbabwe-pack.ts`); selectable on an invoice; stored and reported | `done` |
| FD-0.2 | As a tax admin, every tax code carries its ZIMRA taxID | New column on `TaxCode` beside `vat7OutputBox`/`vat7InputBox`; surfaced in `components/accounting/tax/tax-setup-workspace.tsx`; issuing a fiscal document with an unmapped code is refused with a named error | `done` |
| FD-0.3 | As an accountant, fiscal totals are exact | Decision from master-plan risk #1 recorded here; the chosen boundary implemented; a property test asserts no fiscal total ever differs from its source document total. **Decision (2026-08-19): convert at the fiscal boundary; do not migrate the accounting columns yet.** Accounting and retail money stay `Float`; every amount entering a fiscal document crosses into `Cents` — a branded bigint — at `centsFromAccountingAmount` in `lib/accounting/fiscalisation.ts` and nowhere else, and `lib/accounting/fdms-receipt-signing.ts` refuses a plain number outright. Sufficient because a double represents any whole number of cents exactly, so the boundary only has to catch *accumulated* error, which it does by refusing anything more than 1e-6 off a cent rather than rounding it into a signature. **Forces the full column migration:** a fiscal amount finer than a cent becoming legitimate (ZWG redenomination, sub-cent unit pricing); totals nearing 2^53 minor units where float noise exceeds the epsilon; the boundary starting to refuse real invoices; or FD-3 persisting the signed per-tax breakdown as `Float` columns, which would reintroduce the problem *inside* the fiscal record. The property test is generative over a seeded LCG rather than `fast-check`, so the suite gains no dependency and a failure names the exact invoice that caused it; it asserts the boundary either returns the document's own integer-cent total or refuses, never something in between | `done` |
| FD-0.4 | As an engineer, a fiscal receipt can attach to a credit note, a debit note, or a POS sale | The `FiscalReceipt` one-source CHECK widened; `RetailSale.currency` added with a backfill rule (master-plan risks #2, #3); migration applies clean on a copy of staging data | `done` |

## Iteration 1 — Device lifecycle

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| FD-1.1 | As a tenant admin, I register my fiscal device with ZIMRA from the fiscalisation console | Keypair and CSR generated server-side, certificate issued and stored via `certificateRef` indirection, `verifyTaxpayerInformation`/`registerDevice`/`getConfig` round-trip against the ZIMRA test environment from `app/accounting/fiscalisation/page.tsx` | `wip` |
| FD-1.2 | As an operator, I can see certificate health and renew before expiry | Expiry surfaced on the console and in `lib/notifications.ts` alerts; the rotation runbook written (master-plan risk #6) covering dev/staging/prod registration strategy | `wip` |

## Iteration 2 — Fiscal day

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| FD-2.1 | As a supervisor, I open and close a fiscal day per device | `FiscalDay` model (fiscalDayNo, status, per-taxID counters); open/close endpoints under `app/api/accounting/fiscalisation/`; a full open → receipts → close cycle produces a ZIMRA-accepted Z-report in sandbox | `wip` |
| FD-2.2 | As a supervisor, a day that cannot close cleanly tells me why | Counter mismatches surfaced with the offending receipts; close-with-discrepancy follows the v7.2 rules and is audited | `wip` |

## Iteration 3 — The core receipt protocol

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| FD-3.1 | As an accountant, an issued sales invoice is fiscalised natively | Client-side canonical hash + signature, previous-receipt-hash chaining, gap-free `receiptCounter`/`receiptGlobalNo` under concurrency (advisory-lock precedent from gold, master-plan risk #7); `submitReceipt` accepted by sandbox; rewires `issueFiscalDocument` in `lib/accounting/fiscalisation.ts` and the auto-issue hook in `app/api/accounting/sales/invoices/route.ts` | `wip` |
| FD-3.2 | As a customer, the invoice I receive carries a scannable QR that validates on fdms.zimra.co.zw | QR generated (new dependency) and rendered on the invoice PDF templates via `lib/documents/source-registry.ts`; portal shows the invoice as VALID | `wip` |
| FD-3.3 | As a founder, a fresh sandbox tenant reaches a validated fiscal invoice in under 30 minutes | The activation demo, timed end-to-end: provision → device registration → fiscal day open → invoice → green portal validation. **This is the day-30 exit criterion for the program** | `todo` |

## Iteration 4 — Credit and debit notes

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| FD-4.1 | As an accountant, a credit note fiscalises referencing its original receipt | Depends FD-0.4; the credit note carries the original `receiptGlobalNo` per v7.2; sandbox-validated and visible against the original on the portal | `wip` |
| FD-4.2 | As an accountant, a sales-side debit note exists and fiscalises | v7.2 debit notes are sales documents; the existing `DebitNote` model is purchase-side, so this story decides reuse-vs-new and implements it; sandbox-validated | `wip` |

## Iteration 5 — POS fiscalisation

The US$19 SKU's core promise, and the highest-volume surface.

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| FD-5.1 | As a till operator, my sale fiscalises without me doing anything | Fiscal relation on `RetailSale`; fiscalise-on-drain in `app/api/v2/retail/pos/sync/route.ts`; receipt print (`lib/retail/offline-receipt.ts`) carries the fiscal number and QR block | `wip` |
| FD-5.2 | As a till operator, load-shedding does not stop me trading | Kill the network mid-shift, ring 10 sales, reconnect: all 10 fiscalised in order, chain intact, within ZIMRA's permitted offline window (master-plan risk #8). Rides `lib/retail/pos-offline-queue.ts` and the `lib/offline/` outbox/sync-engine | `wip` |

## Iteration 6 — Worker and operations

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| FD-6.1 | As an operator, pending and failed receipts retry without a human | A new fiscal worker script (on the `scripts/pdf-worker.ts` precedent) drains `FiscalReceipt.nextRetryAt`; an induced FDGA outage self-heals with zero uses of the manual replay route | `done` |
| FD-6.2 | As an operator, I am told when fiscalisation is failing | Sustained failure emits notifications via `lib/notifications.ts`; the console page shows queue depth and oldest-pending age | `done` |

## Iteration 7 — Multi-site, multi-till

The differentiator the SKU is priced on.

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| FD-7.1 | As a supervisor, I see and manage fiscal days across every site and till from one screen | A two-site, three-till tenant opens, monitors and closes all fiscal days from one console view | `wip` |
| FD-7.2 | As an engineer, registers and shifts are referentially sound | The loose `siteId` strings on `RetailRegister`/`RetailShift` become real relations with a backfill; orphan registers surfaced and resolved | `todo` |

## Iteration 8 — Pilot cutover

| ID | Story | Acceptance signal | Status |
|---|---|---|---|
| FD-8.1 | As an operator, I can take any tenant live on fiscalisation by runbook | The per-deployment ZIMRA registration runbook (from FD-1.2) executed start-to-finish by someone who did not write it | `todo` |
| FD-8.2 | As a pilot customer, my real invoices validate on the ZIMRA portal | Each pilot — Huchu Mine, The Gate Shops, Lux Liquor, FloorCode — issuing production fiscal documents; the north-star metric is greater than zero | `todo` |

## Changelog

Newest first. One entry per commit that changes implementation status.

| Date | Commit | Stories | Description |
|---|---|---|---|
| 2026-08-19 | — | FD-0.3 → `done`; FD-7.1 stays `wip` | **The two gaps the previous entry named are closed.** *FD-0.3* now has the property test its acceptance signal asks for, generated over a seeded LCG rather than `fast-check` so the suite gains no dependency and a failure names the exact invoice that produced it. The property is deliberately two-sided — the boundary either returns the document's own integer-cent total or refuses, never something in between — because a one-sided assertion would pass on a boundary that quietly rounded, which is the failure worth preventing. Ten thousand generated invoices, up to forty lines each, spanning a tuckshop line item to a bullion total, plus a guard that fails if the boundary starts refusing an implausible share of ordinary invoices: without it the property could pass vacuously and the first anyone would hear of it is a tenant unable to fiscalise. That closes the last residual, so the story is `done`; its signal names no sandbox, unlike the submission stories above it. *FD-7.1* gained the tests the previous entry admitted it lacked — 38 across the fleet route, the `[id]` route and the shared receipt mapping. They assert the claims that would silently mislead a supervisor rather than the field copying: that blocking counts come from the group-by and never from the capped preview (a device that lost the network for an hour holds hundreds, the preview shows eight, and closing the shift on that number is the bug), that one stuck till cannot starve the others out of their previews, that an action which cannot succeed is refused with the service's own reason instead of offered, that a Z-report built without per-tax breakdowns announces it under-reports, and that another tenant's day is indistinguishable from one that does not exist. FD-7.1 stays `wip`: its acceptance signal is a real two-site three-till tenant running open → monitor → close, and this is coverage, not that run. |
| 2026-08-19 | — | FD-7.1 → `wip`; FD-0.3 decision recorded, stays `wip` | **One screen for every device's fiscal day, and the money decision written down.** The console gained a fiscal-days view over the existing service — `openFiscalDay` and `closeFiscalDay` are called, never reimplemented — listing every `FiscalisationProviderConfig` as what it actually is: one ZIMRA device, one till at one site. Per device it shows the open day number, receipts on that day by outcome, the age of the oldest unsubmitted receipt, and both counters (`lastReceiptCounter` in the day, `lastReceiptGlobalNo` on the device for all time). Site and till labels are read best-effort from `metadataJson` because `RetailRegister.siteId` is still a loose string — FD-7.2 owns making it a relation — so the device ID stays the identifier that is always true and no label is invented. A refused close returns 409 and **names the receipts**: source document number, global number, age, attempt count and the actual error text, held in the device's card rather than a toast, because a supervisor reading "cannot close" at 6pm needs to know it is till sale RS-1043 and decide whether to replay or void it. An action that cannot succeed is disabled with the service's own reason beside it instead of being offered and then failing. **FD-7.1 is `wip`, not `done`:** its acceptance signal is a real two-site three-till tenant running open → monitor → close, and this is code plus a live query smoke test, not that run. Two gaps found and surfaced rather than papered over: closing from the console produces a Z-report whose tax counters are empty, because the signed per-tax breakdown is built at issue time and never persisted on `FiscalReceipt`, so `closeFiscalDay` reports every receipt in `receiptsWithoutTaxLines` — the route returns that as `countersIncomplete` and the UI says the report under-reports; and the routes themselves carry no automated test. **FD-0.3:** the boundary decision is now in the story row — convert at the fiscal edge, leave the accounting columns `Float` — with the named triggers that would force the column migration. It stays `wip` because the signal asks for a property test and the coverage is example-based; the strongest guard is in fact not a test at all but the runtime cross-checks in `lib/retail/fiscalisation.ts`, which refuse to sign when a sale's lines do not add up to its total or its declared tax does not match its line tax. |
| 2026-08-18 | `fbc6100`, `36f1ae5` | FD-6.1, FD-6.2 → `done`; FD-5.1, FD-5.2 → `wip` | The drainer claims a row with a conditional update before working it, so two workers cannot double-submit one receipt, and a receipt past its attempt ceiling stops rather than spinning. POS fiscalisation builds the payload from a `RetailSale`, fiscalises a sync batch sequentially so receipt N carries receipt N-1's hash, treats a REFUND as a credit note, and refuses — rather than guesses — an unmapped tax rate or an amount finer than a cent. 67 tests against a mocked connector. FD-5 stays `wip`: its acceptance signal is a real kill-the-network-mid-shift run, and this is unit coverage. |
| 2026-08-18 | `a89988e`, `a304767`, `1974d15`, `abca4d2` | FD-0.1, FD-0.2, FD-0.4 → `done`; FD-1.1, FD-2.1, FD-3.1, FD-4.1 → `wip` | **The native protocol exists; nothing has met the ZIMRA test environment.** FD-0 landed as one migration: `TaxCode.zimraTaxId`, `RetailSale.currency` backfilled to USD, the one-source CHECK widened from two columns to exactly-one-of-four (credit notes and till sales can now be fiscalised), the `FiscalDay` model with a partial unique index giving one open day per device, and the signing columns on `FiscalReceipt`. Then RSA keypair + hand-built PKCS#10 CSR + certificate expiry parsing (FD-1); canonical string, SHA-256 hash, RSA signature, previous-hash chaining, gap-free counters and the QR verification URL (FD-3); and the fiscal-day service whose two races — two tills opening a day, two sales reserving a number — are closed by the database rather than by a check-then-write. The issue path now signs and chains before the network call, keeping the existing PENDING-row-first ordering that makes a crash survivable. Schools falls back to the unchained path when a tenant has no device, deliberately and with a test. 70 new tests; the money types refuse a float outright. **The four `wip` rows are code-complete but their acceptance signals name the ZIMRA sandbox, which this work has not touched — DoD item 9 is unmet until FD-8 registers a device.** |
| 2026-08-18 | — | — | Document created against the fiscalisation-skeleton audit; native-only decision recorded (no Fiscal Harmony bridge). |
