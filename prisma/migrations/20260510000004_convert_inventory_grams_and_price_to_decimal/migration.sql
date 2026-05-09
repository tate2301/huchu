-- Epic 6a — Float → Decimal for inventory grams and gold price columns.
-- Converts:
--   GoldInventoryEvent.grams         Float  → Decimal(12,4)
--   GoldPrice.priceUsdPerGram        Float  → Decimal(12,4)
--
-- The USING clause preserves existing values by casting through numeric and
-- rounding to 4 decimal places. This is safe for Float data in these columns
-- because sub-0.1mg precision (< 0.0001g) is below instrument resolution.
--
-- Rollback procedure:
--   ALTER TABLE "GoldInventoryEvent" ALTER COLUMN "grams" TYPE DOUBLE PRECISION
--     USING "grams"::double precision;
--   ALTER TABLE "GoldPrice" ALTER COLUMN "priceUsdPerGram" TYPE DOUBLE PRECISION
--     USING "priceUsdPerGram"::double precision;

-- AlterTable: GoldInventoryEvent.grams Float → Decimal(12,4)
ALTER TABLE "GoldInventoryEvent"
  ALTER COLUMN "grams" TYPE DECIMAL(12,4)
  USING ROUND("grams"::numeric, 4);

-- AlterTable: GoldPrice.priceUsdPerGram Float → Decimal(12,4)
ALTER TABLE "GoldPrice"
  ALTER COLUMN "priceUsdPerGram" TYPE DECIMAL(12,4)
  USING ROUND("priceUsdPerGram"::numeric, 4);
