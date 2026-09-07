-- Reconcile the Gold tables with the schema they are declared as.
--
-- Two drifts, both invisible until the history was replayed:
--
-- 20260510200001_add_correction_models gave `id` a database default and
-- `createdAt` a wider type than prisma/schema.prisma declares. Prisma drops and
-- re-adds the foreign keys either side of the column change; the constraints
-- come back identical.
--
-- 20260510100003_add_company_id_to_buyer_receipt created
-- BuyerReceipt_companyId_receiptNumber_key as a PARTIAL index
-- (WHERE "companyId" IS NOT NULL) while the schema declares a plain @@unique.
-- Prisma cannot express an index predicate, so a migrated database and a
-- db-push database disagreed. The full index is what the schema means and what
-- every db-push database already has; the two behave identically for the NULL
-- companyId rows the predicate was there to protect, because Postgres treats
-- NULLs in a unique index as distinct.
--
-- Already true of any database built by `db push`:
--   npx prisma migrate resolve --applied 20260728000001_reconcile_gold_indexes

-- DropForeignKey
ALTER TABLE "BuyerReceiptCorrection" DROP CONSTRAINT "BuyerReceiptCorrection_adjustmentEntryId_fkey";

-- DropForeignKey
ALTER TABLE "BuyerReceiptCorrection" DROP CONSTRAINT "BuyerReceiptCorrection_buyerReceiptId_fkey";

-- DropForeignKey
ALTER TABLE "BuyerReceiptCorrection" DROP CONSTRAINT "BuyerReceiptCorrection_companyId_fkey";

-- DropForeignKey
ALTER TABLE "BuyerReceiptCorrection" DROP CONSTRAINT "BuyerReceiptCorrection_createdById_fkey";

-- DropForeignKey
ALTER TABLE "GoldLedgerCorrection" DROP CONSTRAINT "GoldLedgerCorrection_adjustmentEntryId_fkey";

-- DropForeignKey
ALTER TABLE "GoldLedgerCorrection" DROP CONSTRAINT "GoldLedgerCorrection_companyId_fkey";

-- DropForeignKey
ALTER TABLE "GoldLedgerCorrection" DROP CONSTRAINT "GoldLedgerCorrection_createdById_fkey";

-- AlterTable
ALTER TABLE "BuyerReceiptCorrection" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GoldLedgerCorrection" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
DROP INDEX IF EXISTS "BuyerReceipt_companyId_receiptNumber_key";
CREATE UNIQUE INDEX "BuyerReceipt_companyId_receiptNumber_key" ON "BuyerReceipt"("companyId", "receiptNumber");

-- AddForeignKey
ALTER TABLE "GoldLedgerCorrection" ADD CONSTRAINT "GoldLedgerCorrection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLedgerCorrection" ADD CONSTRAINT "GoldLedgerCorrection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLedgerCorrection" ADD CONSTRAINT "GoldLedgerCorrection_adjustmentEntryId_fkey" FOREIGN KEY ("adjustmentEntryId") REFERENCES "AdjustmentEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerReceiptCorrection" ADD CONSTRAINT "BuyerReceiptCorrection_buyerReceiptId_fkey" FOREIGN KEY ("buyerReceiptId") REFERENCES "BuyerReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerReceiptCorrection" ADD CONSTRAINT "BuyerReceiptCorrection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerReceiptCorrection" ADD CONSTRAINT "BuyerReceiptCorrection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerReceiptCorrection" ADD CONSTRAINT "BuyerReceiptCorrection_adjustmentEntryId_fkey" FOREIGN KEY ("adjustmentEntryId") REFERENCES "AdjustmentEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
