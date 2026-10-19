-- D2 (books-final §7, approved 19 Oct for P1): a receipt names its customer and keeps its
-- currency, the rate on its day and its amount in the base currency, so money on account has
-- an owner and a receipt in ZiG is not read as dollars. Nullable: the forms require them.
-- Backfill, conservative and idempotent (it fills only what is still empty):
--   customer from the receipt's sub-ledger line, then its invoice, then the audit event of the
--   void or delete that took it off its invoice; currency from the invoice, then the bank
--   account, then the workspace's base currency; the rate from CurrencyRate on the day (1 in
--   the base currency); no rate on the day leaves the rate and base amount empty.

-- AlterTable
ALTER TABLE "SalesReceipt" ADD COLUMN "customerId" TEXT,
ADD COLUMN "currency" TEXT,
ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "baseAmount" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "SalesReceipt" ADD CONSTRAINT "SalesReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "SalesReceipt_companyId_customerId_idx" ON "SalesReceipt"("companyId", "customerId");

-- 1. The customer its sub-ledger line names.
UPDATE "SalesReceipt" r
SET "customerId" = p."partyId"
FROM "PaymentLedgerEntry" p, "Customer" c
WHERE r."customerId" IS NULL
  AND p."companyId" = r."companyId" AND p."sourceType" = 'SALES_RECEIPT' AND p."sourceId" = r."id"
  AND p."partyType" = 'CUSTOMER' AND p."partyId" IS NOT NULL
  AND c."id" = p."partyId" AND c."companyId" = r."companyId";

-- 2. Its invoice's customer.
UPDATE "SalesReceipt" r
SET "customerId" = i."customerId"
FROM "SalesInvoice" i
WHERE r."customerId" IS NULL AND r."invoiceId" = i."id" AND i."companyId" = r."companyId";

-- 3. The customer the void or delete that took it off its invoice wrote down.
UPDATE "SalesReceipt" r
SET "customerId" = named."customerId"
FROM (
  SELECT DISTINCT ON (item->>'id') item->>'id' AS "receiptId", e."companyId",
         COALESCE(item->>'customerId', e."payloadJson"::jsonb->'invoice'->>'customerId') AS "customerId"
  FROM "PlatformAuditEvent" e
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(e."payloadJson"::jsonb->'receiptsOnAccount') = 'array' THEN e."payloadJson"::jsonb->'receiptsOnAccount' ELSE '[]'::jsonb END
  ) AS item
  WHERE e."eventType" IN ('books.invoice.voided', 'books.invoice.deleted')
    AND e."payloadJson" IS NOT NULL AND pg_input_is_valid(e."payloadJson", 'jsonb')
    AND jsonb_typeof(e."payloadJson"::jsonb) = 'object'
  ORDER BY item->>'id', e."createdAt" ASC
) named, "Customer" c
WHERE r."customerId" IS NULL AND named."receiptId" = r."id" AND named."companyId" = r."companyId"
  AND c."id" = named."customerId" AND c."companyId" = r."companyId";

-- 4. Currency: the invoice's, else the bank account's, else the workspace's base currency.
UPDATE "SalesReceipt" r
SET "currency" = COALESCE(
  (SELECT i."currency" FROM "SalesInvoice" i WHERE i."id" = r."invoiceId"),
  (SELECT b."currency" FROM "BankAccount" b WHERE b."id" = r."bankAccountId"),
  (SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = r."companyId"),
  'USD')
WHERE r."currency" IS NULL;

-- 5. In the base currency: rate 1, base amount the amount.
UPDATE "SalesReceipt" r
SET "exchangeRate" = 1, "baseAmount" = r."amount"
WHERE r."exchangeRate" IS NULL
  AND upper(r."currency") = upper(COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = r."companyId"), 'USD'));

-- 6. In another currency: the workspace's rate on or before the day (quote units per base unit).
WITH picked AS (
  SELECT r."id", (
    SELECT cr."rate"
    FROM "CurrencyRate" cr
    WHERE cr."companyId" = r."companyId"
      AND upper(cr."baseCurrency") = upper(COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = r."companyId"), 'USD'))
      AND upper(cr."quoteCurrency") = upper(r."currency")
      AND cr."effectiveDate" <= r."receivedAt" AND cr."rate" > 0
    ORDER BY cr."effectiveDate" DESC, cr."createdAt" DESC
    LIMIT 1
  ) AS "rate"
  FROM "SalesReceipt" r
  WHERE r."exchangeRate" IS NULL AND r."currency" IS NOT NULL
)
UPDATE "SalesReceipt" r
SET "exchangeRate" = picked."rate", "baseAmount" = round((r."amount" / picked."rate")::numeric, 2)::double precision
FROM picked
WHERE picked."id" = r."id" AND picked."rate" IS NOT NULL;

-- Vane's reader reaches the new columns, as `pnpm vane:reader-sql` prints them.
GRANT SELECT ("customerId", "currency", "exchangeRate", "baseAmount") ON "SalesReceipt" TO vane_reader;

-- Explore's reader too, as `pnpm explore:reader-sql` prints them.
GRANT SELECT ("customerId", "currency", "exchangeRate", "baseAmount") ON "SalesReceipt" TO explore_reader;
