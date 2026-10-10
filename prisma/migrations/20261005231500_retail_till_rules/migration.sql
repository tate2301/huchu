-- SET-06: Till rules. One typed row per company replaces the RETAIL_POS_POLICY
-- and RETAIL_TENDER_POLICY JSON rows kept in FiscalisationProviderConfig.

CREATE TYPE "RetailVoidPinRule" AS ENUM ('ALWAYS', 'AFTER_5_MINUTES', 'NEVER');

CREATE TABLE "RetailTillRules" (
    "companyId" TEXT NOT NULL,
    "refundPinOver" DECIMAL(14,2) NOT NULL DEFAULT 20,
    "voidPin" "RetailVoidPinRule" NOT NULL DEFAULT 'ALWAYS',
    "refundReasons" TEXT[] DEFAULT ARRAY['Damaged', 'Wrong item', 'Changed mind', 'Overcharged']::TEXT[],
    "voidReasons" TEXT[] DEFAULT ARRAY['Rang up wrong', 'Customer left', 'Test sale']::TEXT[],
    "splitTender" BOOLEAN NOT NULL DEFAULT true,
    "referenceRequired" BOOLEAN NOT NULL DEFAULT true,
    "maxCashierDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "drawerOpenWithoutSale" BOOLEAN NOT NULL DEFAULT false,
    "cashDropPromptOver" DECIMAL(14,2) NOT NULL DEFAULT 500,
    "offlineHours" INTEGER NOT NULL DEFAULT 24,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailTillRules_pkey" PRIMARY KEY ("companyId")
);

ALTER TABLE "RetailTillRules" ADD CONSTRAINT "RetailTillRules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RetailTillRules" ADD CONSTRAINT "RetailTillRules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The reserved provider keys go: the till rules are typed now.
DELETE FROM "FiscalisationProviderConfig" WHERE "providerKey" IN ('RETAIL_POS_POLICY', 'RETAIL_TENDER_POLICY');
