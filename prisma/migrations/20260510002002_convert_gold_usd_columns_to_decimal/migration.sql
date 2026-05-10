-- Epic 6 Step 3 — Float → Decimal for remaining Gold USD / price columns.
--
-- Columns converted:
--   GoldSpotPriceCache.priceUsdPerGram          Float  → Decimal(12,4)
--   GoldPour.goldPriceUsdPerGram                Float  → Decimal(12,4)
--   GoldPour.valueUsd                           Float  → Decimal(14,2)
--   GoldPurchase.paidAmount                     Float  → Decimal(14,2)
--   GoldDispatch.goldPriceUsdPerGram            Float  → Decimal(12,4)
--   GoldDispatch.valueUsd                       Float  → Decimal(14,2)
--   BuyerReceipt.paidAmount                     Float  → Decimal(14,2)
--   BuyerReceipt.goldPriceUsdPerGram            Float  → Decimal(12,4)
--   BuyerReceipt.paidValueUsd                   Float  → Decimal(14,2)
--   BuyerReceiptBatch.valueUsd                  Float  → Decimal(14,2)
--   BuyerReceiptBatch.goldPriceUsdPerGram       Float  → Decimal(12,4)
--   GoldShiftAllocation.goldPriceUsdPerGram     Float  → Decimal(12,4)
--   GoldShiftAllocation.totalWeightValueUsd     Float  → Decimal(14,2)
--   GoldShiftAllocation.netWeightValueUsd       Float  → Decimal(14,2)
--   GoldShiftAllocation.workerShareValueUsd     Float  → Decimal(14,2)
--   GoldShiftAllocation.companyShareValueUsd    Float  → Decimal(14,2)
--   GoldShiftAllocation.perWorkerValueUsd       Float  → Decimal(14,2)
--   GoldShiftWorkerShare.shareValueUsd          Float  → Decimal(14,2)
--   GoldInventoryEvent.goldPriceUsdPerGram      Float  → Decimal(12,4)
--   GoldInventoryEvent.valueUsd                 Float  → Decimal(14,2)
--
-- All USING clauses cast through numeric and round to the target scale.
--
-- Rollback procedure (reverse each ALTER):
--   ALTER TABLE "GoldSpotPriceCache" ALTER COLUMN "priceUsdPerGram" TYPE DOUBLE PRECISION USING "priceUsdPerGram"::double precision;
--   ALTER TABLE "GoldPour" ALTER COLUMN "goldPriceUsdPerGram" TYPE DOUBLE PRECISION USING "goldPriceUsdPerGram"::double precision;
--   ALTER TABLE "GoldPour" ALTER COLUMN "valueUsd" TYPE DOUBLE PRECISION USING "valueUsd"::double precision;
--   ALTER TABLE "GoldPurchase" ALTER COLUMN "paidAmount" TYPE DOUBLE PRECISION USING "paidAmount"::double precision;
--   ALTER TABLE "GoldDispatch" ALTER COLUMN "goldPriceUsdPerGram" TYPE DOUBLE PRECISION USING "goldPriceUsdPerGram"::double precision;
--   ALTER TABLE "GoldDispatch" ALTER COLUMN "valueUsd" TYPE DOUBLE PRECISION USING "valueUsd"::double precision;
--   ALTER TABLE "BuyerReceipt" ALTER COLUMN "paidAmount" TYPE DOUBLE PRECISION USING "paidAmount"::double precision;
--   ALTER TABLE "BuyerReceipt" ALTER COLUMN "goldPriceUsdPerGram" TYPE DOUBLE PRECISION USING "goldPriceUsdPerGram"::double precision;
--   ALTER TABLE "BuyerReceipt" ALTER COLUMN "paidValueUsd" TYPE DOUBLE PRECISION USING "paidValueUsd"::double precision;
--   ALTER TABLE "BuyerReceiptBatch" ALTER COLUMN "valueUsd" TYPE DOUBLE PRECISION USING "valueUsd"::double precision;
--   ALTER TABLE "BuyerReceiptBatch" ALTER COLUMN "goldPriceUsdPerGram" TYPE DOUBLE PRECISION USING "goldPriceUsdPerGram"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "goldPriceUsdPerGram" TYPE DOUBLE PRECISION USING "goldPriceUsdPerGram"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "totalWeightValueUsd" TYPE DOUBLE PRECISION USING "totalWeightValueUsd"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "netWeightValueUsd" TYPE DOUBLE PRECISION USING "netWeightValueUsd"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "workerShareValueUsd" TYPE DOUBLE PRECISION USING "workerShareValueUsd"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "companyShareValueUsd" TYPE DOUBLE PRECISION USING "companyShareValueUsd"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "perWorkerValueUsd" TYPE DOUBLE PRECISION USING "perWorkerValueUsd"::double precision;
--   ALTER TABLE "GoldShiftWorkerShare" ALTER COLUMN "shareValueUsd" TYPE DOUBLE PRECISION USING "shareValueUsd"::double precision;
--   ALTER TABLE "GoldInventoryEvent" ALTER COLUMN "goldPriceUsdPerGram" TYPE DOUBLE PRECISION USING "goldPriceUsdPerGram"::double precision;
--   ALTER TABLE "GoldInventoryEvent" ALTER COLUMN "valueUsd" TYPE DOUBLE PRECISION USING "valueUsd"::double precision;

-- GoldSpotPriceCache
ALTER TABLE "GoldSpotPriceCache"
  ALTER COLUMN "priceUsdPerGram" TYPE DECIMAL(12,4)
    USING ROUND("priceUsdPerGram"::numeric, 4);

-- GoldPour USD columns
ALTER TABLE "GoldPour"
  ALTER COLUMN "goldPriceUsdPerGram" TYPE DECIMAL(12,4)
    USING ROUND("goldPriceUsdPerGram"::numeric, 4);

ALTER TABLE "GoldPour"
  ALTER COLUMN "valueUsd" TYPE DECIMAL(14,2)
    USING ROUND("valueUsd"::numeric, 2);

-- GoldPurchase USD
ALTER TABLE "GoldPurchase"
  ALTER COLUMN "paidAmount" TYPE DECIMAL(14,2)
    USING ROUND("paidAmount"::numeric, 2);

-- GoldDispatch USD columns
ALTER TABLE "GoldDispatch"
  ALTER COLUMN "goldPriceUsdPerGram" TYPE DECIMAL(12,4)
    USING ROUND("goldPriceUsdPerGram"::numeric, 4);

ALTER TABLE "GoldDispatch"
  ALTER COLUMN "valueUsd" TYPE DECIMAL(14,2)
    USING ROUND("valueUsd"::numeric, 2);

-- BuyerReceipt USD columns
ALTER TABLE "BuyerReceipt"
  ALTER COLUMN "paidAmount" TYPE DECIMAL(14,2)
    USING ROUND("paidAmount"::numeric, 2);

ALTER TABLE "BuyerReceipt"
  ALTER COLUMN "goldPriceUsdPerGram" TYPE DECIMAL(12,4)
    USING ROUND("goldPriceUsdPerGram"::numeric, 4);

ALTER TABLE "BuyerReceipt"
  ALTER COLUMN "paidValueUsd" TYPE DECIMAL(14,2)
    USING ROUND("paidValueUsd"::numeric, 2);

-- BuyerReceiptBatch USD columns
ALTER TABLE "BuyerReceiptBatch"
  ALTER COLUMN "valueUsd" TYPE DECIMAL(14,2)
    USING ROUND("valueUsd"::numeric, 2);

ALTER TABLE "BuyerReceiptBatch"
  ALTER COLUMN "goldPriceUsdPerGram" TYPE DECIMAL(12,4)
    USING ROUND("goldPriceUsdPerGram"::numeric, 4);

-- GoldShiftAllocation USD columns
ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "goldPriceUsdPerGram" TYPE DECIMAL(12,4)
    USING ROUND("goldPriceUsdPerGram"::numeric, 4);

ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "totalWeightValueUsd" TYPE DECIMAL(14,2)
    USING ROUND("totalWeightValueUsd"::numeric, 2);

ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "netWeightValueUsd" TYPE DECIMAL(14,2)
    USING ROUND("netWeightValueUsd"::numeric, 2);

ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "workerShareValueUsd" TYPE DECIMAL(14,2)
    USING ROUND("workerShareValueUsd"::numeric, 2);

ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "companyShareValueUsd" TYPE DECIMAL(14,2)
    USING ROUND("companyShareValueUsd"::numeric, 2);

ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "perWorkerValueUsd" TYPE DECIMAL(14,2)
    USING ROUND("perWorkerValueUsd"::numeric, 2);

-- GoldShiftWorkerShare USD
ALTER TABLE "GoldShiftWorkerShare"
  ALTER COLUMN "shareValueUsd" TYPE DECIMAL(14,2)
    USING ROUND("shareValueUsd"::numeric, 2);

-- GoldInventoryEvent USD columns
ALTER TABLE "GoldInventoryEvent"
  ALTER COLUMN "goldPriceUsdPerGram" TYPE DECIMAL(12,4)
    USING ROUND("goldPriceUsdPerGram"::numeric, 4);

ALTER TABLE "GoldInventoryEvent"
  ALTER COLUMN "valueUsd" TYPE DECIMAL(14,2)
    USING ROUND("valueUsd"::numeric, 2);
