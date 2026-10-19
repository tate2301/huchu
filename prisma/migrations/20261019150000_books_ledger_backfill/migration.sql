-- Books P1 (books-final §6.1 fixes 3 and 6, approved 19 Oct): data only, no table changes
-- shape, so there are no reader grants. Conservative and idempotent: nothing is posted, no
-- journal changes, and each statement touches only rows still wrong.

-- Fix 3. A voided document's sub-ledger line stops counting: VOIDED where its mirror
-- (`void:<id>`) is on the ledger, whichever route voided it, or the document itself is void.
UPDATE "PaymentLedgerEntry" p
SET "status" = 'VOIDED', "updatedAt" = CURRENT_TIMESTAMP
WHERE p."status" = 'POSTED'
  AND EXISTS (
    SELECT 1 FROM "JournalEntry" j
    WHERE j."companyId" = p."companyId" AND j."sourceType" = p."sourceType" AND j."sourceId" = 'void:' || p."sourceId"
  );

UPDATE "PaymentLedgerEntry" p
SET "status" = 'VOIDED', "updatedAt" = CURRENT_TIMESTAMP
WHERE p."status" = 'POSTED'
  AND (
    (p."sourceType" = 'SALES_INVOICE' AND EXISTS (SELECT 1 FROM "SalesInvoice" d WHERE d."id" = p."sourceId" AND d."status" = 'VOIDED'))
    OR (p."sourceType" = 'SALES_RECEIPT' AND EXISTS (SELECT 1 FROM "SalesReceipt" d WHERE d."id" = p."sourceId" AND d."voidedAt" IS NOT NULL))
    OR (p."sourceType" = 'SALES_CREDIT_NOTE' AND EXISTS (SELECT 1 FROM "CreditNote" d WHERE d."id" = p."sourceId" AND d."status" = 'VOIDED'))
    OR (p."sourceType" = 'SALES_WRITE_OFF' AND EXISTS (SELECT 1 FROM "SalesWriteOff" d WHERE d."id" = p."sourceId" AND d."status" = 'VOIDED'))
    OR (p."sourceType" = 'PURCHASE_BILL' AND EXISTS (SELECT 1 FROM "PurchaseBill" d WHERE d."id" = p."sourceId" AND d."status" = 'VOIDED'))
    OR (p."sourceType" = 'PURCHASE_DEBIT_NOTE' AND EXISTS (SELECT 1 FROM "DebitNote" d WHERE d."id" = p."sourceId" AND d."status" = 'VOIDED'))
    OR (p."sourceType" = 'PURCHASE_WRITE_OFF' AND EXISTS (SELECT 1 FROM "PurchaseWriteOff" d WHERE d."id" = p."sourceId" AND d."status" = 'VOIDED'))
  );

-- Fix 6. Every receipt and payment that names a money account has its bank transaction, so
-- the account's balance in Books moves with it. Read as the bank's statement reads: money in
-- is CREDIT, money out DEBIT. A void receipt has none; a payment made from a requisition's
-- cash has its bank side on the requisition's payout already.
INSERT INTO "BankTransaction" ("id", "companyId", "bankAccountId", "txnDate", "description", "reference", "amount", "direction", "sourceType", "sourceId", "createdAt")
SELECT gen_random_uuid()::text, r."companyId", r."bankAccountId", r."receivedAt", 'Sales receipt ' || r."receiptNumber",
       COALESCE(r."reference", r."receiptNumber"), r."amount", 'CREDIT', 'SALES_RECEIPT', r."id", CURRENT_TIMESTAMP
FROM "SalesReceipt" r
JOIN "BankAccount" b ON b."id" = r."bankAccountId" AND b."companyId" = r."companyId"
WHERE r."voidedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "BankTransaction" t WHERE t."companyId" = r."companyId" AND t."sourceType" = 'SALES_RECEIPT' AND t."sourceId" = r."id"
  );

INSERT INTO "BankTransaction" ("id", "companyId", "bankAccountId", "txnDate", "description", "reference", "amount", "direction", "sourceType", "sourceId", "createdAt")
SELECT gen_random_uuid()::text, p."companyId", p."bankAccountId", p."paidAt", 'Purchase payment ' || p."paymentNumber",
       COALESCE(p."reference", p."paymentNumber"), p."amount", 'DEBIT', 'PURCHASE_PAYMENT', p."id", CURRENT_TIMESTAMP
FROM "PurchasePayment" p
JOIN "BankAccount" b ON b."id" = p."bankAccountId" AND b."companyId" = p."companyId"
WHERE p."requisitionId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "BankTransaction" t WHERE t."companyId" = p."companyId" AND t."sourceType" = 'PURCHASE_PAYMENT' AND t."sourceId" = p."id"
  );
