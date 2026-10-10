-- PRD-08: bundles and buy-more deals; sale lines remember the bundle they were sold under.

-- CreateEnum
CREATE TYPE "RetailBundleKind" AS ENUM ('FIXED_SET', 'BUY_MORE');

-- CreateEnum
CREATE TYPE "RetailOnSaleDays" AS ENUM ('EVERY_DAY', 'WEEKENDS', 'CHOOSE');

-- CreateTable
CREATE TABLE "RetailBundle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "RetailBundleKind" NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "categoryId" TEXT,
    "price" DECIMAL(14,2) NOT NULL,
    "buyQuantity" INTEGER,
    "days" "RetailOnSaleDays" NOT NULL DEFAULT 'EVERY_DAY',
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "endsOn" DATE,
    "siteId" TEXT,
    "tillButton" BOOLEAN NOT NULL DEFAULT true,
    "pausedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailBundleItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RetailBundleItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "RetailSaleLine" ADD COLUMN "bundleId" TEXT,
ADD COLUMN "bundleRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RetailBundle_companyId_code_key" ON "RetailBundle"("companyId", "code");

-- CreateIndex
CREATE INDEX "RetailBundle_companyId_barcode_idx" ON "RetailBundle"("companyId", "barcode");

-- CreateIndex
CREATE INDEX "RetailBundle_companyId_archivedAt_stoppedAt_idx" ON "RetailBundle"("companyId", "archivedAt", "stoppedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetailBundleItem_bundleId_productId_key" ON "RetailBundleItem"("bundleId", "productId");

-- CreateIndex
CREATE INDEX "RetailBundleItem_productId_idx" ON "RetailBundleItem"("productId");

-- CreateIndex
CREATE INDEX "RetailSaleLine_companyId_bundleId_idx" ON "RetailSaleLine"("companyId", "bundleId");

-- AddForeignKey
ALTER TABLE "RetailSaleLine" ADD CONSTRAINT "RetailSaleLine_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "RetailBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailBundle" ADD CONSTRAINT "RetailBundle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailBundle" ADD CONSTRAINT "RetailBundle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RetailCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailBundle" ADD CONSTRAINT "RetailBundle_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailBundle" ADD CONSTRAINT "RetailBundle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailBundleItem" ADD CONSTRAINT "RetailBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "RetailBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailBundleItem" ADD CONSTRAINT "RetailBundleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
