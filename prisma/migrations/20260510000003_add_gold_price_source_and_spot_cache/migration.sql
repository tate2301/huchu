-- Epic 4 prereq (§15.1 G-3): Add GoldPriceSource enum, GoldSpotPriceCache table,
-- and nullable goldPriceSource column on every snapshot model.
--
-- Rollback procedure:
--   ALTER TABLE "GoldPour"             DROP COLUMN "goldPriceSource";
--   ALTER TABLE "GoldDispatch"         DROP COLUMN "goldPriceSource";
--   ALTER TABLE "BuyerReceipt"         DROP COLUMN "goldPriceSource";
--   ALTER TABLE "BuyerReceiptBatch"    DROP COLUMN "goldPriceSource";
--   ALTER TABLE "GoldShiftAllocation"  DROP COLUMN "goldPriceSource";
--   ALTER TABLE "GoldInventoryEvent"   DROP COLUMN "goldPriceSource";
--   DROP TABLE "GoldSpotPriceCache";
--   DROP TYPE "GoldPriceSource";

-- CreateEnum
CREATE TYPE "GoldPriceSource" AS ENUM ('CONFIGURED', 'LIVE', 'FALLBACK');

-- CreateTable
CREATE TABLE "GoldSpotPriceCache" (
    "id"              TEXT NOT NULL,
    "fetchedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source"          TEXT NOT NULL,
    "priceUsdPerGram" DOUBLE PRECISION NOT NULL,
    "rawResponse"     TEXT,

    CONSTRAINT "GoldSpotPriceCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoldSpotPriceCache_fetchedAt_idx" ON "GoldSpotPriceCache"("fetchedAt");

-- AlterTable: GoldPour
ALTER TABLE "GoldPour" ADD COLUMN "goldPriceSource" "GoldPriceSource";

-- AlterTable: GoldDispatch
ALTER TABLE "GoldDispatch" ADD COLUMN "goldPriceSource" "GoldPriceSource";

-- AlterTable: BuyerReceipt
ALTER TABLE "BuyerReceipt" ADD COLUMN "goldPriceSource" "GoldPriceSource";

-- AlterTable: BuyerReceiptBatch
ALTER TABLE "BuyerReceiptBatch" ADD COLUMN "goldPriceSource" "GoldPriceSource";

-- AlterTable: GoldShiftAllocation
ALTER TABLE "GoldShiftAllocation" ADD COLUMN "goldPriceSource" "GoldPriceSource";

-- AlterTable: GoldInventoryEvent
ALTER TABLE "GoldInventoryEvent" ADD COLUMN "goldPriceSource" "GoldPriceSource";
