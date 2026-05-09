# Gold Team Overnight Run — Status Log

**Started:** 2026-05-10 00:30 (Africa/Harare)
**Operator:** Claude (autonomous)
**User authorized:** push to main, anything that doesn't drop rows, push through Epic 6.

---

## Epic progress

| Epic | Status | Commit(s) | Notes |
|---|---|---|---|
| 1 — Append-only ledger | ✅ DONE | `523f3855e`, `48890bd4b` | Schema + domain; 6 pass / 3 skip on inventory.test.ts |
| 2 — Role gates | ✅ DONE | `05cc008e3` | 13 endpoints gated via existing `hasRole` helper; OPERATOR+ for normal mutations, MANAGER+ for commit/rollback/reset-failed; co-sign TODO for Epic 9b |
| 3 — FIFO + dispatch + crews | ✅ DONE | `3eceb4bfd`, `550dca6f7` | FIFO lock, mixed-site reject, crew-scoped attendance, shiftGroupId denormalised, unique widened |
| 4 — Atomic accounting + price-fallback | ✅ DONE | `0d9730585`, `020bd12c7` | Schema: GoldPriceSource enum + GoldSpotPriceCache + goldPriceSource columns. Code: lib/gold/price-fallback.ts resolver (3-tier), tx-aware captureAccountingEvent + createJournalEntryFromSource, atomic source+inventory+accounting across 6 endpoints, missing inventory IN/OUT for purchases/dispatches added, pour-created + dispatch-created promoted IGNORED→PENDING. **Track 5 deferred:** wiring `resolveGoldPriceUsdPerGram` into `valuation.ts` + `fifo-link.ts` + populating `goldPriceSource` on snapshot writes — logic agent thought columns weren't ready (was wrong); doable any time. Picked up in 5b. |
| 5b — Coverage expansion + Track 5 wiring | pending | | Includes: wire price-fallback into valuation.ts/fifo-link.ts, populate goldPriceSource on snapshot creates, add per-route role-gate tests, multi-tenant scoping tests. |
| 6 — Decimal + companyId migration | 🔄 IN PROGRESS | — | Float→Decimal across all Gold weight/USD columns + companyId denormalisation onto 5 transactional models. Suite 4 Decimal witness flips green when this lands. |
| 7 — Corrections + AdjustmentEntry | pending | | |
| 8 — Import stabilisation | pending | | |
| 9.0 — Import data model | pending | | |
| 9a — Importer worker + repair | pending | | |
| 9b — Period-close + snapshots | pending | | |
| 10 — Reconciliation + reporting | pending | | |
| 11 — UI cleanup | pending | | |
| 12a/b/c — Cross-module + observability + settings | pending | | |
| 13 — Operational readiness | pending | | |

---

## Decisions made autonomously

_(none yet — will log here as they come up)_

## Notes / blockers

_(none yet)_

## Test status

- `npx vitest run lib/gold/inventory.test`: 6 passed, 3 skipped (Suite 4 Decimal witness pending Epic 6, plus 2 from new Suite 6 enum-witness scaffolding).
- `npx tsc --noEmit`: clean.
