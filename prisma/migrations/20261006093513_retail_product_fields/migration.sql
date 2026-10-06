-- PRD-03 (20-products 3.3): a product's supplier, whether a case breaks at the
-- till, and its price history; opening stock posts to Opening Balances.

-- New enum values first, outside any use of them in this file.
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'RETAIL_OPENING_STOCK';
ALTER TYPE "RetailAccountRole" ADD VALUE IF NOT EXISTS 'OPENING_BALANCES';

CREATE TYPE "RetailPriceChangeSource" AS ENUM ('ADDED', 'TYPED', 'BULK', 'FOLLOWED', 'IMPORT', 'REMOVED');

-- "Supplier" on the product form: who it is usually bought from.
ALTER TABLE "Product" ADD COLUMN "supplierId" TEXT,
ADD COLUMN "breakAtTill" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

-- One price on one list changing, now or later.
CREATE TABLE "ProductPriceChange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minQuantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "fromPrice" DECIMAL(14,2),
    "toPrice" DECIMAL(14,2),
    "source" "RetailPriceChangeSource" NOT NULL,
    "batchId" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPriceChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductPriceChange_companyId_productId_appliedAt_idx" ON "ProductPriceChange"("companyId", "productId", "appliedAt");
CREATE INDEX "ProductPriceChange_priceListId_productId_appliedAt_idx" ON "ProductPriceChange"("priceListId", "productId", "appliedAt");
CREATE INDEX "ProductPriceChange_appliedAt_effectiveAt_idx" ON "ProductPriceChange"("appliedAt", "effectiveAt");
CREATE INDEX "ProductPriceChange_batchId_idx" ON "ProductPriceChange"("batchId");

ALTER TABLE "ProductPriceChange" ADD CONSTRAINT "ProductPriceChange_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPriceChange" ADD CONSTRAINT "ProductPriceChange_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPriceChange" ADD CONSTRAINT "ProductPriceChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPriceChange" ADD CONSTRAINT "ProductPriceChange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every price on a list today was put there once.
INSERT INTO "ProductPriceChange" ("id", "companyId", "priceListId", "productId", "minQuantity", "fromPrice", "toPrice", "source", "effectiveAt", "appliedAt", "createdAt")
SELECT gen_random_uuid()::text, pp."companyId", pp."priceListId", pp."productId", pp."minQuantity", NULL, pp."unitPrice", 'ADDED', pp."updatedAt", pp."updatedAt", pp."updatedAt"
FROM "ProductPrice" pp;

-- The default list is a flag from now on: a company with none gets its active RETAIL list.
UPDATE "PriceList" SET "isDefault" = true
WHERE "id" IN (
  SELECT DISTINCT ON (pl."companyId") pl."id" FROM "PriceList" pl
  WHERE pl."kind" = 'RETAIL' AND pl."isActive"
    AND NOT EXISTS (SELECT 1 FROM "PriceList" other WHERE other."companyId" = pl."companyId" AND other."isDefault")
  ORDER BY pl."companyId", pl."createdAt"
);

-- "Was" is the price history now.
ALTER TABLE "Product" DROP COLUMN "compareAtPrice";
