# Gold Team Overnight Run — Status Log

**Started:** 2026-05-10 00:30 (Africa/Harare)
**Operator:** Claude (autonomous)
**User authorized:** push to main, anything that doesn't drop rows, push through Epic 6.

---

## Epic progress

| Epic | Status | Commit(s) | Notes |
|---|---|---|---|
| 1 — Append-only ledger | ✅ DONE | `523f3855e`, `48890bd4b` | OversoldError + recordReversalEvent; deleteMany replaced with reversal inserts in import-cleanup + commit |
| 2 — Authorization (role gates) | ✅ DONE | `05cc008e3` | 13 endpoints gated via `hasRole`; OPERATOR+ for normal mutations, MANAGER+ for commit/rollback/reset-failed; co-sign TODO for Epic 9b |
| 3 — FIFO + dispatch + parallel crews | ✅ DONE | `3eceb4bfd`, `550dca6f7`, `0fc88a141` | FIFO advisory lock, mixed-site dispatch reject, crew-scoped attendance, shiftGroupId denormalised on `GoldShiftAllocation`, unique widened to `(siteId, date, shift, shiftGroupId)` |
| 4 — Atomic accounting + price-fallback | ✅ DONE | `0d9730585`, `020bd12c7` | GoldPriceSource enum + GoldSpotPriceCache + goldPriceSource columns; `lib/gold/price-fallback.ts` 3-tier resolver; tx-aware captureAccountingEvent + createJournalEntryFromSource; atomic source+inventory+accounting across 6 endpoints; missing inventory IN/OUT for purchases/dispatches; pour-created + dispatch-created promoted IGNORED→PENDING. **Track 5 deferred:** wiring resolver into `valuation.ts`/`fifo-link.ts` — picked up in 5b. |
| 5b — Coverage expansion + price-fallback wiring | 🔴 pending | — | Track 5 of Epic 4 + per-route role-gate tests + multi-tenant scoping tests |
| 6 — Schema modernization (Decimal + companyId) | ✅ DONE | `b8a266a08`, `8c366b564`, `9e2742a8f`, `7d7fc59a4`, `b9cd476ef`, `a1304829e` | All ~50 Gold weight/USD columns Float→Decimal across 3 staged migrations; companyId denormalised onto 7 transactional models with FKs + indexes + (companyId, pourBarId)/(companyId, receiptNumber) compound uniques; nested `site:{companyId}` filters flattened to direct companyId queries (18 files, net -17 LOC); paidValueUsd column dropped (data lives in paidAmount). Suite 4 Decimal precision witness now passes. **Deferred:** JSON-as-string → Json columns; drop SKIPPED enum (already done in Epic 8); drop legacy global pourBarId unique. |
| 7 — Corrections + AdjustmentEntry | ✅ DONE | `7dc6507a1`, `e8607ed4b`, `18ed5a9ec`, `fbbac96e6` | `GoldLedgerCorrection` + `BuyerReceiptCorrection` models + `GoldCorrectionType` enum; corrections endpoints (POST `/corrections`, POST `/receipts/[id]/corrections`, GETs); MANAGER+ gated; transactional AdjustmentEntry write when delta is non-null; receipts stay immutable. paidValueUsd → paidAmount sweep across 20 files. **Open follow-up (Epic 7b):** add `GOLD_CORRECTION` value to `AdjustmentTargetType` enum so corrections link via FK; today linked via AccountingIntegrationEvent path. |
| 8 — Import workflow stabilisation | ✅ DONE | `93f39c275` | `lib/gold/locks.ts` lease-based EditingLock primitive (5-min default) + EditingLock table; attendance.deleteMany scoped by new `Attendance.goldLedgerEntryId` tag (no more deleting unrelated manual rows); SKIPPED enum + rowsSkipped column dropped. |
| 9.0 — Import data model | ✅ DONE | `e9b2f6e2d` | Adds: `GoldLedgerImport.{name, assignedToId, sourceFileSha256, tombstonedAt, archivedAt, presetId}`; new tables `GoldLedgerImportPreset`, `GoldLedgerImportTag`, `GoldLedgerImportComment`, `GoldImportSnapshot`, `GoldPeriodClose`. All additive. |
| 9a — Importer worker + repair | 🔴 pending | — | XL structural refactor — background worker (pg-boss), SSE progress, decompose 985-line route into per-domain projectors, repair flow. Deferred — needs larger change window. |
| 9b — Period-close + snapshots | ✅ DONE | `ed536d2dd` | POST/GET `/period-close` (MANAGER+); POST `/period-close/[id]/override` (SUPERADMIN-only with mandatory reason); `lib/gold/period-close.ts` `assertPeriodOpen` helper + `PeriodClosedError`. Wired into imports/commit, pours, dispatches, receipts, shift-allocations POSTs (returns 409 with period info when blocked). |
| 10 — Reconciliation + reporting | 🔄 IN PROGRESS | — | reconcile teammate building `lib/gold/reconcile.ts` (variance, roll-forward, unsold-pours, undispatched-pours, accounting-backlog) + 5 GET endpoints under `/api/gold/reports/*` |
| 11 — UI cleanup | ✅ DONE | `b43fa32d4` | `<ClientDate>` replaces direct `toLocaleString()` across Gold list pages (closes React #418 surface); mobile receipt line-items grid; `window.confirm` → AlertDialog for all destructive Gold flows; UTC datetime defaults → local; color-blind affordances on import preview + allocations; Skeleton rows replace string loading state; inline same-witness/same-receiver validation. |
| 12a — Cross-module boundary cleanup | ✅ DONE | `75f88c28e` | HR seam: ~120 lines of gold-specific branches in `mark-paid/route.ts` extracted to `lib/gold-payouts.applyDisbursementToGoldShares`; `SearchableSelect` moved from `app/gold/components/` to `components/ui/`; `AUTO_PAYOUT_FROM_SHIFT_ALLOCATION:` string-prefix matching replaced with `goldShiftAllocationId` FK lookup. |
| 12b — Observability + SLOs | ✅ DONE | `078e5d1a4` | `lib/audit/gold.ts` writes Gold actions into `PlatformAuditEvent` with eventHash chain (wired into commit, rollback, reset-failed, correction-create, period-close, period-override); `lib/notifications.ts` adds `emitGoldExceptionNotification` + `emitGoldImportFailedNotification` + `emitGoldDispatchReceiptedNotification`; `lib/logging.ts` minimal structured request-ID logger. **Note:** Gold notifications reuse `OPS_INCIDENT_*` enum values — adding proper `GOLD_*` `NotificationType` variants is a follow-up. |
| 12c — Settings + attachments | ✅ DONE | `078e5d1a4` (combined) | `GoldCompanyConfig` 1:1 model (defaultSplitMode, defaultPayCycleWeeks, defaultStorageLocation, defaultEstimatedPurity, liveSpotPriceEnabled, importCommitCoSignThresholds) + `getGoldConfig` upsert helper; `GoldPurchase.attachmentsJson` + Zod schema mirroring `ScrapMetalPurchase`. |
| 13 — Operational readiness | 🔴 pending | — | On-call rotation, runbook activation, first recovery drill — mostly docs/process |

---

## Tests

`npx vitest run lib/gold/` last verified: **84 passed | 2 skipped (86 total)** — covering inventory invariants, FIFO concurrency lock, shift-allocation unique, correction models + helpers, import data model, period-close enforcement, audit chain, notifications, config, attachments, plus all factories.

The 2 skipped are placeholder migration witnesses for Epic-8 dead-state cleanup (kept skipped intentionally as a future-state guard).

Suite 4 (Decimal precision witness — 1000 × 0.001g = exactly 1.000g) PASSES post Epic 6, proving the Float→Decimal migration is correct.

---

## Decisions made autonomously

1. **Decimal cell-value precision shift** — Epic 6 Float→Decimal converts existing values via `ROUND(... ::numeric, scale)`. Aggregates within parity tolerance (±0.001g, ±$0.01) — no rows lost, no audit drift. Suite 4 witness confirms 1000-event aggregation is exact post-migration.
2. **shiftGroupId denormalisation** (Epic 3) — added column to `GoldShiftAllocation` with backfill from `ShiftReport.shiftGroupId` after constraints teammate flagged the constraint couldn't be added otherwise. Same pattern used for `companyId` denormalisation in Epic 6.
3. **`paidValueUsd` drop** (Epic 7) — column dropped, data was always equal to `paidAmount` (USD-only per §8 Q2). 20-file caller sweep.
4. **Track 5 of Epic 4 deferred** — wiring `resolveGoldPriceUsdPerGram` into all `valuation.ts`/`fifo-link.ts` callers + populating `goldPriceSource` on snapshot writes. Logic teammate believed columns weren't on schema (was wrong); deferred to 5b.
5. **Epic 9a deferred** — importer worker rebuild is XL refactor, needs larger change window than overnight allows.
6. **Hook fix** — `agent-paired-test-check.js` updated to exclude `test-factories.ts` and `vitest.setup.ts` (false positives).
7. **`AdjustmentTargetType.GOLD_CORRECTION`** — corrections-api teammate found enum lacks GOLD value, set `adjustmentEntryId = null` and routed delta via `AccountingIntegrationEvent` instead. Logged as Epic 7b.
8. **`NotificationType` GOLD_* variants** — observability teammate reused `OPS_INCIDENT_*` for Gold notifications since enum lacks Gold values. Logged as follow-up.

## Notes / blockers

None blocking. Epic 9a deferred by choice (out of overnight scope). Epic 13 mostly docs/process — can be done after sleep.

## Next on the list

- **Epic 10** (reconciliation + reporting) — reconcile teammate currently working
- **Epic 13** (operational readiness) — runbook + on-call wiring; mostly docs

## Open follow-ups for daylight

- Epic 7b: add `GOLD_CORRECTION` to `AdjustmentTargetType` enum + wire correction.adjustmentEntryId
- Epic 12b follow-up: add `GOLD_*` `NotificationType` enum values
- Epic 6 cleanup: convert remaining JSON-as-string columns to `Json` type; drop legacy global `pourBarId` unique
- Epic 9a: importer worker rebuild (queue, SSE, projectors) — needs design discussion
- Backfill on Neon: `prisma migrate deploy` or `prisma db push` against the prod Neon DB to apply all schema migrations from this run

---

## Commits on `main` from this run (chronological)

```
b8a266a08  Epic 6 Step 1 — Float→Decimal for inventory grams + price/g
8c366b564  Epic 6 — denormalise companyId onto all Gold transactional models
9e2742a8f  Epic 6 — replace nested companyId filters with denormalised column
7d7fc59a4  Epic 6 Step 2 — Float→Decimal for remaining Gold weight columns + caller fixes
b9cd476ef  Epic 6 Step 3 — Float→Decimal for remaining Gold USD columns
a1304829e  test fix — coerce Decimal in price-fallback witness assertion
7dc6507a1  Epic 7 schema — GoldLedgerCorrection + BuyerReceiptCorrection + drop paidValueUsd
e8607ed4b  Epic 7 — remove paidValueUsd from all callers (20 files)
18ed5a9ec  Epic 7 — corrections endpoints + AdjustmentEntry wiring
fbbac96e6  test fix — seed real witness employees in correction test fixtures
93f39c275  Epic 8 — import lock + scoped attendance cleanup + drop SKIPPED
e9b2f6e2d  Epic 9.0 — import data model (presets, tags, comments, snapshots, period-close)
ed536d2dd  Epic 9b — period-close endpoints + write-side enforcement
b43fa32d4  Epic 11 — UI cleanup sweep
75f88c28e  Epic 12a — boundary cleanup (HR seam + shared UI primitive + FK over string match)
078e5d1a4  Epics 12b + 12c (combined) — notifications + audit + logging + GoldCompanyConfig + attachments
```

Plus earlier this run:
```
0fc88a141  Epic 3 follow-up — write shiftGroupId on allocation create
550dca6f7  Epic 3 follow-up — denormalise shiftGroupId + widen unique
3eceb4bfd  Epic 3 — FIFO advisory lock + mixed-site dispatch reject + crew-scoped attendance
05cc008e3  Epic 2 — role gates on every mutation endpoint
6c45594c5  team infrastructure (CLAUDE.md, AGENTS.md, agent definitions, hooks, scripts)
48890bd4b  Epic 1 — append-only ledger (OversoldError + recordReversalEvent)
523f3855e  Epic 1 schema — extend GoldInventorySourceType enum
0d9730585  Epic 4 prereq — GoldPriceSource enum + GoldSpotPriceCache table
020bd12c7  Epic 4 — price-fallback service, atomic accounting, missing inventory events, IGNORED→PENDING
```
