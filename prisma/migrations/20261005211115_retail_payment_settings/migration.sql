-- SET-05: Payments and the ZiG rate.

-- The tenders: MOBILE_MONEY becomes ECOCASH; INNBUCKS and ON_ACCOUNT join.
-- Postgres cannot drop an enum value, so the type is rebuilt.
ALTER TYPE "RetailTenderType" RENAME TO "RetailTenderType_old";
CREATE TYPE "RetailTenderType" AS ENUM ('CASH', 'CARD', 'ECOCASH', 'INNBUCKS', 'TRANSFER', 'ON_ACCOUNT', 'VOUCHER');
ALTER TABLE "RetailSalePayment"
  ALTER COLUMN "tenderType" TYPE "RetailTenderType"
  USING (CASE "tenderType"::text WHEN 'MOBILE_MONEY' THEN 'ECOCASH' ELSE "tenderType"::text END)::"RetailTenderType";
DROP TYPE "RetailTenderType_old";

UPDATE "TenderAccountMapping" SET "tenderType" = 'ECOCASH' WHERE "tenderType" = 'MOBILE_MONEY';

-- The same word in the JSON copies a sale and a Z-report keep of their tenders.
UPDATE "RetailSale"
SET "tenderSummary" = replace("tenderSummary"::text, '"MOBILE_MONEY"', '"ECOCASH"')::jsonb
WHERE "tenderSummary"::text LIKE '%"MOBILE_MONEY"%';
UPDATE "RetailZReport"
SET "tenderBreakdown" = replace("tenderBreakdown"::text, '"MOBILE_MONEY"', '"ECOCASH"')::jsonb
WHERE "tenderBreakdown"::text LIKE '%"MOBILE_MONEY"%';

-- How the ZiG rate is kept, and where a rate came from.
CREATE TYPE "RetailRateSource" AS ENUM ('MANUAL', 'RBZ_DAILY');
CREATE TYPE "CurrencyRateSource" AS ENUM ('MANUAL', 'RBZ');

ALTER TABLE "CurrencyRate"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "source" "CurrencyRateSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "CurrencyRate"
  ADD CONSTRAINT "CurrencyRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Payments: the tenders a shop takes, the ZiG rule and its EcoCash merchant.
CREATE TABLE "RetailPaymentSettings" (
    "companyId" TEXT NOT NULL,
    "takeCashUsd" BOOLEAN NOT NULL DEFAULT true,
    "takeCashZig" BOOLEAN NOT NULL DEFAULT true,
    "takeCard" BOOLEAN NOT NULL DEFAULT false,
    "takeEcocash" BOOLEAN NOT NULL DEFAULT true,
    "takeInnbucks" BOOLEAN NOT NULL DEFAULT false,
    "takeBankTransfer" BOOLEAN NOT NULL DEFAULT false,
    "takeOnAccount" BOOLEAN NOT NULL DEFAULT false,
    "takeVouchers" BOOLEAN NOT NULL DEFAULT false,
    "zigRateSource" "RetailRateSource" NOT NULL DEFAULT 'MANUAL',
    "zigChangeRounding" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "ecocashMerchantCode" TEXT,
    "ecocashDisplayName" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailPaymentSettings_pkey" PRIMARY KEY ("companyId")
);

ALTER TABLE "RetailPaymentSettings" ADD CONSTRAINT "RetailPaymentSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailPaymentSettings" ADD CONSTRAINT "RetailPaymentSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
