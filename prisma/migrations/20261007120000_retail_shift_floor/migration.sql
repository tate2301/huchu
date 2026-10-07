-- FLR-03: a shift's ZiG float and the float its close left; who approved each cash movement; the journals of cash moved.

-- AlterTable
ALTER TABLE "RetailShift" ADD COLUMN "openingFloatZig" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "floatLeft" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "RetailCashMovement" ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedByName" TEXT;

-- AddForeignKey
ALTER TABLE "RetailCashMovement" ADD CONSTRAINT "RetailCashMovement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_CASH_MOVEMENT';
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_PETTY_CASH';

-- AlterEnum
ALTER TYPE "NotificationEntityType" ADD VALUE 'RETAIL_SHIFT';
