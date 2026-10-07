-- FLR-04: a shift's close keeps its count by note, who closed it, what happened and what went to the safe.

-- AlterTable
ALTER TABLE "RetailShift" ADD COLUMN "closedById" TEXT,
ADD COLUMN "countedUsd" DECIMAL(14,2),
ADD COLUMN "countedZig" DECIMAL(14,2),
ADD COLUMN "countRate" DECIMAL(12,4),
ADD COLUMN "countLines" JSONB,
ADD COLUMN "closeNote" TEXT,
ADD COLUMN "toSafe" DECIMAL(14,2);

-- AddForeignKey
ALTER TABLE "RetailShift" ADD CONSTRAINT "RetailShift_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_SHIFT_CLOSE';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RETAIL_SHIFT_DIFFERENCE';

-- Backfill: a shift closed before counts by note was counted in US$ as one figure.
UPDATE "RetailShift" SET "countedUsd" = "countedCash", "countRate" = 1
WHERE "status" = 'CLOSED' AND "countedCash" IS NOT NULL;
UPDATE "RetailShift" SET "closeNote" = "notes"
WHERE "status" = 'CLOSED' AND "notes" IS NOT NULL;
