-- AlterTable
ALTER TABLE "RetailSaleLine" ADD COLUMN "depositAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RetailZReport" ADD COLUMN "depositTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;
