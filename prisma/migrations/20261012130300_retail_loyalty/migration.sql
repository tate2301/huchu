-- CUS-01: loyalty settings and the points ledger (60-customers §3.2, W-46, W-48).
-- The ledger replaces points worked out from sales matched by name and the
-- "LOYALTY_REDEEM:<n>" notes: each posted sale for a customer of US$1 or more
-- earned a point a whole dollar, and each redemption note spent its points at
-- US$0.01 each. The notes lose the marker. Ledger rows are never edited or
-- deleted afterwards.

-- CreateEnum
CREATE TYPE "RetailPointsExpiry" AS ENUM ('NEVER', 'AFTER_12_MONTHS');

-- CreateEnum
CREATE TYPE "RetailPointsKind" AS ENUM ('EARNED', 'SPENT', 'ADJUSTED', 'BIRTHDAY', 'EXPIRED', 'REVERSED');

-- CreateEnum
CREATE TYPE "RetailPointsReason" AS ENUM ('MISSED_AT_TILL', 'COMPLAINT', 'BIRTHDAY', 'CORRECTION');

-- CreateTable
CREATE TABLE "RetailLoyaltySettings" (
    "companyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "earnPerDollar" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "pointValue" DECIMAL(8,4) NOT NULL DEFAULT 0.01,
    "spendFrom" INTEGER NOT NULL DEFAULT 500,
    "expiry" "RetailPointsExpiry" NOT NULL DEFAULT 'AFTER_12_MONTHS',
    "tiers" JSONB NOT NULL DEFAULT '[{"name":"Bronze","from":"0.00"},{"name":"Silver","from":"500.00"},{"name":"Gold","from":"1500.00"}]',
    "topTierEarnPerDollar" DECIMAL(6,2) NOT NULL DEFAULT 1.5,
    "earnOnPromotions" BOOLEAN NOT NULL DEFAULT true,
    "birthdayBonus" BOOLEAN NOT NULL DEFAULT true,
    "birthdayPoints" INTEGER NOT NULL DEFAULT 200,
    "pointsPayForAlcohol" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "RetailLoyaltySettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "RetailPointsEntry" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "RetailPointsKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saleId" TEXT,
    "reason" "RetailPointsReason",
    "note" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "mergedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "RetailPointsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailPointsEntry_companyId_customerId_createdAt_idx" ON "RetailPointsEntry"("companyId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailPointsEntry_companyId_kind_createdAt_idx" ON "RetailPointsEntry"("companyId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "RetailPointsEntry_saleId_idx" ON "RetailPointsEntry"("saleId");

-- AddForeignKey
ALTER TABLE "RetailLoyaltySettings" ADD CONSTRAINT "RetailLoyaltySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLoyaltySettings" ADD CONSTRAINT "RetailLoyaltySettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPointsEntry" ADD CONSTRAINT "RetailPointsEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPointsEntry" ADD CONSTRAINT "RetailPointsEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPointsEntry" ADD CONSTRAINT "RetailPointsEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPointsEntry" ADD CONSTRAINT "RetailPointsEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The ledger from the sales, in the order they were rung.
INSERT INTO "RetailPointsEntry" ("id", "companyId", "customerId", "kind", "points", "value", "saleId", "actorName", "createdAt")
SELECT gen_random_uuid()::text, moved."companyId", moved."customerId", moved."kind"::"RetailPointsKind", moved."points", round(abs(moved."points") * 0.01, 2), moved."saleId", moved."actorName", moved."at"
FROM (
  SELECT s."companyId", s."customerId", 'EARNED' AS "kind", floor(s."baseAmount")::int AS "points", s."id" AS "saleId", s."cashierName" AS "actorName", COALESCE(s."postedAt", s."createdAt") AS "at", 0 AS "step"
  FROM "RetailSale" s
  WHERE s."saleType" = 'SALE' AND s."status" = 'POSTED' AND s."customerId" IS NOT NULL AND s."totalAmount" >= 1 AND floor(s."baseAmount") >= 1
  UNION ALL
  SELECT s."companyId", s."customerId", 'SPENT', -(substring(s."notes" FROM 'LOYALTY_REDEEM:([0-9]+)'))::int, s."id", s."cashierName", COALESCE(s."postedAt", s."createdAt"), 1
  FROM "RetailSale" s
  WHERE s."saleType" = 'SALE' AND s."status" = 'POSTED' AND s."customerId" IS NOT NULL AND s."notes" ~ 'LOYALTY_REDEEM:[0-9]+'
) AS moved
WHERE moved."points" <> 0
ORDER BY moved."at", moved."saleId", moved."step";

-- No note keeps the marker (nor the " | " that joined it).
UPDATE "RetailSale"
SET "notes" = NULLIF(regexp_replace(regexp_replace("notes", '( \| )?LOYALTY_REDEEM:[0-9]+', '', 'g'), '^ \| ', ''), '')
WHERE "notes" LIKE '%LOYALTY_REDEEM:%';
