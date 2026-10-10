-- STK-01: every stock movement says why it moved, which document moved it,
-- what it did to the line and what the line held afterwards.

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('OPENING', 'SALE', 'REFUND', 'VOID', 'RECEIVED', 'DELIVERY_DIFFERENCE', 'SUPPLIER_RETURN', 'COUNT', 'BROKEN', 'OWN_USE', 'FOUND', 'CORRECTION', 'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_BACK', 'CASE_BROKEN', 'REVERSAL', 'PLACE_MOVE');

-- AlterEnum
ALTER TYPE "NotificationEntityType" ADD VALUE 'RETAIL_STOCK_COUNT';
ALTER TYPE "NotificationEntityType" ADD VALUE 'RETAIL_STOCK_TRANSFER';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RETAIL_COUNT_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'RETAIL_COUNT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'RETAIL_TRANSFER_SENT';

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "reorderQty" DECIMAL(12,4),
ADD COLUMN     "shelf" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "balanceAfter" DECIMAL(12,4),
ADD COLUMN     "change" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "reason" "StockMovementReason",
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "reversesId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversesId_key" ON "StockMovement"("reversesId");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill 1: the signed change. An adjustment's quantity is already signed;
-- a move between places changes nothing on hand.
UPDATE "StockMovement" SET "change" = CASE "movementType"
  WHEN 'RECEIPT' THEN ABS("quantity")
  WHEN 'ISSUE' THEN -ABS("quantity")
  WHEN 'ADJUSTMENT' THEN "quantity"
  ELSE 0
END;

-- Backfill 2: the reason, from what caused the movement. A case was opened
-- through RETAIL_STOCK_ADJUSTMENT with a note starting "Opened "; every other
-- retail adjustment set on hand by hand. Stores rows have no reason.
UPDATE "StockMovement" SET "reason" = (CASE
  WHEN "sourceType" = 'RETAIL_SALE' THEN 'SALE'
  WHEN "sourceType" = 'RETAIL_REFUND' THEN 'REFUND'
  WHEN "sourceType" = 'RETAIL_VOID' THEN 'VOID'
  WHEN "sourceType" = 'RETAIL_GOODS_RECEIPT' THEN 'RECEIVED'
  WHEN "sourceType" = 'RETAIL_STOCK_ADJUSTMENT' AND "notes" LIKE 'Opened %' THEN 'CASE_BROKEN'
  WHEN "sourceType" = 'RETAIL_STOCK_ADJUSTMENT' THEN 'CORRECTION'
  WHEN "sourceType" = 'RETAIL_STOCK_TRANSFER' THEN 'PLACE_MOVE'
  ELSE NULL
END)::"StockMovementReason";

-- Backfill 3: the document number. Sales, refunds and voids key the line as
-- "<saleId>:<itemId>", goods receipts as "<receiptId>:<itemId>".
UPDATE "StockMovement" AS m SET "reference" = s."saleNo"
FROM "RetailSale" AS s
WHERE m."sourceType" IN ('RETAIL_SALE', 'RETAIL_REFUND', 'RETAIL_VOID')
  AND s."id" = split_part(m."sourceId", ':', 1);

UPDATE "StockMovement" AS m SET "reference" = r."receiptNo"
FROM "RetailGoodsReceipt" AS r
WHERE m."sourceType" = 'RETAIL_GOODS_RECEIPT'
  AND r."id" = split_part(m."sourceId", ':', 1);

-- Backfill 4: the balance after each movement, walked back from today's on
-- hand, so the newest movement on every line holds the line's on hand.
UPDATE "StockMovement" AS m SET "balanceAfter" = b."balance"
FROM (
  SELECT
    sm."id",
    i."currentStock" - COALESCE(
      SUM(sm."change") OVER (
        PARTITION BY sm."itemId"
        ORDER BY sm."createdAt" DESC, sm."id" DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS "balance"
  FROM "StockMovement" AS sm
  JOIN "InventoryItem" AS i ON i."id" = sm."itemId"
) AS b
WHERE b."id" = m."id";
