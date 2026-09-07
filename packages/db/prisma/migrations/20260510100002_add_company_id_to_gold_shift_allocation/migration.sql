-- Epic 6: Denormalise companyId onto GoldShiftAllocation
-- Phase A: Add nullable companyId column + Company relation
-- Phase B: Backfill from site.companyId (see scripts/backfill-gold-shift-allocation-company-id.ts)
-- Phase C: NOT NULL enforcement deferred until backfill verified in production
-- Phase E: Add (companyId, workflowStatus, date) index for list queries
--
-- Rollback procedure:
--   1. DROP INDEX IF EXISTS "GoldShiftAllocation_companyId_workflowStatus_date_idx";
--   2. ALTER TABLE "GoldShiftAllocation" DROP CONSTRAINT IF EXISTS "GoldShiftAllocation_companyId_fkey";
--   3. ALTER TABLE "GoldShiftAllocation" DROP COLUMN "companyId";

-- Phase A: add nullable column
ALTER TABLE "GoldShiftAllocation" ADD COLUMN "companyId" TEXT;

-- Phase A: add FK constraint
ALTER TABLE "GoldShiftAllocation"
  ADD CONSTRAINT "GoldShiftAllocation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase E: compound index for hot list queries
CREATE INDEX "GoldShiftAllocation_companyId_workflowStatus_date_idx"
  ON "GoldShiftAllocation"("companyId", "workflowStatus", "date");
