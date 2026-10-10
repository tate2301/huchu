-- FLR-07: a site's trading day closes once, its figures frozen, its Z-reports taken and its cash banked.

-- AlterEnum
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_DAY_BANKED';

-- CreateTable
CREATE TABLE "RetailDayClose" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "takings" DECIMAL(14,2) NOT NULL,
    "refunds" DECIMAL(14,2) NOT NULL,
    "cashDifference" DECIMAL(14,2) NOT NULL,
    "cashUsd" DECIMAL(14,2) NOT NULL,
    "cashZig" DECIMAL(14,2) NOT NULL,
    "tenders" JSONB NOT NULL,
    "banked" DECIMAL(14,2) NOT NULL,
    "bankAccountId" TEXT,
    "slipUrl" TEXT,
    "fiscalDayNo" INTEGER,
    "zReportIds" TEXT[],
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT NOT NULL,
    "closedByName" TEXT NOT NULL,

    CONSTRAINT "RetailDayClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailDayClose_companyId_businessDate_idx" ON "RetailDayClose"("companyId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "RetailDayClose_companyId_siteId_businessDate_key" ON "RetailDayClose"("companyId", "siteId", "businessDate");

-- AddForeignKey
ALTER TABLE "RetailDayClose" ADD CONSTRAINT "RetailDayClose_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDayClose" ADD CONSTRAINT "RetailDayClose_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDayClose" ADD CONSTRAINT "RetailDayClose_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDayClose" ADD CONSTRAINT "RetailDayClose_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
