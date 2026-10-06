-- End of day (EndOfDay board): "Discounts US$12.90, 3 approved". Frozen with the
-- report like its other counts; reports taken before this read 0.
ALTER TABLE "RetailZReport" ADD COLUMN "approvedDiscountCount" INTEGER NOT NULL DEFAULT 0;
