# Gold Module — Agent Team Development Brief

**Date:** 2026-05-09  
**Companion doc:** `docs/gold-module-review-2026-05-09.md` (architecture review + roadmap)

---

## 1. Current state

**Done and on `main`:**
- All 3 hotfixes (`be13fa04f`, `00b5ab05f`, `c4c274cce`)
- Backfill verified on Neon (34 batch rows, 0 drift)
- `CLAUDE.md`, `AGENTS.md`, 7 agent definitions, 3 hook scripts, `.claude/settings.json`
- `lib/gold/test-factories.ts` and `lib/gold/inventory.test.ts` drafted
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `~/.claude/settings.json`

**Not done — blocking Epic 5a:**
- Epic 0 smoke test (manual — your job)
- `prisma/migrations/` baseline doesn't exist yet
- `lib/gold/inventory.ts` doesn't export `OversoldError` or `recordReversalEvent` yet (Epic 1) — Suites 2/3 in `inventory.test.ts` will fail to compile until then; that is intentional
- A dedicated test Postgres URL (`DATABASE_URL_TEST`) needs to be set before `vitest run` can hit a real DB

**Known factory caveat:** `lib/gold/test-factories.ts` field names are assumed from schema analysis. `gold-data-foundation` should validate every field against the actual schema in Sprint 1 and fix any mismatches.

---

## 2. Agent definitions

Seven agents live in `.claude/agents/`. Claude Code loads the matching file as the agent's system prompt when you specify `subagent_type`.

| Agent | Charter (owns) | Forbidden from | Model |
|---|---|---|---|
| `gold-tech-lead` | Plans, delegates, synthesises — no code | All source files | opus-4-7 |
| `gold-data-foundation` | `prisma/`, `migrations/`, `scripts/backfill-*.ts`, migration witness tests | `app/`, `components/`, `lib/gold/*.ts` source | sonnet-4-6 |
| `gold-domain-backend` | `lib/gold/**`, `lib/accounting/**`, `app/api/gold/**` | `prisma/schema.prisma`, UI files | sonnet-4-6 |
| `gold-import-workflow` | `app/api/gold/imports/**`, `lib/gold/import-*`, worker | UI, other Gold APIs | sonnet-4-6 |
| `gold-frontend` | `app/gold/**`, `components/gold/**` | `app/api/**`, `lib/**`, `prisma/` | sonnet-4-6 |
| `gold-integration` | HR/disbursement seams, notifications, audit, shared commodity helpers | Domain core files | sonnet-4-6 |
| `gold-reviewer` | Reads diffs, runs gates, approves/blocks — no code | All source files | sonnet-4-6 |

**Hook scripts** (in `scripts/`, wired via `.claude/settings.json`):
- `agent-charter-check.js` — warns on out-of-charter file edits (PostToolUse)
- `agent-paired-test-check.js` — warns when source edited without test file (PostToolUse)
- `agent-stop-summary.js` — prints session footprint on Stop

The `GOLD_AGENT_ROLE` env var in each agent's frontmatter tells the hooks which agent is running. Hooks are warning-only (exit 0); promote to blocking by changing to exit 2 in `agent-charter-check.js`.

---

## 3. How to use the agents

**Spawning with a named definition:**
```
Create team gold-sprint-N. Spawn a teammate using the gold-domain-backend 
agent type to work on [ticket]. Call them "backend".
```

**Starting every sprint:**
```
Spawn gold-tech-lead. Ask: "Plan the first ticket for Epic [N] from 
docs/gold-module-review-2026-05-09.md §13. Verify DoR and name the 
specialist + reviewer."
```

**Checking on teammates:** `Shift+Down` cycles through teammates in in-process mode. You can message any of them directly at any time.

**Windows note:** In-process mode only (no split panes) — tmux/iTerm2 required for split panes, which aren't available on Windows native.

---

## 4. Permissions

The project `.claude/settings.json` does not set a `defaultMode`. Teammates inherit your global mode from `~/.claude/settings.json` (currently `dontAsk`). If teammates can't write files, add to project `.claude/settings.json`:

```json
{
  "permissions": { "defaultMode": "acceptEdits" },
  "hooks": { ... }
}
```

---

## 5. Epic-by-epic runbook

### Epic 0 — Post-hotfix verification (manual, ~4 hours)

No agents. You do this:
1. `/gold/settlement/receipts` list — legacy + aggregate receipts render together
2. Receipt detail for a backfilled receipt — "Batches covered (1)" populates
3. 5+-batch dispatch → settle — no 409/500 errors
4. `POST /api/gold/imports/[id]/dry-run` — returns anomaly object shape
5. Full import commit — one ledger row → one `BuyerReceipt` → N `BuyerReceiptBatch` rows

Sign-off: tick Epic 0 boxes in `docs/gold-module-review-2026-05-09.md` §15.5.

---

### Epic 5a — Test harness foundation

**Prerequisite:** Epic 0 signed off.

**Team spawn:**
```
Create team gold-sprint-1. Spawn two teammates:
- gold-data-foundation ("foundations"): establish prisma/migrations baseline,
  set up vitest test DB config, validate factory field names against schema
- gold-domain-backend ("backend"): wire inventory.test.ts to run against
  the test DB, confirm Suites 1+5 pass and 2+3+4 fail as expected
Have them coordinate on the DATABASE_URL_TEST pattern before either writes.
```

**Done when:** `npx vitest run lib/gold/inventory.test` passes Suites 1 and 5, fails Suites 2/3/4 (compile errors are expected until Epic 1).

---

### Epic 1 — Append-only ledger

**Prerequisite:** Epic 5a green.

Two specialists in parallel:
- **data-foundation:** extend `GoldInventorySourceType` with `REVERSAL`, `DISPATCH`, `PURCHASE`. New migration.
- **domain-backend:** add `OversoldError` + `recordReversalEvent` exports to `lib/gold/inventory.ts`. Fix `getOnHandGrams` to throw `OversoldError` instead of `Math.max(0,...)`. Replace all `goldInventoryEvent.deleteMany` calls with reversal inserts in `import-cleanup.ts` and `commit/route.ts`.

**Done when:** Suites 2 and 3 in `inventory.test.ts` pass. Reviewer grep confirms zero `goldInventoryEvent.deleteMany` in the codebase.

---

### Epic 2 — Role gates

**Prerequisite:** Epic 1 green.  
**Specialist:** `gold-domain-backend`.

Add role gate to every Gold mutation endpoint. See review doc §3.3 P0-2 and §6.2 for the full list.

**Done when:** Role-gate test suite passes. Every `POST`/`PATCH`/`DELETE` in `app/api/gold/**` calls a role-check function.

---

### Epic 3 — FIFO concurrency + mixed-site dispatch + parallel crews

**Prerequisite:** Epic 2 green. Three fixes run in parallel.

- **FIFO lock** (`domain-backend`): `pg_advisory_xact_lock(hashtext('gold-fifo:' || siteId))` in `linkFifoSale`. Witness test: two concurrent calls must not double-consume.
- **Mixed-site dispatch** (`domain-backend` + `data-foundation`): hard reject in `dispatches/route.ts` + `siteId` column on `GoldDispatch` with migration.
- **Parallel crews** (`domain-backend` + `data-foundation`): filter attendance by `shiftGroupId` in `shift-allocations/route.ts:210` + widen unique constraint.

---

### Epic 4 — Atomic accounting + price-fallback

**Prerequisite:** Epic 3 green. Two parallel tracks.

- **Track A** (`domain-backend`): `lib/gold/price-fallback.ts` three-tier resolver (configured → live API cache → $80) + `goldPriceSource` column on every snapshot row.
- **Track B** (`domain-backend`): add `tx` parameter to `captureAccountingEvent` + `createJournalEntryFromSource`; wrap source + accounting + inventory in single `$transaction` across all 6 endpoints from §6.6; promote `pour-created` and `dispatch-created` from `IGNORED` to `PENDING`; add missing inventory IN for purchases, OUT for dispatches.

**Done when:** Atomicity test suite passes — if `captureAccountingEvent` throws, source row must not exist.

---

### Epic 6 — Schema modernisation (Decimal + companyId)

**Prerequisite:** Epic 5a green + Epic 4 green. Highest-risk migration.

Procedure per column group:
1. Snapshot all financial aggregates on Neon.
2. Write the migration.
3. Run on a DB clone.
4. Parity check: ≤ 0.001g and ≤ $0.01 drift.
5. Run on prod Neon.
6. Suite 4 (`inventory.test.ts` Decimal witness) must now pass.

Do `Float → Decimal` first. `companyId` denormalisation as a separate migration after.

---

### Epics 7–13

Follow the same pattern — tech-lead verifies DoR, specialist works in worktree, reviewer gates, you merge. Sequence from review doc §13.5 / §15.3 is authoritative.

| Epic | Owner | Key work |
|---|---|---|
| 7 | domain-backend + data-foundation | `GoldLedgerCorrection` + `BuyerReceiptCorrection` + `AdjustmentEntry` wiring |
| 8 | import-workflow | Import lock/lease, scoped cleanup, dead state removal |
| 9a | import-workflow | Background worker, SSE progress, import engine extraction |
| 9b | import-workflow | Period-close model + import snapshots |
| 10 | import-workflow | Variance reports, balance roll-forward, reconciliation dashboard |
| 11 | frontend | UI polish: hydration, mobile, forms, accessibility, copy |
| 12a | integration | HR seam extraction, commodity billing helpers, shared UI primitives |
| 12b | integration | Notifications for critical exceptions, PlatformAuditEvent, structured logging, SLOs |
| 12c | integration | GoldCompanyConfig, attachmentsJson on GoldPurchase |
| 13 | all | On-call rotation, runbook activation, first recovery drill |

---

## 6. Day-to-day workflow

```
1. claude (new session in the repo)
2. "Create team gold-sprint-N. Spawn gold-tech-lead as 'lead'."
3. Tell lead: "Plan ticket [X] from Epic [N]. Verify DoR. Name specialist and reviewer."
4. Lead reports plan. You approve or redirect.
5. Lead spawns specialist(s) in worktrees.
6. Shift+Down to check on teammates. Message them directly to steer.
7. When specialists finish, lead invokes gold-reviewer.
8. Reviewer approves or blocks (gives file:line for each block).
9. Specialist iterates in same worktree if blocked.
10. You merge the PR: gh pr merge <number>
11. "Clean up the team."
```

---

## 7. Failure modes

| Problem | Fix |
|---|---|
| Teammate can't write files | Add `"permissions": { "defaultMode": "acceptEdits" }` to project `.claude/settings.json` |
| Specialist edited wrong files | `git checkout -- <file>`, message specialist to stay in charter |
| Reviewer blocking on pre-existing lint | Message reviewer: "Focus on changed lines only — [file] errors are pre-existing" |
| Orphaned team after crash | `rm -rf ~/.claude/teams/<name> ~/.claude/tasks/<name>` |
| Migration failed halfway | `git revert` the migration commit, run `prisma migrate dev`, confirm DB restored, investigate |
| Teammate stopped responding | `Shift+Down` → check their last output → message directly to resume or spawn replacement |

---

## 8. Human decision points — never delegate

- Approving a migration to run on the Neon prod DB
- Merging a PR
- Choosing between competing approaches when the lead presents options
- Period-close overrides (Epic 9b) — SUPERADMIN-only
- Declaring Epic 0 done after your smoke test

---

## 9. Full sequence at a glance

```
Now       → Epic 0: smoke-test hotfix (you, 4-6 hrs)
Week 1    → Epic 5a: test harness + factories + vitest infra
Week 2    → Epic 1: append-only ledger (Suites 2+3 turn green)
Week 3    → Epic 2: role gates
Week 4    → Epic 3: FIFO + dispatch + parallel crews (parallel workstreams)
Week 5-6  → Epic 4: atomic accounting + price-fallback
Week 7-8  → Epic 6: Decimal + companyId (parity check required)
Week 9    → Epic 7: corrections model + AdjustmentEntry
Week 10   → Epic 8: import stabilisation
Week 11+  → Epic 9a: importer worker + repair
           → Epic 9b: period-close + snapshots
           → Epic 10: reconciliation + reporting
           → Epic 11: UI polish sweep
           → Epic 12a/b/c: boundary cleanup + observability + settings
           → Epic 13: operational readiness
```

Sequence from review doc §13.5 is authoritative if this diverges.

---

## 10. Key file locations

| File | Purpose |
|---|---|
| `docs/gold-module-review-2026-05-09.md` | Full architecture review, data model, UI/UX, integrations, roadmap (§1–15) |
| `docs/gold-team-dev-brief-2026-05-09.md` | This file — operational brief for running the agent team |
| `CLAUDE.md` | Auto-loaded context for every session (hard rules, current phase, quick commands) |
| `AGENTS.md` | Project guidelines + agent team collaboration rules |
| `.claude/agents/*.md` | Seven agent definitions |
| `.claude/settings.json` | Project-level hooks |
| `scripts/agent-*.js` | Hook scripts (charter, paired-test, stop summary) |
| `lib/gold/test-factories.ts` | Epic 5a: test factories for all Gold models |
| `lib/gold/inventory.test.ts` | Epic 5a: inventory invariant migration witnesses |
| `scripts/backfill-buyer-receipt-batches.ts` | Already applied — idempotent, safe to re-run |
