-- SET-04: a shift and a sale carry their till and the device they were rung on.

-- AlterTable
ALTER TABLE "RetailSale" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "printedAt" TIMESTAMP(3),
ADD COLUMN     "registerId" TEXT,
ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable: nullable first, backfilled below, then required.
ALTER TABLE "RetailShift" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "registerId" TEXT;

-- A shift whose till code has no till row gets one: inactive, at the shift's site.
INSERT INTO "RetailRegister" ("id", "companyId", "code", "name", "siteId", "isActive", "createdAt", "updatedAt")
SELECT DISTINCT ON (sh."companyId", sh."registerCode")
  gen_random_uuid()::text, sh."companyId", sh."registerCode", sh."registerName", sh."siteId", false, now(), now()
FROM "RetailShift" sh
WHERE NOT EXISTS (
  SELECT 1 FROM "RetailRegister" r WHERE r."companyId" = sh."companyId" AND r."code" = sh."registerCode"
)
ORDER BY sh."companyId", sh."registerCode", sh."openedAt" DESC;

UPDATE "RetailShift" sh
SET "registerId" = r."id"
FROM "RetailRegister" r
WHERE r."companyId" = sh."companyId" AND r."code" = sh."registerCode";

ALTER TABLE "RetailShift" ALTER COLUMN "registerId" SET NOT NULL;

-- A sale rung in a shift is on that shift's till.
UPDATE "RetailSale" s
SET "registerId" = sh."registerId", "deviceId" = sh."deviceId"
FROM "RetailShift" sh
WHERE sh."id" = s."shiftId";

-- CreateIndex
CREATE INDEX "RetailSale_companyId_registerId_postedAt_idx" ON "RetailSale"("companyId", "registerId", "postedAt");

-- CreateIndex
CREATE INDEX "RetailShift_registerId_status_idx" ON "RetailShift"("registerId", "status");

-- AddForeignKey
ALTER TABLE "RetailShift" ADD CONSTRAINT "RetailShift_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "RetailRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailShift" ADD CONSTRAINT "RetailShift_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RetailDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "RetailRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RetailDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
