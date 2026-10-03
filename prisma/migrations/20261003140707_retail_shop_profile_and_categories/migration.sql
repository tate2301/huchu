-- CreateEnum
CREATE TYPE "RetailBusinessType" AS ENUM ('GENERAL', 'LIQUOR');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "RetailShopProfile" (
    "companyId" TEXT NOT NULL,
    "businessType" "RetailBusinessType" NOT NULL DEFAULT 'GENERAL',
    "ageCheck" BOOLEAN NOT NULL DEFAULT true,
    "licenceHours" BOOLEAN NOT NULL DEFAULT true,
    "weekdayOpensAt" TEXT NOT NULL DEFAULT '08:00',
    "weekdayClosesAt" TEXT NOT NULL DEFAULT '22:00',
    "sundayOpensAt" TEXT NOT NULL DEFAULT '10:00',
    "sundayClosesAt" TEXT NOT NULL DEFAULT '18:00',
    "emptiesAndDeposits" BOOLEAN NOT NULL DEFAULT true,
    "casesAndSingles" BOOLEAN NOT NULL DEFAULT true,
    "licenceNumber" TEXT,
    "licenceExpiresOn" DATE,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailShopProfile_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "RetailCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "ageRestricted" BOOLEAN NOT NULL DEFAULT false,
    "returnable" BOOLEAN NOT NULL DEFAULT false,
    "depositAmount" DECIMAL(14,2),
    "targetMarginPercent" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailCategory_companyId_archivedAt_sortOrder_idx" ON "RetailCategory"("companyId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RetailCategory_companyId_name_key" ON "RetailCategory"("companyId", "name");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- AddForeignKey
ALTER TABLE "RetailShopProfile" ADD CONSTRAINT "RetailShopProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailShopProfile" ADD CONSTRAINT "RetailShopProfile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailCategory" ADD CONSTRAINT "RetailCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RetailCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Licence hours are "HH:MM" on a 24-hour clock. The till compares them as
-- text, so anything else would silently stop alcohol selling at the wrong
-- time; the database refuses it instead of trusting the form.
ALTER TABLE "RetailShopProfile" ADD CONSTRAINT "RetailShopProfile_hours_format" CHECK (
    "weekdayOpensAt"  ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
    "weekdayClosesAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
    "sundayOpensAt"   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
    "sundayClosesAt"  ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);

-- A category's VAT and margin are percentages; a deposit is money owed back.
ALTER TABLE "RetailCategory" ADD CONSTRAINT "RetailCategory_vatRate_range" CHECK ("vatRate" >= 0 AND "vatRate" <= 100);
ALTER TABLE "RetailCategory" ADD CONSTRAINT "RetailCategory_targetMargin_range" CHECK ("targetMarginPercent" IS NULL OR ("targetMarginPercent" >= 0 AND "targetMarginPercent" < 100));
ALTER TABLE "RetailCategory" ADD CONSTRAINT "RetailCategory_deposit_positive" CHECK ("depositAmount" IS NULL OR "depositAmount" >= 0);
