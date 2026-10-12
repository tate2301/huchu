-- BUY-02 (40-buying 3.3 B): an order names its supplier (a `Vendor`), is sent
-- before it is delivered, knows how it is paid, and can be chased, closed
-- short, cancelled, duplicated and binned. A delivery names its supplier too.

-- New order states. Postgres refuses a new enum value inside the transaction
-- that added it, so nothing below uses SENT or CANCELLED.
ALTER TYPE "RetailPurchaseOrderStatus" ADD VALUE 'SENT' BEFORE 'PARTIAL';
ALTER TYPE "RetailPurchaseOrderStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "NotificationEntityType" ADD VALUE 'RETAIL_PURCHASE_ORDER';
ALTER TYPE "NotificationType" ADD VALUE 'RETAIL_ORDER_FOLLOW_UP';

CREATE TYPE "RetailOrderPayment" AS ENUM ('ON_ACCOUNT', 'CASH_ON_DELIVERY');
CREATE TYPE "RetailOrderSentVia" AS ENUM ('WHATSAPP', 'EMAIL', 'BY_HAND');
CREATE TYPE "RetailOrderChaseAction" AS ENUM ('REMIND', 'CANCEL_REST');

-- Every supplier typed by name on an order or a delivery becomes a supplier,
-- unless one of that name (any case) is already kept, numbered after the
-- company's highest SUP- number. The name is written as the first order typed it.
WITH typed AS (
  SELECT "companyId", btrim("supplierName") AS name, 0 AS source, "createdAt" FROM "RetailPurchaseOrder"
  UNION ALL
  SELECT "companyId", btrim("supplierName") AS name, 1 AS source, "createdAt" FROM "RetailGoodsReceipt"
),
missing AS (
  SELECT DISTINCT ON (t."companyId", lower(t.name)) t."companyId", t.name
  FROM typed t
  WHERE t.name <> ''
    AND NOT EXISTS (
      SELECT 1 FROM "Vendor" v WHERE v."companyId" = t."companyId" AND lower(btrim(v."name")) = lower(t.name)
    )
  ORDER BY t."companyId", lower(t.name), t.source, t."createdAt"
),
numbered AS (
  SELECT m."companyId", m.name, row_number() OVER (PARTITION BY m."companyId" ORDER BY lower(m.name)) AS k
  FROM missing m
),
highest AS (
  SELECT "companyId", max(substring("code" FROM 5)::int) AS top
  FROM "Vendor"
  WHERE "code" ~ '^SUP-[0-9]+$'
  GROUP BY "companyId"
)
INSERT INTO "Vendor" ("id", "companyId", "name", "code", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, n."companyId", n.name,
       'SUP-' || lpad((coalesce(h.top, 0) + n.k)::text, 4, '0'), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM numbered n LEFT JOIN highest h ON h."companyId" = n."companyId";

-- The supplier sequence starts again from the highest number kept.
DELETE FROM "IdSequence" WHERE "entityKey" = 'RETAIL_SUPPLIER';

-- Orders.
ALTER TABLE "RetailPurchaseOrder"
  ADD COLUMN "vendorId" TEXT,
  ADD COLUMN "firstExpectedDate" TIMESTAMP(3),
  ADD COLUMN "payment" "RetailOrderPayment" NOT NULL DEFAULT 'ON_ACCOUNT',
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "sentById" TEXT,
  ADD COLUMN "sentVia" "RetailOrderSentVia",
  ADD COLUMN "chaseAction" "RetailOrderChaseAction",
  ADD COLUMN "chasedAt" TIMESTAMP(3),
  ADD COLUMN "chasedById" TEXT,
  ADD COLUMN "followUpDoneAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "duplicatedFromId" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

UPDATE "RetailPurchaseOrder" o SET "vendorId" = (
  SELECT v."id" FROM "Vendor" v
  WHERE v."companyId" = o."companyId" AND lower(btrim(v."name")) = lower(btrim(o."supplierName"))
  ORDER BY v."isActive" DESC, v."createdAt", v."id"
  LIMIT 1
);

ALTER TABLE "RetailPurchaseOrder" ALTER COLUMN "vendorId" SET NOT NULL;
ALTER TABLE "RetailPurchaseOrder" DROP COLUMN "supplierName";
ALTER TABLE "RetailPurchaseOrder" RENAME COLUMN "notes" TO "noteToSupplier";

UPDATE "RetailPurchaseOrder" SET "firstExpectedDate" = "expectedDate";
-- An order something came against had been given to the supplier somehow.
UPDATE "RetailPurchaseOrder" SET "sentAt" = "createdAt", "sentVia" = 'BY_HAND'
WHERE "status" IN ('PARTIAL', 'RECEIVED', 'CLOSED');

CREATE INDEX "RetailPurchaseOrder_companyId_vendorId_status_idx" ON "RetailPurchaseOrder"("companyId", "vendorId", "status");
ALTER TABLE "RetailPurchaseOrder" ADD CONSTRAINT "RetailPurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RetailPurchaseOrder" ADD CONSTRAINT "RetailPurchaseOrder_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RetailPurchaseOrder" ADD CONSTRAINT "RetailPurchaseOrder_chasedById_fkey" FOREIGN KEY ("chasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RetailPurchaseOrder" ADD CONSTRAINT "RetailPurchaseOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Order lines.
ALTER TABLE "RetailPurchaseOrderLine"
  ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "sentQuantity" DECIMAL(12,4),
  ADD COLUMN "closedShortAt" TIMESTAMP(3),
  ADD COLUMN "closedShortById" TEXT,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "RetailPurchaseOrderLine" SET "sentQuantity" = "quantity";
UPDATE "RetailPurchaseOrderLine" l SET "vatRate" = p."defaultTaxRate"
FROM "InventoryItem" i JOIN "Product" p ON p."id" = i."productId"
WHERE i."id" = l."inventoryItemId";

-- Deliveries.
ALTER TABLE "RetailGoodsReceipt" ADD COLUMN "vendorId" TEXT;

UPDATE "RetailGoodsReceipt" r SET "vendorId" = (
  SELECT v."id" FROM "Vendor" v
  WHERE v."companyId" = r."companyId" AND lower(btrim(v."name")) = lower(btrim(r."supplierName"))
  ORDER BY v."isActive" DESC, v."createdAt", v."id"
  LIMIT 1
);

ALTER TABLE "RetailGoodsReceipt" ALTER COLUMN "vendorId" SET NOT NULL;
ALTER TABLE "RetailGoodsReceipt" DROP COLUMN "supplierName";

-- A delivery's order, now a real link; one whose order was deleted keeps none.
UPDATE "RetailGoodsReceipt" r SET "purchaseOrderId" = NULL
WHERE r."purchaseOrderId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "RetailPurchaseOrder" o WHERE o."id" = r."purchaseOrderId");

CREATE INDEX "RetailGoodsReceipt_companyId_vendorId_idx" ON "RetailGoodsReceipt"("companyId", "vendorId");
ALTER TABLE "RetailGoodsReceipt" ADD CONSTRAINT "RetailGoodsReceipt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RetailGoodsReceipt" ADD CONSTRAINT "RetailGoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "RetailPurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Order and delivery numbers are company-wide (PO-0001, GRN-0001); the
-- per-site sequences go and the next number follows the highest kept.
DELETE FROM "IdSequence" WHERE "entityKey" IN ('RETAIL_PURCHASE_ORDER', 'RETAIL_GOODS_RECEIPT');
