-- Epic 7: Add GoldLedgerCorrection + BuyerReceiptCorrection + drop BuyerReceipt.paidValueUsd
--
-- ROLLBACK PROCEDURE:
--   1. DROP TABLE "BuyerReceiptCorrection";
--   2. DROP TABLE "GoldLedgerCorrection";
--   3. DROP TYPE "GoldCorrectionType";
--   4. ALTER TABLE "BuyerReceipt" ADD COLUMN "paidValueUsd" DECIMAL(14,2);
--      (re-populate from paidAmount if needed for any active report queries)
--   Note: steps 1-3 are safe to run in any order since the correction tables
--   have no dependents. Step 4 re-adds paidValueUsd as nullable so no data loss.

-- 1. New enum
CREATE TYPE "GoldCorrectionType" AS ENUM (
  'ADJUST_AMOUNT',
  'ADJUST_ASSAY',
  'ADJUST_GRAMS',
  'VOID',
  'RECLASSIFY',
  'OTHER'
);

-- 2. GoldLedgerCorrection — corrections targeting any Gold entity
CREATE TABLE "GoldLedgerCorrection" (
  "id"                TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"         TEXT          NOT NULL,
  "entityType"        TEXT          NOT NULL,
  "entityId"          TEXT          NOT NULL,
  "type"              "GoldCorrectionType" NOT NULL,
  "reason"            TEXT          NOT NULL,
  "beforeJson"        JSONB,
  "afterJson"         JSONB,
  "deltaUsd"          DECIMAL(14,2),
  "deltaGrams"        DECIMAL(12,4),
  "adjustmentEntryId" TEXT,
  "createdById"       TEXT          NOT NULL,
  "createdAt"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "GoldLedgerCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoldLedgerCorrection_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id"),
  CONSTRAINT "GoldLedgerCorrection_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id"),
  CONSTRAINT "GoldLedgerCorrection_adjustmentEntryId_fkey"
    FOREIGN KEY ("adjustmentEntryId") REFERENCES "AdjustmentEntry"("id")
);

CREATE INDEX "GoldLedgerCorrection_companyId_entityType_entityId_idx"
  ON "GoldLedgerCorrection"("companyId", "entityType", "entityId");

CREATE INDEX "GoldLedgerCorrection_companyId_createdAt_idx"
  ON "GoldLedgerCorrection"("companyId", "createdAt" DESC);

-- 3. BuyerReceiptCorrection — append-only correction history for immutable receipts
CREATE TABLE "BuyerReceiptCorrection" (
  "id"                TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "buyerReceiptId"    TEXT          NOT NULL,
  "companyId"         TEXT          NOT NULL,
  "type"              "GoldCorrectionType" NOT NULL,
  "reason"            TEXT          NOT NULL,
  "beforeJson"        JSONB,
  "afterJson"         JSONB,
  "deltaAmountUsd"    DECIMAL(14,2),
  "deltaAssay"        DECIMAL(5,2),
  "adjustmentEntryId" TEXT,
  "createdById"       TEXT          NOT NULL,
  "createdAt"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "BuyerReceiptCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BuyerReceiptCorrection_buyerReceiptId_fkey"
    FOREIGN KEY ("buyerReceiptId") REFERENCES "BuyerReceipt"("id") ON DELETE CASCADE,
  CONSTRAINT "BuyerReceiptCorrection_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id"),
  CONSTRAINT "BuyerReceiptCorrection_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id"),
  CONSTRAINT "BuyerReceiptCorrection_adjustmentEntryId_fkey"
    FOREIGN KEY ("adjustmentEntryId") REFERENCES "AdjustmentEntry"("id")
);

CREATE INDEX "BuyerReceiptCorrection_buyerReceiptId_createdAt_idx"
  ON "BuyerReceiptCorrection"("buyerReceiptId", "createdAt" DESC);

CREATE INDEX "BuyerReceiptCorrection_companyId_createdAt_idx"
  ON "BuyerReceiptCorrection"("companyId", "createdAt" DESC);

-- 4. Drop BuyerReceipt.paidValueUsd
-- Data is already in paidAmount (Decimal, same scale). paidValueUsd was a
-- denormalised duplicate (see §8 Q2, §4.4 C-6). Callers in app/** have been
-- updated to use paidAmount directly.
ALTER TABLE "BuyerReceipt" DROP COLUMN IF EXISTS "paidValueUsd";
