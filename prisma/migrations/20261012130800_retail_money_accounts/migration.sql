-- AlterEnum


ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_REQUISITION_PAYOUT';
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_REQUISITION_CHANGE';
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_SUPPLIER_PAYMENT';

-- AlterEnum
ALTER TYPE "PostingRuleLineAccountSource" ADD VALUE 'EVENT_ACCOUNT';

-- AlterTable
ALTER TABLE "PostingRuleLine" ADD COLUMN     "eventAccountKey" TEXT;

-- AlterTable
ALTER TABLE "PurchasePayment" ADD COLUMN     "groupNo" TEXT,
ADD COLUMN     "requisitionId" TEXT,
ADD COLUMN     "vendorId" TEXT;

-- CreateIndex
CREATE INDEX "PurchasePayment_companyId_vendorId_billId_idx" ON "PurchasePayment"("companyId", "vendorId", "billId");

-- CreateIndex
CREATE INDEX "PurchasePayment_companyId_groupNo_idx" ON "PurchasePayment"("companyId", "groupNo");

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "CrmRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A payment kept before this names its supplier through its bill.
UPDATE "PurchasePayment" p
SET "vendorId" = b."vendorId"
FROM "PurchaseBill" b
WHERE p."billId" = b."id" AND p."vendorId" IS NULL;
