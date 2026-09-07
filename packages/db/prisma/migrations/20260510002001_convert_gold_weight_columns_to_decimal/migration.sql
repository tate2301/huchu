-- Epic 6 Step 2 — Float → Decimal for remaining Gold weight columns.
--
-- Columns converted (grams / purity / weight):
--   GoldPour.grossWeight                    Float  → Decimal(12,4)
--   GoldPour.estimatedPurity                Float  → Decimal(5,2)
--   GoldPour.additionalExpensesWeight       Float  → Decimal(12,4)
--   GoldPurchase.grossWeight                Float  → Decimal(12,4)
--   GoldPurchase.estimatedPurity            Float  → Decimal(5,2)
--   BuyerReceipt.assayResult                Float  → Decimal(5,2)
--   BuyerReceiptBatch.grams                 Float  → Decimal(12,4)
--   GoldShiftAllocation.totalWeight         Float  → Decimal(12,4)
--   GoldShiftAllocation.netWeight           Float  → Decimal(12,4)
--   GoldShiftAllocation.workerShareOverrideWeight  Float → Decimal(12,4)
--   GoldShiftAllocation.workerShareWeight   Float  → Decimal(12,4)
--   GoldShiftAllocation.companyShareWeight  Float  → Decimal(12,4)
--   GoldShiftAllocation.perWorkerWeight     Float  → Decimal(12,4)
--   GoldShiftExpense.weight                 Float  → Decimal(12,4)
--   GoldShiftWorkerShare.shareWeight        Float  → Decimal(12,4)
--   GoldLedgerEntry.gramsTotal              Float  → Decimal(12,4)
--   GoldLedgerEntry.boysGrams              Float  → Decimal(12,4)
--   GoldLedgerEntry.mdaraGrams             Float  → Decimal(12,4)
--   GoldLedgerEntry.balGrams               Float  → Decimal(12,4)
--
-- All USING clauses cast through numeric and round to the target scale.
-- No data loss: sub-scale precision in Float data is negligible for these fields.
--
-- Rollback procedure (reverse each ALTER):
--   ALTER TABLE "GoldPour" ALTER COLUMN "grossWeight" TYPE DOUBLE PRECISION USING "grossWeight"::double precision;
--   ALTER TABLE "GoldPour" ALTER COLUMN "estimatedPurity" TYPE DOUBLE PRECISION USING "estimatedPurity"::double precision;
--   ALTER TABLE "GoldPour" ALTER COLUMN "additionalExpensesWeight" TYPE DOUBLE PRECISION USING "additionalExpensesWeight"::double precision;
--   ALTER TABLE "GoldPurchase" ALTER COLUMN "grossWeight" TYPE DOUBLE PRECISION USING "grossWeight"::double precision;
--   ALTER TABLE "GoldPurchase" ALTER COLUMN "estimatedPurity" TYPE DOUBLE PRECISION USING "estimatedPurity"::double precision;
--   ALTER TABLE "BuyerReceipt" ALTER COLUMN "assayResult" TYPE DOUBLE PRECISION USING "assayResult"::double precision;
--   ALTER TABLE "BuyerReceiptBatch" ALTER COLUMN "grams" TYPE DOUBLE PRECISION USING "grams"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "totalWeight" TYPE DOUBLE PRECISION USING "totalWeight"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "netWeight" TYPE DOUBLE PRECISION USING "netWeight"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "workerShareOverrideWeight" TYPE DOUBLE PRECISION USING "workerShareOverrideWeight"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "workerShareWeight" TYPE DOUBLE PRECISION USING "workerShareWeight"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "companyShareWeight" TYPE DOUBLE PRECISION USING "companyShareWeight"::double precision;
--   ALTER TABLE "GoldShiftAllocation" ALTER COLUMN "perWorkerWeight" TYPE DOUBLE PRECISION USING "perWorkerWeight"::double precision;
--   ALTER TABLE "GoldShiftExpense" ALTER COLUMN "weight" TYPE DOUBLE PRECISION USING "weight"::double precision;
--   ALTER TABLE "GoldShiftWorkerShare" ALTER COLUMN "shareWeight" TYPE DOUBLE PRECISION USING "shareWeight"::double precision;
--   ALTER TABLE "GoldLedgerEntry" ALTER COLUMN "gramsTotal" TYPE DOUBLE PRECISION USING "gramsTotal"::double precision;
--   ALTER TABLE "GoldLedgerEntry" ALTER COLUMN "boysGrams" TYPE DOUBLE PRECISION USING "boysGrams"::double precision;
--   ALTER TABLE "GoldLedgerEntry" ALTER COLUMN "mdaraGrams" TYPE DOUBLE PRECISION USING "mdaraGrams"::double precision;
--   ALTER TABLE "GoldLedgerEntry" ALTER COLUMN "balGrams" TYPE DOUBLE PRECISION USING "balGrams"::double precision;

-- GoldPour weight columns
ALTER TABLE "GoldPour"
  ALTER COLUMN "grossWeight" TYPE DECIMAL(12,4)
    USING ROUND("grossWeight"::numeric, 4);

ALTER TABLE "GoldPour"
  ALTER COLUMN "estimatedPurity" TYPE DECIMAL(5,2)
    USING ROUND("estimatedPurity"::numeric, 2);

ALTER TABLE "GoldPour"
  ALTER COLUMN "additionalExpensesWeight" TYPE DECIMAL(12,4)
    USING ROUND("additionalExpensesWeight"::numeric, 4);

-- GoldPurchase weight columns
ALTER TABLE "GoldPurchase"
  ALTER COLUMN "grossWeight" TYPE DECIMAL(12,4)
    USING ROUND("grossWeight"::numeric, 4);

ALTER TABLE "GoldPurchase"
  ALTER COLUMN "estimatedPurity" TYPE DECIMAL(5,2)
    USING ROUND("estimatedPurity"::numeric, 2);

-- BuyerReceipt purity
ALTER TABLE "BuyerReceipt"
  ALTER COLUMN "assayResult" TYPE DECIMAL(5,2)
    USING ROUND("assayResult"::numeric, 2);

-- BuyerReceiptBatch grams
ALTER TABLE "BuyerReceiptBatch"
  ALTER COLUMN "grams" TYPE DECIMAL(12,4)
    USING ROUND("grams"::numeric, 4);

-- GoldShiftAllocation weight columns
ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "totalWeight" TYPE DECIMAL(12,4)
    USING ROUND("totalWeight"::numeric, 4);

ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "netWeight" TYPE DECIMAL(12,4)
    USING ROUND("netWeight"::numeric, 4);

ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "workerShareOverrideWeight" TYPE DECIMAL(12,4)
    USING ROUND("workerShareOverrideWeight"::numeric, 4);

ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "workerShareWeight" TYPE DECIMAL(12,4)
    USING ROUND("workerShareWeight"::numeric, 4);

ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "companyShareWeight" TYPE DECIMAL(12,4)
    USING ROUND("companyShareWeight"::numeric, 4);

ALTER TABLE "GoldShiftAllocation"
  ALTER COLUMN "perWorkerWeight" TYPE DECIMAL(12,4)
    USING ROUND("perWorkerWeight"::numeric, 4);

-- GoldShiftExpense weight
ALTER TABLE "GoldShiftExpense"
  ALTER COLUMN "weight" TYPE DECIMAL(12,4)
    USING ROUND("weight"::numeric, 4);

-- GoldShiftWorkerShare weight
ALTER TABLE "GoldShiftWorkerShare"
  ALTER COLUMN "shareWeight" TYPE DECIMAL(12,4)
    USING ROUND("shareWeight"::numeric, 4);

-- GoldLedgerEntry gram columns
ALTER TABLE "GoldLedgerEntry"
  ALTER COLUMN "gramsTotal" TYPE DECIMAL(12,4)
    USING ROUND("gramsTotal"::numeric, 4);

ALTER TABLE "GoldLedgerEntry"
  ALTER COLUMN "boysGrams" TYPE DECIMAL(12,4)
    USING ROUND("boysGrams"::numeric, 4);

ALTER TABLE "GoldLedgerEntry"
  ALTER COLUMN "mdaraGrams" TYPE DECIMAL(12,4)
    USING ROUND("mdaraGrams"::numeric, 4);

ALTER TABLE "GoldLedgerEntry"
  ALTER COLUMN "balGrams" TYPE DECIMAL(12,4)
    USING ROUND("balGrams"::numeric, 4);
