-- PRD-05: price lists carry their rules (who, when, where, what they follow) and a state;
-- the till's engine records the list each sale line was priced from.

-- CreateEnum
CREATE TYPE "PriceListState" AS ENUM ('DRAFT', 'ON', 'PAUSED');
CREATE TYPE "PriceListAudience" AS ENUM ('EVERYONE', 'ACCOUNT_CUSTOMERS', 'LOYALTY_MEMBERS', 'STAFF');
CREATE TYPE "PriceListWhen" AS ENUM ('ALWAYS', 'DAYS_AND_HOURS', 'BETWEEN_DATES');
CREATE TYPE "PriceListBasis" AS ENUM ('OWN', 'LIST', 'COST');

-- AlterTable
ALTER TABLE "PriceList"
  ADD COLUMN "state" "PriceListState" NOT NULL DEFAULT 'ON',
  ADD COLUMN "audience" "PriceListAudience" NOT NULL DEFAULT 'EVERYONE',
  ADD COLUMN "whenKind" "PriceListWhen" NOT NULL DEFAULT 'ALWAYS',
  ADD COLUMN "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "fromTime" TEXT,
  ADD COLUMN "toTime" TEXT,
  ADD COLUMN "startsOn" DATE,
  ADD COLUMN "endsOn" DATE,
  ADD COLUMN "siteId" TEXT,
  ADD COLUMN "minQuantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "basis" "PriceListBasis" NOT NULL DEFAULT 'OWN',
  ADD COLUMN "basisListId" TEXT,
  ADD COLUMN "adjustPercent" DECIMAL(6,2),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "updatedById" TEXT;

-- A list that was off is paused; one that was on stays on.
UPDATE "PriceList" SET "state" = CASE WHEN "isActive" THEN 'ON'::"PriceListState" ELSE 'PAUSED'::"PriceListState" END;

DROP INDEX IF EXISTS "PriceList_companyId_isActive_kind_idx";
ALTER TABLE "PriceList" DROP COLUMN "isActive";
CREATE INDEX "PriceList_companyId_state_kind_idx" ON "PriceList"("companyId", "state", "kind");

-- AlterTable
ALTER TABLE "ProductPrice" ADD COLUMN "followsBase" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RetailSaleLine" ADD COLUMN "priceListId" TEXT;

-- CreateTable
CREATE TABLE "PriceListCategory" (
    "priceListId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "PriceListCategory_pkey" PRIMARY KEY ("priceListId","categoryId")
);
CREATE INDEX "PriceListCategory_categoryId_idx" ON "PriceListCategory"("categoryId");

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_basisListId_fkey" FOREIGN KEY ("basisListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceListCategory" ADD CONSTRAINT "PriceListCategory_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceListCategory" ADD CONSTRAINT "PriceListCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RetailCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailSaleLine" ADD CONSTRAINT "RetailSaleLine_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The shop's shelf list is the default "Retail"; no other list of that company stays the default.
UPDATE "PriceList" SET "isDefault" = false
WHERE "companyId" IN (SELECT "companyId" FROM "PriceList" WHERE "kind" = 'RETAIL' AND "name" = 'Shelf prices');
UPDATE "PriceList" SET "name" = 'Retail', "isDefault" = true WHERE "kind" = 'RETAIL' AND "name" = 'Shelf prices';

-- Any other company holding two defaults keeps its oldest.
UPDATE "PriceList" p SET "isDefault" = false
WHERE p."isDefault" AND EXISTS (
  SELECT 1 FROM "PriceList" o
  WHERE o."companyId" = p."companyId" AND o."isDefault" AND (o."createdAt", o."id") < (p."createdAt", p."id")
);

CREATE UNIQUE INDEX "PriceList_one_default" ON "PriceList"("companyId") WHERE "isDefault" AND "archivedAt" IS NULL;
