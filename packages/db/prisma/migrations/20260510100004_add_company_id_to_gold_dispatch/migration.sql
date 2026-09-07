-- Epic 6: Denormalise companyId onto GoldDispatch
-- Phase A: Add nullable companyId column + Company relation
-- Phase B: Backfill from goldPour.site.companyId (see scripts/backfill-gold-dispatch-company-id.ts)
-- Phase C: NOT NULL enforcement deferred until backfill verified in production
-- Phase E: Add (companyId, dispatchDate) index for list queries
--
-- Rollback procedure:
--   1. DROP INDEX IF EXISTS "GoldDispatch_companyId_dispatchDate_idx";
--   2. ALTER TABLE "GoldDispatch" DROP CONSTRAINT IF EXISTS "GoldDispatch_companyId_fkey";
--   3. ALTER TABLE "GoldDispatch" DROP COLUMN "companyId";

-- Phase A: add nullable column
ALTER TABLE "GoldDispatch" ADD COLUMN "companyId" TEXT;

-- Phase A: add FK constraint
ALTER TABLE "GoldDispatch"
  ADD CONSTRAINT "GoldDispatch_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase E: compound index for hot list queries
CREATE INDEX "GoldDispatch_companyId_dispatchDate_idx"
  ON "GoldDispatch"("companyId", "dispatchDate");
