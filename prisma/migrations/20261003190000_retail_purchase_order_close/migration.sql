-- AlterEnum
ALTER TYPE "RetailPurchaseOrderStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "RetailPurchaseOrder" ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "closedById" TEXT,
ADD COLUMN "closeNote" TEXT;

-- AlterTable
ALTER TABLE "RetailGoodsReceiptLine" ADD COLUMN "purchaseOrderLineId" TEXT;

-- CreateIndex
CREATE INDEX "RetailGoodsReceiptLine_purchaseOrderLineId_idx" ON "RetailGoodsReceiptLine"("purchaseOrderLineId");

-- AddForeignKey
ALTER TABLE "RetailPurchaseOrder" ADD CONSTRAINT "RetailPurchaseOrder_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailGoodsReceiptLine" ADD CONSTRAINT "RetailGoodsReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "RetailPurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A closed order says when; nothing else does.
ALTER TABLE "RetailPurchaseOrder" ADD CONSTRAINT "RetailPurchaseOrder_closed_when" CHECK (("status"::text = 'CLOSED') = ("closedAt" IS NOT NULL));
