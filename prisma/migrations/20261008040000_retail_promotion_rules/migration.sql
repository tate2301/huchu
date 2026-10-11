-- PRD-09: promotion rules. A promotion says what it applies to, when and for whom,
-- runs by the clock, and every sale line it discounted remembers it.

-- AlterEnum
ALTER TYPE "RetailPromotionType" RENAME VALUE 'BUY_X_GET_Y' TO 'BUY_X_PAY';
ALTER TYPE "RetailPromotionType" RENAME VALUE 'BUNDLE' TO 'FIXED_PRICE';

-- CreateEnum
CREATE TYPE "RetailPromotionScope" AS ENUM ('EVERYTHING', 'CATEGORIES', 'PRODUCTS');

-- CreateEnum
CREATE TYPE "RetailPromotionAudience" AS ENUM ('EVERYONE', 'LOYALTY_MEMBERS', 'STAFF');

-- AlterTable
ALTER TABLE "RetailPromotion" ADD COLUMN "buyQuantity" INTEGER,
ADD COLUMN "scope" "RetailPromotionScope" NOT NULL DEFAULT 'EVERYTHING',
ADD COLUMN "minBasket" DECIMAL(14,2),
ADD COLUMN "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "fromTime" TEXT,
ADD COLUMN "toTime" TEXT,
ADD COLUMN "audience" "RetailPromotionAudience" NOT NULL DEFAULT 'EVERYONE',
ADD COLUMN "stacks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "siteId" TEXT,
ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "endedAt" TIMESTAMP(3),
ADD COLUMN "createdById" TEXT;

-- CreateTable
CREATE TABLE "RetailPromotionProduct" (
    "promotionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "RetailPromotionProduct_pkey" PRIMARY KEY ("promotionId","productId")
);

-- CreateTable
CREATE TABLE "RetailPromotionCategory" (
    "promotionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "RetailPromotionCategory_pkey" PRIMARY KEY ("promotionId","categoryId")
);

-- AlterTable
ALTER TABLE "RetailSaleLine" ADD COLUMN "promotionId" TEXT,
ADD COLUMN "promotionDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Backfill
UPDATE "RetailPromotion" SET "startsAt" = "createdAt" WHERE "startsAt" IS NULL;
UPDATE "RetailPromotion" SET "endedAt" = "updatedAt" WHERE "status" = 'INACTIVE';
UPDATE "RetailSaleLine" l
SET "promotionId" = p."id", "promotionDiscount" = l."discountAmount"
FROM "RetailSale" s, "RetailPromotion" p
WHERE l."saleId" = s."id" AND s."promotionCode" IS NOT NULL
  AND p."companyId" = s."companyId" AND p."promoCode" = s."promotionCode";
-- End backfill

-- AlterTable
ALTER TABLE "RetailPromotion" ALTER COLUMN "startsAt" SET NOT NULL;

-- DropIndex
DROP INDEX "RetailPromotion_companyId_status_idx";

-- AlterTable
ALTER TABLE "RetailPromotion" DROP COLUMN "status",
DROP COLUMN "notes";

-- AlterTable
ALTER TABLE "RetailSale" DROP COLUMN "promotionCode";

-- DropEnum
DROP TYPE "RetailPromotionStatus";

-- CreateIndex
CREATE INDEX "RetailPromotion_companyId_startsAt_idx" ON "RetailPromotion"("companyId", "startsAt");

-- CreateIndex
CREATE INDEX "RetailPromotionProduct_productId_idx" ON "RetailPromotionProduct"("productId");

-- CreateIndex
CREATE INDEX "RetailPromotionCategory_categoryId_idx" ON "RetailPromotionCategory"("categoryId");

-- CreateIndex
CREATE INDEX "RetailSaleLine_companyId_promotionId_idx" ON "RetailSaleLine"("companyId", "promotionId");

-- AddForeignKey
ALTER TABLE "RetailPromotion" ADD CONSTRAINT "RetailPromotion_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPromotion" ADD CONSTRAINT "RetailPromotion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPromotionProduct" ADD CONSTRAINT "RetailPromotionProduct_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "RetailPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPromotionProduct" ADD CONSTRAINT "RetailPromotionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPromotionCategory" ADD CONSTRAINT "RetailPromotionCategory_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "RetailPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPromotionCategory" ADD CONSTRAINT "RetailPromotionCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RetailCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSaleLine" ADD CONSTRAINT "RetailSaleLine_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "RetailPromotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
