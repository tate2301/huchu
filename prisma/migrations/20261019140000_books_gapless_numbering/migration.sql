-- D8 (books-final §7, approved 19 Oct for P1): numbers are given at issue from one gapless
-- series per type (`nextNumber`, lib/books/core/numbering.ts), never at draft. A draft
-- invoice, bill, credit note or debit note carries no number, so its number column is
-- nullable (Postgres's unique index lets drafts share NULL). Write-offs get a number of
-- their own. Existing numbers are kept; each series continues after the highest number of
-- its form already used. Idempotent: it fills only empty numbers and only raises counters.

-- AlterTable
ALTER TABLE "SalesInvoice" ALTER COLUMN "invoiceNumber" DROP NOT NULL;
ALTER TABLE "PurchaseBill" ALTER COLUMN "billNumber" DROP NOT NULL;
ALTER TABLE "CreditNote" ALTER COLUMN "noteNumber" DROP NOT NULL;
ALTER TABLE "DebitNote" ALTER COLUMN "noteNumber" DROP NOT NULL;
ALTER TABLE "SalesWriteOff" ADD COLUMN "writeOffNumber" TEXT;
ALTER TABLE "PurchaseWriteOff" ADD COLUMN "writeOffNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SalesWriteOff_companyId_writeOffNumber_key" ON "SalesWriteOff"("companyId", "writeOffNumber");
CREATE UNIQUE INDEX "PurchaseWriteOff_companyId_writeOffNumber_key" ON "PurchaseWriteOff"("companyId", "writeOffNumber");

-- 1. Write-offs already made are numbered in the order they were made, after any WO-n / PWO-n.
WITH numbered AS (
  SELECT w."id",
         row_number() OVER (PARTITION BY w."companyId" ORDER BY w."createdAt", w."id")
           + COALESCE((SELECT max(substring(x."writeOffNumber" FROM '^WO-([0-9]+)$')::int) FROM "SalesWriteOff" x WHERE x."companyId" = w."companyId"), 0) AS n
  FROM "SalesWriteOff" w
  WHERE w."writeOffNumber" IS NULL
)
UPDATE "SalesWriteOff" w SET "writeOffNumber" = 'WO-' || lpad(numbered.n::text, 4, '0')
FROM numbered WHERE numbered."id" = w."id";

WITH numbered AS (
  SELECT w."id",
         row_number() OVER (PARTITION BY w."companyId" ORDER BY w."createdAt", w."id")
           + COALESCE((SELECT max(substring(x."writeOffNumber" FROM '^PWO-([0-9]+)$')::int) FROM "PurchaseWriteOff" x WHERE x."companyId" = w."companyId"), 0) AS n
  FROM "PurchaseWriteOff" w
  WHERE w."writeOffNumber" IS NULL
)
UPDATE "PurchaseWriteOff" w SET "writeOffNumber" = 'PWO-' || lpad(numbered.n::text, 4, '0')
FROM numbered WHERE numbered."id" = w."id";

-- 2. Every series starts after the highest number of its form already in its table: a counter
--    that already exists and lags is raised; one that does not exist yet starts there itself.
WITH highest AS (
  SELECT "companyId", 'SALES_INVOICE' AS "entityKey", max(substring("invoiceNumber" FROM '^INV-([0-9]{1,9})$')::int) AS n FROM "SalesInvoice" GROUP BY "companyId"
  UNION ALL SELECT "companyId", 'SALES_RECEIPT', max(substring("receiptNumber" FROM '^REC-([0-9]{1,9})$')::int) FROM "SalesReceipt" GROUP BY "companyId"
  UNION ALL SELECT "companyId", 'SALES_CREDIT_NOTE', max(substring("noteNumber" FROM '^CN-([0-9]{1,9})$')::int) FROM "CreditNote" GROUP BY "companyId"
  UNION ALL SELECT "companyId", 'SALES_WRITE_OFF', max(substring("writeOffNumber" FROM '^WO-([0-9]{1,9})$')::int) FROM "SalesWriteOff" GROUP BY "companyId"
  UNION ALL SELECT "companyId", 'PURCHASE_BILL', max(substring("billNumber" FROM '^BILL-([0-9]{1,9})$')::int) FROM "PurchaseBill" GROUP BY "companyId"
  UNION ALL SELECT "companyId", 'PURCHASE_DEBIT_NOTE', max(substring("noteNumber" FROM '^DN-([0-9]{1,9})$')::int) FROM "DebitNote" GROUP BY "companyId"
  UNION ALL SELECT "companyId", 'PURCHASE_WRITE_OFF', max(substring("writeOffNumber" FROM '^PWO-([0-9]{1,9})$')::int) FROM "PurchaseWriteOff" GROUP BY "companyId"
  UNION ALL SELECT "companyId", 'RETAIL_SUPPLIER_PAYMENT', max(greatest(
      substring("paymentNumber" FROM '^PAY-([0-9]{1,9})(/[0-9]+)?$')::int,
      substring(COALESCE("groupNo", '') FROM '^PAY-([0-9]{1,9})$')::int)) FROM "PurchasePayment" GROUP BY "companyId"
  UNION ALL SELECT "companyId", 'JOURNAL_ENTRY', max("entryNumber") FROM "JournalEntry" GROUP BY "companyId"
)
UPDATE "IdSequence" s
SET "lastNumber" = highest.n, "updatedAt" = CURRENT_TIMESTAMP
FROM highest
WHERE s."companyId" = highest."companyId" AND s."entityKey" = highest."entityKey" AND s."scopeKey" = 'GLOBAL'
  AND highest.n IS NOT NULL AND s."lastNumber" < highest.n;

-- Vane's reader reaches the new columns, as `pnpm vane:reader-sql` prints them.
GRANT SELECT ("writeOffNumber") ON "SalesWriteOff" TO vane_reader;
GRANT SELECT ("writeOffNumber") ON "PurchaseWriteOff" TO vane_reader;

-- Explore's reader too, as `pnpm explore:reader-sql` prints them.
GRANT SELECT ("writeOffNumber") ON "SalesWriteOff" TO explore_reader;
GRANT SELECT ("writeOffNumber") ON "PurchaseWriteOff" TO explore_reader;
