-- Epic 6: Denormalise companyId onto GoldDispatchBatch and BuyerReceiptBatch
-- Phase A: Add nullable companyId column + Company relation on both bridge tables
-- Phase B: Backfill from parent dispatch/receipt companyId (see scripts/backfill-batch-company-ids.ts)
-- Phase C: NOT NULL enforcement deferred until backfill verified in production
-- Phase E: Add companyId indexes for filtered queries
--
-- Rollback procedure:
--   1. DROP INDEX IF EXISTS "GoldDispatchBatch_companyId_idx";
--   2. DROP INDEX IF EXISTS "BuyerReceiptBatch_companyId_idx";
--   3. ALTER TABLE "GoldDispatchBatch" DROP CONSTRAINT IF EXISTS "GoldDispatchBatch_companyId_fkey";
--   4. ALTER TABLE "BuyerReceiptBatch" DROP CONSTRAINT IF EXISTS "BuyerReceiptBatch_companyId_fkey";
--   5. ALTER TABLE "GoldDispatchBatch" DROP COLUMN "companyId";
--   6. ALTER TABLE "BuyerReceiptBatch" DROP COLUMN "companyId";

-- GoldDispatchBatch: Phase A
ALTER TABLE "GoldDispatchBatch" ADD COLUMN "companyId" TEXT;

ALTER TABLE "GoldDispatchBatch"
  ADD CONSTRAINT "GoldDispatchBatch_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "GoldDispatchBatch_companyId_idx"
  ON "GoldDispatchBatch"("companyId");

-- BuyerReceiptBatch: Phase A
ALTER TABLE "BuyerReceiptBatch" ADD COLUMN "companyId" TEXT;

ALTER TABLE "BuyerReceiptBatch"
  ADD CONSTRAINT "BuyerReceiptBatch_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BuyerReceiptBatch_companyId_idx"
  ON "BuyerReceiptBatch"("companyId");
