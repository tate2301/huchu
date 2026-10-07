-- FLR-03: a shift keeps its ZiG float's dollar value at the rate it was counted in, so the Z-report's expected cash adds it.

-- AlterTable
ALTER TABLE "RetailShift" ADD COLUMN "openingFloatZigBase" DECIMAL(14,2) NOT NULL DEFAULT 0;
