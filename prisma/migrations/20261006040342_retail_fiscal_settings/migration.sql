-- SET-08: Setup › Fiscal device. How the shop's fiscal day closes and whether the
-- tills stop while ZIMRA cannot be reached, one typed row per company; the device
-- row keeps ZIMRA's serial, who registered it and when, and the last FDMS call
-- that answered and the last that did not ("Stop selling" reads the latter).

-- CreateEnum
CREATE TYPE "RetailFiscalDayClose" AS ENUM ('WITH_LAST_SHIFT', 'BY_HAND');

-- CreateEnum
CREATE TYPE "RetailFiscalUnreachable" AS ENUM ('KEEP_SELLING', 'STOP_SELLING');

-- CreateTable
CREATE TABLE "RetailFiscalSettings" (
    "companyId" TEXT NOT NULL,
    "dayClose" "RetailFiscalDayClose" NOT NULL DEFAULT 'WITH_LAST_SHIFT',
    "whenUnreachable" "RetailFiscalUnreachable" NOT NULL DEFAULT 'KEEP_SELLING',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailFiscalSettings_pkey" PRIMARY KEY ("companyId")
);

-- AddForeignKey
ALTER TABLE "RetailFiscalSettings" ADD CONSTRAINT "RetailFiscalSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailFiscalSettings" ADD CONSTRAINT "RetailFiscalSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FiscalisationProviderConfig"
    ADD COLUMN "serialNumber" TEXT,
    ADD COLUMN "registeredAt" TIMESTAMP(3),
    ADD COLUMN "registeredById" TEXT,
    ADD COLUMN "lastOkAt" TIMESTAMP(3),
    ADD COLUMN "lastFailedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "FiscalisationProviderConfig" ADD CONSTRAINT "FiscalisationProviderConfig_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A device that already holds ZIMRA's certificate was registered; when is not
-- known, so its last change stands in for it.
UPDATE "FiscalisationProviderConfig" SET "registeredAt" = "updatedAt" WHERE "certificateRef" IS NOT NULL AND "registeredAt" IS NULL;
