-- AlterEnum
-- Extend GoldInventorySourceType with REVERSAL, DISPATCH, PURCHASE.
-- REVERSAL: compensating event inserted instead of DELETE when rolling back (C-4 append-only fix).
-- DISPATCH: inventory OUT event recorded when gold is dispatched to buyer.
-- PURCHASE: inventory IN event recorded when gold is purchased from public/employee.
--
-- Rollback procedure:
--   ALTER TYPE "GoldInventorySourceType" RENAME TO "GoldInventorySourceType_old";
--   CREATE TYPE "GoldInventorySourceType" AS ENUM ('POUR', 'RECEIPT', 'ADJUSTMENT', 'SHIFT_ALLOCATION');
--   ALTER TABLE "GoldInventoryEvent"
--     ALTER COLUMN "sourceType" TYPE "GoldInventorySourceType"
--     USING "sourceType"::text::"GoldInventorySourceType";
--   DROP TYPE "GoldInventorySourceType_old";
-- WARNING: Rollback will fail if any rows carry REVERSAL, DISPATCH, or PURCHASE values.
ALTER TYPE "GoldInventorySourceType" ADD VALUE IF NOT EXISTS 'REVERSAL';
ALTER TYPE "GoldInventorySourceType" ADD VALUE IF NOT EXISTS 'DISPATCH';
ALTER TYPE "GoldInventorySourceType" ADD VALUE IF NOT EXISTS 'PURCHASE';
