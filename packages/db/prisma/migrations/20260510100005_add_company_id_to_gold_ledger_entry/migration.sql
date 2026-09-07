-- Epic 6: Denormalise companyId onto GoldLedgerEntry
-- Phase A: Add nullable companyId column + Company relation
-- Phase B: Backfill from import.companyId (see scripts/backfill-gold-ledger-entry-company-id.ts)
-- Phase C: NOT NULL enforcement deferred until backfill verified in production
-- Phase E: Add (companyId, status) index for filtered list queries
--
-- Rollback procedure:
--   1. DROP INDEX IF EXISTS "GoldLedgerEntry_companyId_status_idx";
--   2. ALTER TABLE "GoldLedgerEntry" DROP CONSTRAINT IF EXISTS "GoldLedgerEntry_companyId_fkey";
--   3. ALTER TABLE "GoldLedgerEntry" DROP COLUMN "companyId";

-- Phase A: add nullable column
ALTER TABLE "GoldLedgerEntry" ADD COLUMN "companyId" TEXT;

-- Phase A: add FK constraint
ALTER TABLE "GoldLedgerEntry"
  ADD CONSTRAINT "GoldLedgerEntry_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase E: compound index for filtered queries
CREATE INDEX "GoldLedgerEntry_companyId_status_idx"
  ON "GoldLedgerEntry"("companyId", "status");
