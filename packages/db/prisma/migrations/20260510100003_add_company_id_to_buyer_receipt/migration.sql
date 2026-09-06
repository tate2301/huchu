-- Epic 6: Denormalise companyId onto BuyerReceipt
-- Phase A: Add nullable companyId column + Company relation
-- Phase B: Backfill from goldPour.site.companyId (see scripts/backfill-buyer-receipt-company-id.ts)
-- Phase C: NOT NULL enforcement deferred until backfill verified in production
-- Phase D: Add (companyId, receiptNumber) unique (receiptNumber was previously not unique at all)
-- Phase E: Add (companyId, receiptDate DESC) index for list queries
--
-- Rollback procedure:
--   1. DROP INDEX IF EXISTS "BuyerReceipt_companyId_receiptDate_idx";
--   2. DROP INDEX IF EXISTS "BuyerReceipt_companyId_receiptNumber_key";
--   3. ALTER TABLE "BuyerReceipt" DROP CONSTRAINT IF EXISTS "BuyerReceipt_companyId_fkey";
--   4. ALTER TABLE "BuyerReceipt" DROP COLUMN "companyId";

-- Phase A: add nullable column
ALTER TABLE "BuyerReceipt" ADD COLUMN "companyId" TEXT;

-- Phase A: add FK constraint
ALTER TABLE "BuyerReceipt"
  ADD CONSTRAINT "BuyerReceipt_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase D: add company-scoped unique on receiptNumber
-- Uses a partial index on non-NULL companyId so existing NULL rows don't conflict
-- during the nullable phase. After NOT NULL migration this enforces full uniqueness.
CREATE UNIQUE INDEX "BuyerReceipt_companyId_receiptNumber_key"
  ON "BuyerReceipt"("companyId", "receiptNumber")
  WHERE "companyId" IS NOT NULL;

-- Phase E: compound index for hot list queries
CREATE INDEX "BuyerReceipt_companyId_receiptDate_idx"
  ON "BuyerReceipt"("companyId", "receiptDate" DESC);
