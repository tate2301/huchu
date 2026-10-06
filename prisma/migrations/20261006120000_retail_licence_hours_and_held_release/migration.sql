-- The till on PR #193's foundation (docs/design/till/reconcile-pr-193.md, 3.1).
--
-- Licence hours move off the shop profile into one row per site and weekday:
-- a licence is per premises, and Saturday often differs. The profile keeps its
-- licenceHours switch, licence number and expiry; its four "HH:MM" columns go.
-- No row is copied across: a weekday with no row sells all day.
--
-- A product's 18+ flag becomes its own answer over its category's: null
-- follows the category. Every false becomes null, so what the till checks
-- today (product or category) is what it checks after.
--
-- A held sale discarded at the till says who let it go, and when. A pairing
-- code points at the device it paired.

-- DropConstraint
ALTER TABLE "RetailShopProfile" DROP CONSTRAINT "RetailShopProfile_hours_format";

-- AlterTable
ALTER TABLE "RetailShopProfile" DROP COLUMN "sundayClosesAt",
DROP COLUMN "sundayOpensAt",
DROP COLUMN "weekdayClosesAt",
DROP COLUMN "weekdayOpensAt";

-- CreateTable
CREATE TABLE "RetailLicenceHours" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "alcoholFrom" INTEGER NOT NULL,
    "alcoholUntil" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailLicenceHours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RetailLicenceHours_weekday_range" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "RetailLicenceHours_minutes_range" CHECK (
        "alcoholFrom" BETWEEN 0 AND 1439 AND "alcoholUntil" BETWEEN 0 AND 1439
    )
);

-- CreateIndex
CREATE INDEX "RetailLicenceHours_companyId_idx" ON "RetailLicenceHours"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailLicenceHours_siteId_weekday_key" ON "RetailLicenceHours"("siteId", "weekday");

-- AddForeignKey
ALTER TABLE "RetailLicenceHours" ADD CONSTRAINT "RetailLicenceHours_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailLicenceHours" ADD CONSTRAINT "RetailLicenceHours_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "ageRestricted" DROP NOT NULL,
ALTER COLUMN "ageRestricted" DROP DEFAULT;

UPDATE "Product" SET "ageRestricted" = NULL WHERE "ageRestricted" = false;

-- AlterTable
ALTER TABLE "RetailHeldCart" ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "releasedById" TEXT;

-- AddForeignKey
ALTER TABLE "RetailHeldCart" ADD CONSTRAINT "RetailHeldCart_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A code whose device is gone forgets it before the key holds it to one.
UPDATE "RetailPairingCode" AS code SET "deviceId" = NULL
WHERE code."deviceId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "RetailDevice" device WHERE device."id" = code."deviceId");

-- AddForeignKey
ALTER TABLE "RetailPairingCode" ADD CONSTRAINT "RetailPairingCode_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RetailDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
