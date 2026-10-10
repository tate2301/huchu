-- FLR-05: a manager signs off a drawer that closed short, over or without a count.

-- CreateEnum
CREATE TYPE "RetailShiftSignOff" AS ENUM ('ACCEPT', 'RECOVER', 'LOOK_INTO');

-- AlterTable
ALTER TABLE "RetailShift" ADD COLUMN "signOffOutcome" "RetailShiftSignOff",
ADD COLUMN "signedOffAt" TIMESTAMP(3),
ADD COLUMN "signedOffById" TEXT,
ADD COLUMN "signOffNote" TEXT,
ADD COLUMN "recoverAmount" DECIMAL(14,2);

-- CreateIndex
CREATE INDEX "RetailShift_companyId_status_signOffOutcome_idx" ON "RetailShift"("companyId", "status", "signOffOutcome");

-- AddForeignKey
ALTER TABLE "RetailShift" ADD CONSTRAINT "RetailShift_signedOffById_fkey" FOREIGN KEY ("signedOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_SHIFT_RECOVERY';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RETAIL_SHIFT_SIGNED_OFF';

-- Backfill: history from before sign-off existed counts as accepted, except the last seven days' differences.
UPDATE "RetailShift" SET "signOffOutcome" = 'ACCEPT', "signedOffAt" = "closedAt"
WHERE "status" = 'CLOSED'
  AND ("variance" <> 0 OR "countedCash" IS NULL)
  AND "closedAt" < now() - interval '7 days';
