-- STK-05: stock counts (W-22). A count is counted on a phone, sent for review and approved; nothing on hand changes until then.

-- CreateEnum
CREATE TYPE "RetailStockCountScope" AS ENUM ('EVERYTHING', 'CATEGORIES', 'PRODUCTS', 'PLACE');

-- CreateEnum
CREATE TYPE "RetailStockCountStatus" AS ENUM ('COUNTING', 'TO_APPROVE', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RetailStockCountWhy" AS ENUM ('BROKEN', 'NOT_KNOWN', 'FOUND');

-- CreateTable
CREATE TABLE "RetailStockCount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "countNo" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RetailStockCountScope" NOT NULL,
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "placeId" TEXT,
    "blind" BOOLEAN NOT NULL DEFAULT true,
    "keepSelling" BOOLEAN NOT NULL DEFAULT true,
    "status" "RetailStockCountStatus" NOT NULL DEFAULT 'COUNTING',
    "counterId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "firstCountedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "differenceValue" DECIMAL(14,2),
    "shortValue" DECIMAL(14,2),
    "overValue" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailStockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailStockCountLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "productId" TEXT,
    "expected" DECIMAL(12,4) NOT NULL,
    "counted" DECIMAL(12,4),
    "countedAt" TIMESTAMP(3),
    "countedById" TEXT,
    "expectedAtCount" DECIMAL(12,4),
    "difference" DECIMAL(12,4),
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "why" "RetailStockCountWhy",
    "recount" BOOLEAN NOT NULL DEFAULT false,
    "sortKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailStockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailStockCount_companyId_status_createdAt_idx" ON "RetailStockCount"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RetailStockCount_companyId_siteId_name_idx" ON "RetailStockCount"("companyId", "siteId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RetailStockCount_companyId_countNo_key" ON "RetailStockCount"("companyId", "countNo");

-- CreateIndex
CREATE INDEX "RetailStockCountLine_companyId_inventoryItemId_idx" ON "RetailStockCountLine"("companyId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailStockCountLine_countId_inventoryItemId_key" ON "RetailStockCountLine"("countId", "inventoryItemId");

-- AddForeignKey
ALTER TABLE "RetailStockCount" ADD CONSTRAINT "RetailStockCount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockCount" ADD CONSTRAINT "RetailStockCount_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockCount" ADD CONSTRAINT "RetailStockCount_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockCount" ADD CONSTRAINT "RetailStockCount_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockCount" ADD CONSTRAINT "RetailStockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockCount" ADD CONSTRAINT "RetailStockCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockCount" ADD CONSTRAINT "RetailStockCount_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockCountLine" ADD CONSTRAINT "RetailStockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "RetailStockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockCountLine" ADD CONSTRAINT "RetailStockCountLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockCountLine" ADD CONSTRAINT "RetailStockCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockCountLine" ADD CONSTRAINT "RetailStockCountLine_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

