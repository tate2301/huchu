# Rollout Master Plan — 90-Day Program Contract

This document is the program contract for the platform rollout adopted in August 2026. It fixes
the decisions, the workstreams, the dependencies between them, and the order in which they ship.
Workstream detail lives in the roadmap documents this plan indexes; this document never carries
story tables of its own.

## Normative references

- **The Corelith marketing, sales and revenue plan (17 August 2026, external).** Its adopted bets
  are restated in this document so the repo does not depend on an external file.
- `docs/platform-pricing-feature-flags-and-modules.md` — the commercial mechanism reference. Its
  **pricing figures are superseded** by the Pricing & Packaging workstream (`PR-`); its mechanism
  documentation (pricing formula, feature-flag behaviour, and the 13-step checklist for adding a
  feature, module, or bundle) remains normative and is used by every catalog-touching story.
- `docs/expansion-plan/schools-roadmap.md` — the sole story ledger for the Campus vertical, and
  the house-style exemplar every rollout roadmap mirrors.
- `lib/platform/feature-catalog.ts` — the code source of truth for tiers, bundles and features.
  Pricing changes land there first; documents follow.

## Program intent

**North-star metric: the number of businesses issuing ZIMRA-validated fiscal invoices through the
platform.** It is the activation event, the retention hook and the expansion trigger in one number,
and it cannot be gamed by signups.

**Activation target:** first validated fiscal invoice — green "Invoice is Valid" on the FDMS
portal — in under 30 minutes from signup.

**90-day outcome:** native FDMS live and validating; the four pilot tenants (Huchu Mine, The Gate
Shops, Lux Liquor, FloorCode) converted to paid contracts on the new pricing; self-serve trial
open to the public; the mining-compliance campaign for the 1 January 2027 re-registration
deadline live on the marketing site.

## Founder decisions (locked)

1. **FDMS is built natively** against the ZIMRA Fiscal Device Gateway API v7.2. No Fiscal Harmony
   bridge, no interim provider dependency. The existing provider-agnostic connector
   (`lib/accounting/fdms-connector.ts`) is the transport seam the native protocol is built into.
2. **Pricing adopts the new structure fully:** Fiscal US$19/mo (free onboarding) · Start US$39/mo
   (free onboarding, self-serve only) · Grow US$99/mo (+US$250 onboarding) · Scale US$199/mo
   (+US$250) · Gold Edition US$299/mo (+US$500) · Enterprise custom. The annual discount rises to
   20% and becomes the default ask.
3. **Full self-serve trial signup:** public signup, 14-day no-card trial on Fiscal and Start, the
   WhatsApp number as the identifier, sample data on first login.
4. **Campus continues as the third vertical,** founder-managed, governed entirely by
   `docs/expansion-plan/schools-roadmap.md`. See `docs/rollout/campus-alignment.md`.
5. **The platform narrows.** We are not an accounting software company. Accounting is trimmed to
   the posting engine, the AR/AP document core, and the tax/VAT module; fixed assets and budgets
   are deleted; CCTV, Autos/car-sales and Scrap metal are dropped entirely; Maintenance is frozen.
   Detail and evidence in `docs/rollout/scope-trim-roadmap.md`.

## Strategic frame (restated from the adopted plan)

- Lead with ZIMRA fiscalisation. The product claim is the compliance layer — "fiscal invoicing
  that ZIMRA accepts, on top of the POS, stock, books and payroll that produce the numbers" — not
  "business operating system".
- Beachhead on medium-scale gold operations and multi-till / multi-site formal retail. Cede the
  single-till shop: MiniPOS sells at US$3/mo with free FDMS and cannot be beaten there.
- The US$19 Fiscal SKU wins on the genuinely hard part of the FDMS API: offline queuing and
  resubmission through a load-shedding day, credit and debit notes, certificate lifecycle, and
  fiscal-day open/close correctness across multiple sites and tills.
- Never claim a compliance capability that has not shipped. One ZIMRA rejection at a customer
  site ends the referral network.

## Workstream index

| Doc | Prefix | Scope |
|---|---|---|
| `docs/rollout/scope-trim-roadmap.md` | `ST-` | Module drops (CCTV, Autos, Scrap metal), accounting trim, freeze register |
| `docs/rollout/fdms-roadmap.md` | `FD-` | Native FDGA v7.2: device lifecycle, fiscal days, receipts, credit notes, POS, worker, multi-site console, pilot cutover |
| `docs/rollout/pricing-packaging-roadmap.md` | `PR-` | New tier catalog, 20% annual, tenant migration, marketing derivation, Gold Edition packaging |
| `docs/rollout/self-serve-billing-roadmap.md` | `SS-` | Gate hardening, provisioning automation, public trial, payment rails, lifecycle messaging, activation instrumentation |
| `docs/rollout/marketing-site-roadmap.md` | `MK-` | Fiscalisation reposition, free tools, lead persistence, CTA swap, campaign pages |
| `docs/rollout/partner-channel-roadmap.md` | `PC-` | Multi-org membership, practice dashboard, rev-share, referral thin slice |
| `docs/rollout/gold-edition-roadmap.md` | `GE-` | Open gold epics, US$299 tier end-to-end, gold fiscalisation, mining-campaign readiness |
| `docs/rollout/campus-alignment.md` | — | Framing note only; no stories |

## Cross-workstream dependencies

An edge means the left item must be `done` before the right item starts.

| Before | After | Why |
|---|---|---|
| ST-1/ST-2 catalog-and-flag phase | SS-1 deny flip | Smaller route surface to audit before gating fails closed |
| ST-1/ST-2 catalog-and-flag phase | PR-1 | The tier/bundle rewrite lands after dropped SKUs leave the catalog — one migration story, not two |
| FD-0 foundations | FD-3, FD-4, FD-5 | CHECK widening, Decimal totals, ZWG, taxID mapping |
| FD-2 fiscal day | FD-3, FD-5 | Receipts submit into an open fiscal day |
| FD-3 core protocol | FD-4, FD-5, GE-3, Campus fee migration | Hash chain and counters are shared by every document type |
| PR-1 catalog | MK-1, PR-3, PR-5, SS-3 | Prices and tiers must exist before anything sells or signs up onto them |
| SS-1 + SS-2 | SS-3 public signup | Fail-open gating and unenforced expiry are unsafe for strangers |
| SS-4 payment rails | SS-5 dunning enforcement, PC-3 | Cannot dun or pay rev-share without a way to collect |
| FD-3 + SS-3 | SS-6, MK-4 | The activation funnel and the CTA swap need the real flow |
| FD-8 pilots live | MK-5 case studies, GE-4 | Proof requires production usage |

The graph is acyclic; keep it that way when adding stories.

## 90-day critical path

Revised at day 60. The original plan is kept below the revision, because a plan that quietly
rewrites its own history stops being a contract.

### What days 0–60 actually delivered

Everything that could be built without an external party, and nothing that needed one.

**Shipped and demonstrable:** the whole scope trim (ST-0 through ST-4 — catalog, navigation,
code, schema, and the freeze register in CONTRIBUTING); the pricing catalog and repricing
(PR-1/PR-2/PR-3); FD-0 foundations; the FD-6 drainer; and roughly 300 tests, with zero
regressions against a recorded baseline at every commit.

**Built, tested, and undemonstrated:** the native FDMS protocol end to end — device registration
and CSR, fiscal day open/close, receipt signing and hash chaining, credit and debit notes, POS
fiscalisation, and the multi-site fiscal-day console (FD-1, FD-2, FD-3, FD-4, FD-5, FD-7.1). All
`wip`. The code is written to the v7.2 spec and unit-tested deterministically; none of it has met
ZIMRA's test environment, because the credentials to reach it do not exist yet.

### The day-30 exit criterion was missed, and this is what it cost

The criterion was a sandbox-validated fiscal invoice with a rendered QR. **It was not met.** Not
because FD-3 is unbuilt — it is built — but because reaching the sandbox needs a taxpayer
registered on ZIMRA's test environment and a single-use activation key per device, and neither has
been requested. That is a procurement lead time nobody has started, not an engineering estimate
anybody got wrong.

Everything downstream of it inherits the slip: FD-3.3 (the under-30-minutes activation demo),
FD-8 (pilot cutover), the north-star metric leaving zero, and MK-5's case studies, which need a
customer who has issued a real fiscal document. **The 90-day outcome as originally written is no
longer reachable on the original dates.** Saying so here is cheaper than discovering it at day 85.

### Days 60–90 — Prove, then open

Reordered around one fact: the program's binding constraint is now credential lead time, not
engineering capacity. So the two things that unblock everything else go first, and they are both
somebody picking up a phone.

**Blocking, week one, not engineering work:**

- **Request the ZIMRA test taxpayer and per-device activation keys** (master-plan risk #6). Until
  this lands, six FDMS stories cannot leave `wip` no matter how much code is written.
- **Open a merchant account and decide the payment gateway** (SS-4.1, risk #10). The adapter is
  written against all three providers, so this is a config change once an account exists — but a
  rail comparison is not a decision, and `PAYMENT_PROVIDER` is empty.
- **Choose the WhatsApp provider and submit the template drafts** (risk #9). Approval is measured
  in days and is a hard dependency for SS-5. It is submitted while SS-5 is being written, not
  after.

**Moved into this window because they were blocked, not deferred:** FD-1.1/1.2, FD-2.1/2.2,
FD-3.1/3.2, FD-4.1/4.2, FD-5.1/5.2 and FD-7.1 demonstrating against the sandbox and a real
two-site tenant; FD-3.3 the timed activation demo; FD-8 pilot cutover; SS-4.2's first sandbox
payment. These are demonstration and hardening, not builds — the code is on the branch.

**Moved into this window because they were not started:** SS-2.2 sample data, and SS-2.1 gaining
a caller (`provisionTenant` exists and is tested but nothing invokes it, which is what stands
between the platform and SS-3).

**Still planned for this window, unchanged:** SS-3 public trial plus SS-6 instrumentation, SS-5
lifecycle messaging and dunning, MK-4 CTA swap, PC-4 referral thin slice.

**Newly added to this window:** PR-4 must settle whether a bundle charges for a feature nobody can
navigate to. ST-1.2 parked four accounting surfaces out of the navigation but deliberately left
their entitlements alone — removing them would have taken out the executive dashboard's cash tiles
and the general-ledger APIs — so `ADDON_ACCOUNTING_ADVANCED` currently lists five features of
which three have no entry point.

**Now at risk of slipping past 90:** MK-5's mining-deadline campaign can run on the 1 January 2027
re-registration deadline regardless, but its **case studies cannot** — those need FD-8, which
needs the sandbox, which needs the request above. GE-4 inherits the same dependency.

**Explicitly waits (post-90):** PC-1/PC-2/PC-3 (the partner platform proper), GE deep work beyond
GE-4, the web-push send path, broader SEO/comparison-page buildout beyond the first pages, Campus
expansion (founder cadence), and anything on the freeze register.

### The original path, as written on day 0

Kept for comparison, superseded by the revision above.

**Days 0–30 — Unblock.**
ST catalog/template/navigation/marketing removals plus the tenant-usage audit (cheap, and it
shrinks everything downstream). FD-0 through FD-3 — the day-30 exit criterion is a
sandbox-validated fiscal invoice with a rendered QR. PR-1/PR-2 on the post-trim catalog. SS-1
gate audit begins (it needs a long soak). MK-1 copy drafting. The payment-gateway evaluation memo
(SS-4's first story).

**Days 30–60 — Convert.**
ST code and schema deletions (after export). FD-4, FD-6, and FD-2/FD-7 hardening; FD-8 pilot
cutover begins with Huchu Mine and Lux Liquor. PR-3 converts the pilots to paid on the new
pricing — the program's revenue moment. SS-2 provisioning automation; SS-4 gateway integration.
MK-1, MK-2 and MK-3 go live.

**Days 60–90 — Open.**
FD-5 POS fiscalisation on the multi-till retail pilots. SS-3 public trial plus SS-6
instrumentation. SS-5 lifecycle messaging and dunning. MK-4 CTA swap and MK-5 mining-deadline
campaign. PC-4 referral thin slice.

## Risk register and open technical decisions

Each row names an owner (F = technical founder, C = co-founder) and the stories it blocks. A
decision row is closed by recording the decision in the owning roadmap's changelog.

| # | Risk / decision | Owner | Blocks |
|---|---|---|---|
| 1 | Float→Decimal for accounting money feeding fiscal totals: full migration (gold precedent — the `scripts/backfill-gold-accounting-usd.ts` family and the gold Decimal migrations) vs Decimal-at-the-boundary | F | FD-3 |
| 2 | `FiscalReceipt` one-source CHECK widening — DB constraint migration on a live table | F | FD-4, FD-5 |
| 3 | `RetailSale` has no currency column; backfill rule for historical rows | F | FD-5 |
| 4 | Fail-open → deny flip: `FEATURE_GATE_POLICY=deny` can black-hole ungated routes; audit-first, staged flip | F | SS-3 |
| 5 | Existing-tenant repricing without entitlement loss; alias strategy for legacy tier codes in data | C | PR-3 |
| 6 | ZIMRA test-environment registration is per-taxpayer/per-device; dev/staging/prod strategy and cert storage/rotation runbook | F | FD-1 |
| 7 | `receiptGlobalNo` must be gap-free under concurrent issue; advisory-lock pattern from gold | F | FD-3 |
| 8 | ZIMRA's permitted offline window bounds the POS queue design | F | FD-5 |
| 9 | WhatsApp Business API provider (Meta Cloud API direct vs BSP); template approval lead time | C | SS-5, MK funnel |
| 10 | Payment gateway choice — criteria fixed: recurring-billing support and settlement time, not headline rate | C | SS-4 |
| 11 | Fiscal SKU shape: standalone minimal tier vs `ADDON_ZIMRA_FISCAL` (which today depends on `ADDON_ACCOUNTING_CORE`) | F + C | PR-1 |
| 12 | 20%-annual mechanism: the `ANNUAL_BILLING_MONTHS` multiplier cannot express 20% cleanly | F | PR-2 |
| 13 | Dual commercial implementations (`lib/platform/entitlements.ts` vs `scripts/platform/domain/commercial-service.ts`) drift under heavy catalog change | F | standing, PR-* |
| 14 | WhatsApp number as identifier: E.164 normalisation, uniqueness, account recovery | F | SS-3 |
| 15 | Two pricing truths exist between this doc set landing and PR-6; the supersession banner is the mitigation | C | PR-6 |
| 16 | Destructive schema drops lose tenant data. Pre-drop usage audit and export are mandatory; the pilots' templates hold none of CCTV/Autos/Scrap, but other tenants might | F | ST-1 |
| 17 | The scrap-metal drop severs FKs (`ScrapMetalSale`/`ScrapMetalPurchase` → `SalesInvoice`/`PurchaseBill`/`Vendor`); the migration drops from the dependent side and preserves the accounting documents | F | ST-1.3 |
| 18 | Freeze discipline: frozen modules (Maintenance) still ship in pilot bundles, so regressions there remain release-blocking even though no new work lands | F + C | standing |

## Governance

- **Pricing changes land in `lib/platform/feature-catalog.ts` first.**
  `docs/platform-pricing-feature-flags-and-modules.md` is updated in the same PR, following its
  own 13-step checklist. No document states a price the catalog does not.
- **Schools stories live only in `docs/expansion-plan/schools-roadmap.md`.** Rollout work that
  needs something from Campus adds a story there, under that document's new-scope rule, and links
  it — it never opens a parallel ledger.
- **Roadmap documents follow the house rules** stated in each document's preamble: fixed
  structure, permanent story IDs, status-cell updates and appended changelog rows only,
  iterations shipped in order.
- **The freeze register is binding.** A module on it accepts bug fixes only; a new-feature PR
  against a frozen module is a regression of this plan.

## Program Definition of Done

Every story in every rollout roadmap, no exceptions:

1. `npx tsc --noEmit` clean
2. `npx eslint <changed files>` clean
3. `npx vitest run` green, with tests covering the story's invariants
4. `npx next build` succeeds
5. Screenshot-verified at 390×844 and 768×1024 if it renders anything
6. No new hard-coded colours, sizes or fonts — design-system tokens only
7. Every privileged action writes a `PlatformAuditEvent`; every query is scoped by `companyId`
8. Any story that moves money ships with a reversal/void test
9. Any fiscal story demonstrates its acceptance signal against the ZIMRA test environment, not a mock

## Changelog

Newest first. One entry per commit that changes this document.

| Date | Commit | Description |
|---|---|---|
| 2026-08-19 | — | **Critical path revised at day 60.** The day-30 exit criterion — a sandbox-validated fiscal invoice with a rendered QR — was missed, and the revision says so rather than restating the original dates. It was missed on procurement, not engineering: FD-3 is built and unit-tested against the v7.2 spec, but reaching ZIMRA's sandbox needs a test taxpayer and a single-use activation key per device, and neither has been requested. Six FDMS stories therefore sit `wip` — code complete, undemonstrated — and everything downstream inherits the slip, including FD-3.3, FD-8, the north-star metric leaving zero, and MK-5's case studies, which need a customer who has issued a real fiscal document. **The 90-day outcome as originally written is no longer reachable on the original dates.** Days 60–90 are reordered around the fact that the binding constraint is now credential lead time rather than engineering capacity: three procurement actions (ZIMRA test registration, a payment merchant account, the WhatsApp provider and template submission) are named as week-one blockers ahead of any code, because each has a lead time measured in days that nobody has started. The blocked FDMS stories, FD-8, SS-4.2's first sandbox payment, SS-2.2 and SS-2.1's missing caller move into the window; PR-4 gains the `ADDON_ACCOUNTING_ADVANCED` question that ST-1.2 deliberately did not settle. The original path is kept below the revision — a plan that quietly rewrites its own history stops being a contract. |
| 2026-08-18 | — | Document created: program contract for the adopted rollout, workstream index, dependencies, critical path, risk register, governance. |
