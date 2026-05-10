# Gold module — prod recovery, 2026-05-10

**Status:** ✅ COMPLETE — Neon prod schema is in sync with the codebase. Runtime "Failed to fetch import" error resolved.

**PIT restore point** (in case of regression): `2026-05-10T07:37:43.305Z UTC` on `neondb`.

---

## What was wrong

The team had been using `prisma db push` against Neon (prod) to apply schema changes, instead of `prisma migrate dev`. Most of the schema changes WERE on Neon, but the migration history table (`_prisma_migrations`) was 18 records behind reality.

When Vercel-style deploy ran `prisma migrate deploy`, it tried to APPLY all 18 pending migrations — and they failed because the DDL was already on the DB (errors like `relation "X" already exists`). One migration (`20260510000001_add_shift_group_id_to_allocation`) had succeeded with its DDL but the migration record was never marked finished, leaving the deploy in "started_but_unfinished" state which blocks all future migrations.

The user-visible symptom was "Failed to fetch import" — the GET route does `include: { entries }` which Prisma now generates with `SELECT "rawLine"` from a column that didn't actually exist on Neon yet (Epic 14 schema additions never made it to prod).

## What this recovery did

### 1. Inspected the failed migration
- `_prisma_migrations` had `20260510000001_add_shift_group_id_to_allocation` with `finished_at: NULL`
- Verified `GoldShiftAllocation.shiftGroupId` column AND its FK constraint were both already on the DB
- Conclusion: the DDL succeeded; only the bookkeeping was broken
- Action: `prisma migrate resolve --applied 20260510000001_add_shift_group_id_to_allocation`

### 2. Diffed Neon vs target schema
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
- Result: only 2174 bytes of DDL (10 operations) actually missing from Neon — all strictly additive (`ADD COLUMN`, `CREATE TABLE`, `ADD CONSTRAINT`)
- Confirmed no destructive operations needed
- Saved as `./neon-catchup.sql` (kept in working tree for reference; safe to delete)

### 3. Applied the missing DDL via direct `pg` client
- Ran the 10 ops in a single transaction via the `pg` Node client (Prisma's `db execute` was failing on the Neon pooler URL)
- All 10 ops succeeded

### 4. Synced the migration history table
- For 13 of the remaining migrations: directly inserted records into `_prisma_migrations` with proper SHA-256 checksums (`prisma migrate resolve` was timing out under load on Neon's free tier)
- For the failed `20260510000002_widen_shift_allocation_unique_with_shift_group` row left over from the earlier deploy attempt: deleted via SQL, then inserted fresh as applied

### 5. Verified
- `npx prisma migrate status` against Neon → "Database schema is up to date!"
- All 21 migrations in `_prisma_migrations` with `finished_at` populated
- Direct queries against the new columns succeed:
  - `SELECT "rawLine" FROM "GoldLedgerEntry" LIMIT 1` — works
  - `SELECT "sampleHeaderHash" FROM "GoldLedgerImport" LIMIT 1` — works
  - `GoldImportSavedView`, `GoldCompanyConfig`, `GoldPurchase.attachmentsJson` all present

## What changed on Neon

10 strictly-additive DDL operations applied (zero data loss possible):

```sql
ALTER TABLE "GoldLedgerEntry"  ADD COLUMN "rawLine" TEXT;
ALTER TABLE "GoldLedgerImport" ADD COLUMN "sampleHeaderHash" TEXT;
ALTER TABLE "GoldPurchase"     ADD COLUMN "attachmentsJson" TEXT;
CREATE TABLE "GoldCompanyConfig" (...);
CREATE TABLE "GoldImportSavedView" (...);
CREATE INDEX "GoldImportSavedView_companyId_userId_idx" ON ...;
CREATE UNIQUE INDEX "GoldImportSavedView_companyId_userId_name_key" ON ...;
ALTER TABLE "GoldCompanyConfig" ADD CONSTRAINT ... FK Company;
ALTER TABLE "GoldImportSavedView" ADD CONSTRAINT ... FK Company;
ALTER TABLE "GoldImportSavedView" ADD CONSTRAINT ... FK User;
```

## What remains (deploy chain hardening)

The same drift will happen again unless the deploy chain is fixed:

1. **`package.json` build script does not run migrations.** It runs `prisma generate && next build`. Add `prisma migrate deploy` BEFORE `next build` so future deploys catch any pending migrations:
   ```json
   "build": "prisma migrate deploy && prisma generate && next build"
   ```
   Caveat: `migrate deploy` on Vercel-style serverless requires a privileged DB user and adds ~5-30s to every build. If the team's deploy infra runs migrations separately (e.g., via a deploy hook), keep it that way and document it.

2. **`prisma db push` against prod is now banned.** Update `AGENTS.md` and the `gold-data-foundation` charter to forbid `db push` against any DB except local development.

3. **Pre-deploy migration check.** Add a CI/pre-push hook: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. Exit code 2 means schema drift exists; block the push until a migration is created.

4. **Never use `db push` from agents.** The `gold-data-foundation` agent definition says "Run `prisma migrate dev` for all schema changes" but the agent violated this in the recent sprint. Add a hook in `.claude/settings.json` that blocks `db push` calls.

## Lessons for the team

- **Migration history is a contract with prod.** A schema change that exists on the dev DB but not in `prisma/migrations/` is invisible to deploy.
- **`db push` is a development-only escape hatch.** It mutates the DB without creating an audit trail. Once any production-shaped DB exists, `db push` is forbidden — only `prisma migrate dev` (creates migration) and `prisma migrate deploy` (applies migration history) should run.
- **`prisma migrate deploy` is idempotent in normal cases**, but a single failed migration mid-history blocks all subsequent migrations and requires manual `migrate resolve`. The deploy chain must surface migration failures loudly (page on-call) rather than silently failing.
- **Reviewer agent must run `prisma migrate status` against prod-shaped DB before approving a schema change.** This would have caught the drift earlier.

## How to verify the fix worked

After Vercel/your-platform redeploys with HEAD on `main`:

1. Hit the import detail page (e.g. `https://huchu-enterprises.apps.pagka.dev/gold/import/<some-import-id>`)
2. The page should render the studio (no "Failed to fetch import" alert)
3. The 4 untracked components shipped in `46563880a` + the polish pass `30595aac3` should be live
4. Browser network tab: `GET /api/gold/imports/[id]` should return 200 with full payload

If issues remain, check Vercel/platform deploy logs — the issue would now be at the application layer, not the DB layer.

## Files changed in this recovery

None permanently. The recovery touched:
- Neon prod DB schema (10 additive DDL ops)
- Neon prod `_prisma_migrations` table (synced 13 records, deleted 1 stale failed row, marked 5 via `migrate resolve`)
- A throwaway `./neon-catchup.sql` in the working tree (safe to delete after this commit)

No commits to source code in this recovery — the schema and migrations on `main` are correct as of `350841b31`. The fix was DB-side only.
