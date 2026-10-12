-- FLR-06: lay-bys (58-floor-laybys, W-42). A customer puts goods aside with
-- a deposit and pays the rest over time; the goods leave the shelf
-- (LAYBY_ASIDE) and come back if it is cancelled (LAYBY_BACK); cash taken
-- for one goes into a drawer as TAKEN_IN, and goes back out as a PAYOUT
-- (LAYBY_REFUND); the hand-over is a sale paid LAYBY (Lay-by deposits held).
-- The enum values come first and nothing below uses them.

-- CreateEnum
CREATE TYPE "RetailLaybyStatus" AS ENUM ('PAYING', 'READY', 'COLLECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RetailLaybyPaymentKind" AS ENUM ('DEPOSIT', 'PAYMENT', 'REFUND');

-- AlterEnum
ALTER TYPE "StockMovementReason" ADD VALUE 'LAYBY_ASIDE';
ALTER TYPE "StockMovementReason" ADD VALUE 'LAYBY_BACK';

-- AlterEnum
ALTER TYPE "RetailCashMovementType" ADD VALUE 'TAKEN_IN';

-- AlterEnum
ALTER TYPE "RetailCashMovementReason" ADD VALUE 'LAYBY_PAYMENT';
ALTER TYPE "RetailCashMovementReason" ADD VALUE 'LAYBY_REFUND';

-- AlterEnum
ALTER TYPE "RetailTenderType" ADD VALUE 'LAYBY';

-- AlterEnum
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_LAYBY_PAYMENT';
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_LAYBY_CANCEL';

-- AlterTable
ALTER TABLE "RetailTillRules" ADD COLUMN     "laybyCancelFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "laybyMaxDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "laybyMinDepositPercent" DECIMAL(5,2) NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "RetailLayby" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "laybyNo" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "RetailLaybyStatus" NOT NULL DEFAULT 'PAYING',
    "total" DECIMAL(14,2) NOT NULL,
    "paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueOn" DATE NOT NULL,
    "remindWeekly" BOOLEAN NOT NULL DEFAULT true,
    "lastRemindedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3),
    "collectedById" TEXT,
    "saleId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelFee" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailLayby_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailLaybyLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "laybyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "costUnit" DECIMAL(14,2) NOT NULL,
    "priceListId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailLaybyLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailLaybyPayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "laybyId" TEXT NOT NULL,
    "kind" "RetailLaybyPaymentKind" NOT NULL,
    "tenderType" "RetailTenderType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "shiftId" TEXT,
    "cashMovementId" TEXT,
    "receivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailLaybyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailLayby_saleId_key" ON "RetailLayby"("saleId");

-- CreateIndex
CREATE INDEX "RetailLayby_companyId_status_dueOn_idx" ON "RetailLayby"("companyId", "status", "dueOn");

-- CreateIndex
CREATE INDEX "RetailLayby_customerId_idx" ON "RetailLayby"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailLayby_companyId_laybyNo_key" ON "RetailLayby"("companyId", "laybyNo");

-- CreateIndex
CREATE INDEX "RetailLaybyLine_laybyId_idx" ON "RetailLaybyLine"("laybyId");

-- CreateIndex
CREATE INDEX "RetailLaybyLine_companyId_productId_idx" ON "RetailLaybyLine"("companyId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailLaybyPayment_cashMovementId_key" ON "RetailLaybyPayment"("cashMovementId");

-- CreateIndex
CREATE INDEX "RetailLaybyPayment_laybyId_createdAt_idx" ON "RetailLaybyPayment"("laybyId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailLaybyPayment_companyId_shiftId_idx" ON "RetailLaybyPayment"("companyId", "shiftId");

-- AddForeignKey
ALTER TABLE "RetailLayby" ADD CONSTRAINT "RetailLayby_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLayby" ADD CONSTRAINT "RetailLayby_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLayby" ADD CONSTRAINT "RetailLayby_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLayby" ADD CONSTRAINT "RetailLayby_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLayby" ADD CONSTRAINT "RetailLayby_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLayby" ADD CONSTRAINT "RetailLayby_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLayby" ADD CONSTRAINT "RetailLayby_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLaybyLine" ADD CONSTRAINT "RetailLaybyLine_laybyId_fkey" FOREIGN KEY ("laybyId") REFERENCES "RetailLayby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLaybyLine" ADD CONSTRAINT "RetailLaybyLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLaybyLine" ADD CONSTRAINT "RetailLaybyLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLaybyPayment" ADD CONSTRAINT "RetailLaybyPayment_laybyId_fkey" FOREIGN KEY ("laybyId") REFERENCES "RetailLayby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLaybyPayment" ADD CONSTRAINT "RetailLaybyPayment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "RetailShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLaybyPayment" ADD CONSTRAINT "RetailLaybyPayment_cashMovementId_fkey" FOREIGN KEY ("cashMovementId") REFERENCES "RetailCashMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLaybyPayment" ADD CONSTRAINT "RetailLaybyPayment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
