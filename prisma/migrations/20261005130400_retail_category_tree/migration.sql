-- PRD-02: categories nest one level ("Inside"), tell Exempt from Zero-rated,
-- and remember which shop type's seed made them (the list's "Shop type" filter).

-- AlterTable
ALTER TABLE "RetailCategory" ADD COLUMN "parentId" TEXT;
ALTER TABLE "RetailCategory" ADD COLUMN "vatExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RetailCategory" ADD COLUMN "seededFor" "RetailBusinessType";

-- CreateIndex
CREATE INDEX "RetailCategory_parentId_idx" ON "RetailCategory"("parentId");

-- AddForeignKey
ALTER TABLE "RetailCategory" ADD CONSTRAINT "RetailCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RetailCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the seed names of each shop type, in companies of that type.
UPDATE "RetailCategory" AS c
SET "seededFor" = 'LIQUOR'
FROM "RetailShopProfile" AS p
WHERE p."companyId" = c."companyId"
  AND p."businessType" = 'LIQUOR'
  AND c."name" IN ('Beer', 'Spirits', 'Wine', 'Ciders and coolers', 'Soft drinks', 'Snacks', 'Ice and mixers');

UPDATE "RetailCategory" AS c
SET "seededFor" = 'GENERAL'
FROM "RetailShopProfile" AS p
WHERE p."companyId" = c."companyId"
  AND p."businessType" = 'GENERAL'
  AND c."name" IN ('Groceries', 'Drinks', 'Snacks', 'Household', 'Personal care', 'Other');
