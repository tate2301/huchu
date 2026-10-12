
-- CreateEnum
CREATE TYPE "RetailDeliveryDifferenceKind" AS ENUM ('SHORT', 'BROKEN', 'WRONG_ITEM', 'EXTRA');

-- CreateEnum
CREATE TYPE "RetailDeliverySettle" AS ENUM ('CREDIT', 'NEXT_TIME', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "RetailDeliveryPaying" AS ENUM ('ON_ACCOUNT', 'NOT_YET', 'CASH_NOW');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RETAIL_DELIVERY_TO_CHECK';

-- AlterEnum
ALTER TYPE "NotificationEntityType" ADD VALUE 'RETAIL_GOODS_RECEIPT';

-- AlterEnum
-- COUNTED comes before POSTED, and becomes the column default in this same
-- migration, so the type is made again rather than added to (a value added
-- by ADD VALUE cannot be used in the transaction that adds it).
ALTER TYPE "RetailGoodsReceiptStatus" RENAME TO "RetailGoodsReceiptStatus_old";
CREATE TYPE "RetailGoodsReceiptStatus" AS ENUM ('COUNTED', 'POSTED', 'REVERSED');
ALTER TABLE "RetailGoodsReceipt" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RetailGoodsReceipt" ALTER COLUMN "status" TYPE "RetailGoodsReceiptStatus" USING ("status"::text::"RetailGoodsReceiptStatus");
ALTER TABLE "RetailGoodsReceipt" ALTER COLUMN "status" SET DEFAULT 'COUNTED';
DROP TYPE "RetailGoodsReceiptStatus_old";

-- AlterEnum
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_DELIVERY_DIFFERENCE';

-- AlterTable
ALTER TABLE "RetailGoodsReceipt" ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "checkedById" TEXT,
ADD COLUMN     "countedById" TEXT,
ADD COLUMN     "driver" TEXT,
ADD COLUMN     "noteNumber" TEXT,
ADD COLUMN     "paying" "RetailDeliveryPaying",
ADD COLUMN     "requisitionId" TEXT,
ADD COLUMN     "reverseReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" TEXT;

-- AlterTable
ALTER TABLE "RetailGoodsReceiptLine" ADD COLUMN     "damagedQuantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "noteQuantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RetailDeliveryDifference" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "receiptLineId" TEXT NOT NULL,
    "kind" "RetailDeliveryDifferenceKind" NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "settle" "RetailDeliverySettle",
    "atReceiving" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" TIMESTAMP(3),
    "returnId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailDeliveryDifference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailDeliveryDifference_receiptId_idx" ON "RetailDeliveryDifference"("receiptId");

-- CreateIndex
CREATE INDEX "RetailDeliveryDifference_companyId_createdAt_idx" ON "RetailDeliveryDifference"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "RetailGoodsReceipt" ADD CONSTRAINT "RetailGoodsReceipt_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailGoodsReceipt" ADD CONSTRAINT "RetailGoodsReceipt_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailGoodsReceipt" ADD CONSTRAINT "RetailGoodsReceipt_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailGoodsReceipt" ADD CONSTRAINT "RetailGoodsReceipt_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "CrmRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDeliveryDifference" ADD CONSTRAINT "RetailDeliveryDifference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDeliveryDifference" ADD CONSTRAINT "RetailDeliveryDifference_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "RetailGoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDeliveryDifference" ADD CONSTRAINT "RetailDeliveryDifference_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "RetailGoodsReceiptLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deliveries kept before this were posted at once by whoever booked them:
-- what came is what went into stock, at the product's VAT rate, and the
-- booker counted and checked it.
UPDATE "RetailGoodsReceiptLine" l
SET "noteQuantity" = l."quantity",
    "vatRate" = COALESCE(p."defaultTaxRate", 0)
FROM "InventoryItem" i
LEFT JOIN "Product" p ON p."id" = i."productId"
WHERE i."id" = l."inventoryItemId";

UPDATE "RetailGoodsReceipt"
SET "countedById" = "receivedById",
    "checkedById" = "receivedById",
    "checkedAt" = "postedAt";
