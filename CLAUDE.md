# Huchu — Gold module rebuild context

## What's happening

The Gold module is undergoing a structured rebuild. Every agent working in this repo must read the plan before touching Gold files.

**Canonical docs (read in order):**
1. `docs/gold-module-review-2026-05-09.md` §13 — Roadmap (execution order)
2. `docs/gold-module-review-2026-05-09.md` §15 — Plan-of-record refinements (current Jira epic adjustments)
3. `AGENTS.md` — collaboration rules and DoR/DoD

## Hard rules (Gold module)

- **Append-only ledger.** Never `DELETE`/`UPDATE` from `GoldInventoryEvent`. Insert `REVERSAL` events instead. See §4.4 C-4.
- **Decimal everywhere.** All weights and money are `Decimal` after Epic 6. Never introduce a new `Float` column for grams or USD.
- **Role gates.** Every Gold mutation route must gate by role. No unauthenticated writes.
- **Atomic posting.** Source row + accounting event + inventory event must commit in the same `$transaction`. No best-effort side effects outside tx.
- **Test-first.** Every P0 migration ships with its migration witness test in the same commit. No exceptions.
- **Reviewer gate.** `gold-reviewer` must sign off before any Gold change merges to `main`.

## Current phase

**Epic 0** (post-hotfix verification) and **Epic 5a** (test harness foundation) are the active work. Nothing else should start until 5a is green.

Hotfix commits already on `main`:
- `be13fa04f` — React #418/#310 fix (GoldShell hydration + entryMutation hooks order)
- `00b5ab05f` — BuyerReceiptBatch/BuyerReceiptDispatch M:N model + FIFO refactor
- `c4c274cce` — Import dry-run UX + anomaly catalog + import page decomposed

Backfill script: `npx tsx scripts/backfill-buyer-receipt-batches.ts` (already applied to Neon DB).

## Quick commands

```bash
npx tsc --noEmit                          # typecheck
npx eslint <files>                        # lint
npx vitest run <pattern>                  # unit tests
npx vitest run lib/gold/inventory.test    # inventory invariants
pnpm db:push                              # push schema to DB
pnpm db:generate                          # regenerate Prisma client
pnpm build                                # full production build
```

## Agent team

Specialist agents are defined in `.claude/agents/`. Spawn them with a `gold-sprint-N` team name. Each agent owns specific file paths — see `AGENTS.md` for the charter map.
