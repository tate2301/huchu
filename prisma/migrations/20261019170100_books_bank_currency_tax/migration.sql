-- P3 (books-final §7 and §8, approved 19 Oct): bank, currency and tax.
--   D15  BankStatementLine.excludedAt, excludedById, excludeReason (a line left out, by whom and why);
--        BankReconciliation.statementEndDate beside its statementBalance, closedAt and closedById, so a
--        reconciliation can be closed against a statement. Open reconciliations stay open.
--   D3   exchangeRate, rateSource, baseTotal on SalesQuotation, SalesInvoice, CreditNote, PurchaseBill,
--        DebitNote, PurchasePayment, CrmRequisition, CrmDailyCostEntry and ExpenseClaim: the rate frozen
--        on the document, so a document in ZiG posts in the base currency at its own rate.
--   D4   JournalLine.currency, amountInCurrency, exchangeRate: a line keeps its document's currency
--        beside the base debit or credit (for revaluation and per-currency reports). Past lines stay
--        empty: reports keep reading the base debit and credit.
--   D17  Vendor.itf263Number, itf263ExpiresAt, isVatWithholdingAgent; Customer.isVatWithholdingAgent;
--        PurchasePayment.withholdingAmount, withholdingType, certificateNo. The accounts (2180, 1170,
--        2185, 5460 Bank charges, 5465 IMTT, 4210/4220 exchange differences, 2280 Income tax payable)
--        are seeded by ensureAccountingDefaults, only where the code is free in a workspace's chart.
--   AccountingSettings.taxSettings: ZIMRA's dates, rates and thresholds as settings (brief default 5:
--        FLAGged values are settings marked "to confirm", not hard-coded). Empty means today's defaults.
-- Backfill, conservative and idempotent (it fills only what is still empty): a document in the base
-- currency gets rate 1; any other the latest CurrencyRate on or before its date, with its source; no
-- rate on the day leaves it empty. A credit note takes its invoice's rate and a debit note its bill's,
-- since each corrects part of that document. Nothing is posted, so no month's figures change.

-- AlterTable
ALTER TABLE "SalesQuotation" ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "rateSource" TEXT,
ADD COLUMN "baseTotal" DOUBLE PRECISION;

ALTER TABLE "SalesInvoice" ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "rateSource" TEXT,
ADD COLUMN "baseTotal" DOUBLE PRECISION;

ALTER TABLE "CreditNote" ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "rateSource" TEXT,
ADD COLUMN "baseTotal" DOUBLE PRECISION;

ALTER TABLE "PurchaseBill" ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "rateSource" TEXT,
ADD COLUMN "baseTotal" DOUBLE PRECISION;

ALTER TABLE "DebitNote" ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "rateSource" TEXT,
ADD COLUMN "baseTotal" DOUBLE PRECISION;

ALTER TABLE "PurchasePayment" ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "rateSource" TEXT,
ADD COLUMN "baseTotal" DOUBLE PRECISION,
ADD COLUMN "withholdingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "withholdingType" TEXT,
ADD COLUMN "certificateNo" TEXT;

ALTER TABLE "CrmRequisition" ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "rateSource" TEXT,
ADD COLUMN "baseTotal" DECIMAL(14,2);

ALTER TABLE "CrmDailyCostEntry" ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "rateSource" TEXT,
ADD COLUMN "baseTotal" DECIMAL(14,2);

ALTER TABLE "ExpenseClaim" ADD COLUMN "exchangeRate" DOUBLE PRECISION,
ADD COLUMN "rateSource" TEXT,
ADD COLUMN "baseTotal" DECIMAL(14,2);

ALTER TABLE "JournalLine" ADD COLUMN "currency" TEXT,
ADD COLUMN "amountInCurrency" DOUBLE PRECISION,
ADD COLUMN "exchangeRate" DOUBLE PRECISION;

ALTER TABLE "BankStatementLine" ADD COLUMN "excludedAt" TIMESTAMP(3),
ADD COLUMN "excludedById" TEXT,
ADD COLUMN "excludeReason" TEXT;

ALTER TABLE "BankReconciliation" ADD COLUMN "statementEndDate" TIMESTAMP(3);

ALTER TABLE "Vendor" ADD COLUMN "itf263Number" TEXT,
ADD COLUMN "itf263ExpiresAt" TIMESTAMP(3),
ADD COLUMN "isVatWithholdingAgent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Customer" ADD COLUMN "isVatWithholdingAgent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AccountingSettings" ADD COLUMN "taxSettings" JSONB;

-- SalesQuotation: base currency at 1, else the rate on or before its date.
UPDATE "SalesQuotation" t SET "exchangeRate" = 1, "rateSource" = 'BASE', "baseTotal" = t."total"
WHERE t."exchangeRate" IS NULL AND upper(t."currency") = upper(COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD'));

WITH p AS (
  SELECT t."id", r."rate", r."source"::text AS "source"
  FROM "SalesQuotation" t
  JOIN LATERAL (
    SELECT c."rate", c."source" FROM "CurrencyRate" c
    WHERE c."companyId" = t."companyId" AND c."baseCurrency" = COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD')
      AND c."quoteCurrency" = upper(t."currency") AND c."effectiveDate" <= t."quotationDate" AND c."rate" > 0
    ORDER BY c."effectiveDate" DESC, c."createdAt" DESC LIMIT 1
  ) r ON true
  WHERE t."exchangeRate" IS NULL
)
UPDATE "SalesQuotation" t SET "exchangeRate" = p."rate", "rateSource" = p."source", "baseTotal" = round((t."total" / p."rate")::numeric, 2)::float8
FROM p WHERE p."id" = t."id";

-- SalesInvoice: base currency at 1, else the rate on or before its date.
UPDATE "SalesInvoice" t SET "exchangeRate" = 1, "rateSource" = 'BASE', "baseTotal" = t."total"
WHERE t."exchangeRate" IS NULL AND upper(t."currency") = upper(COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD'));

WITH p AS (
  SELECT t."id", r."rate", r."source"::text AS "source"
  FROM "SalesInvoice" t
  JOIN LATERAL (
    SELECT c."rate", c."source" FROM "CurrencyRate" c
    WHERE c."companyId" = t."companyId" AND c."baseCurrency" = COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD')
      AND c."quoteCurrency" = upper(t."currency") AND c."effectiveDate" <= t."invoiceDate" AND c."rate" > 0
    ORDER BY c."effectiveDate" DESC, c."createdAt" DESC LIMIT 1
  ) r ON true
  WHERE t."exchangeRate" IS NULL
)
UPDATE "SalesInvoice" t SET "exchangeRate" = p."rate", "rateSource" = p."source", "baseTotal" = round((t."total" / p."rate")::numeric, 2)::float8
FROM p WHERE p."id" = t."id";

-- PurchaseBill: base currency at 1, else the rate on or before its date.
UPDATE "PurchaseBill" t SET "exchangeRate" = 1, "rateSource" = 'BASE', "baseTotal" = t."total"
WHERE t."exchangeRate" IS NULL AND upper(t."currency") = upper(COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD'));

WITH p AS (
  SELECT t."id", r."rate", r."source"::text AS "source"
  FROM "PurchaseBill" t
  JOIN LATERAL (
    SELECT c."rate", c."source" FROM "CurrencyRate" c
    WHERE c."companyId" = t."companyId" AND c."baseCurrency" = COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD')
      AND c."quoteCurrency" = upper(t."currency") AND c."effectiveDate" <= t."billDate" AND c."rate" > 0
    ORDER BY c."effectiveDate" DESC, c."createdAt" DESC LIMIT 1
  ) r ON true
  WHERE t."exchangeRate" IS NULL
)
UPDATE "PurchaseBill" t SET "exchangeRate" = p."rate", "rateSource" = p."source", "baseTotal" = round((t."total" / p."rate")::numeric, 2)::float8
FROM p WHERE p."id" = t."id";

-- PurchasePayment: base currency at 1, else the rate on or before its date.
UPDATE "PurchasePayment" t SET "exchangeRate" = 1, "rateSource" = 'BASE', "baseTotal" = t."amount"
WHERE t."exchangeRate" IS NULL AND upper(COALESCE((SELECT b."currency" FROM "PurchaseBill" b WHERE b."id" = t."billId"), (SELECT a."currency" FROM "BankAccount" a WHERE a."id" = t."bankAccountId"), COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD'))) = upper(COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD'));

WITH p AS (
  SELECT t."id", r."rate", r."source"::text AS "source"
  FROM "PurchasePayment" t
  JOIN LATERAL (
    SELECT c."rate", c."source" FROM "CurrencyRate" c
    WHERE c."companyId" = t."companyId" AND c."baseCurrency" = COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD')
      AND c."quoteCurrency" = upper(COALESCE((SELECT b."currency" FROM "PurchaseBill" b WHERE b."id" = t."billId"), (SELECT a."currency" FROM "BankAccount" a WHERE a."id" = t."bankAccountId"), COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD'))) AND c."effectiveDate" <= t."paidAt" AND c."rate" > 0
    ORDER BY c."effectiveDate" DESC, c."createdAt" DESC LIMIT 1
  ) r ON true
  WHERE t."exchangeRate" IS NULL
)
UPDATE "PurchasePayment" t SET "exchangeRate" = p."rate", "rateSource" = p."source", "baseTotal" = round((t."amount" / p."rate")::numeric, 2)::float8
FROM p WHERE p."id" = t."id";

-- CrmRequisition: base currency at 1, else the rate on or before its date.
UPDATE "CrmRequisition" t SET "exchangeRate" = 1, "rateSource" = 'BASE', "baseTotal" = t."amount"
WHERE t."exchangeRate" IS NULL AND upper(t."currency") = upper(COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD'));

WITH p AS (
  SELECT t."id", r."rate", r."source"::text AS "source"
  FROM "CrmRequisition" t
  JOIN LATERAL (
    SELECT c."rate", c."source" FROM "CurrencyRate" c
    WHERE c."companyId" = t."companyId" AND c."baseCurrency" = COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD')
      AND c."quoteCurrency" = upper(t."currency") AND c."effectiveDate" <= t."createdAt" AND c."rate" > 0
    ORDER BY c."effectiveDate" DESC, c."createdAt" DESC LIMIT 1
  ) r ON true
  WHERE t."exchangeRate" IS NULL
)
UPDATE "CrmRequisition" t SET "exchangeRate" = p."rate", "rateSource" = p."source", "baseTotal" = round(t."amount" / p."rate"::numeric, 2)
FROM p WHERE p."id" = t."id";

-- CrmDailyCostEntry: base currency at 1, else the rate on or before its date.
UPDATE "CrmDailyCostEntry" t SET "exchangeRate" = 1, "rateSource" = 'BASE', "baseTotal" = t."amount"
WHERE t."exchangeRate" IS NULL AND upper(t."currency") = upper(COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD'));

WITH p AS (
  SELECT t."id", r."rate", r."source"::text AS "source"
  FROM "CrmDailyCostEntry" t
  JOIN LATERAL (
    SELECT c."rate", c."source" FROM "CurrencyRate" c
    WHERE c."companyId" = t."companyId" AND c."baseCurrency" = COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD')
      AND c."quoteCurrency" = upper(t."currency") AND c."effectiveDate" <= t."createdAt" AND c."rate" > 0
    ORDER BY c."effectiveDate" DESC, c."createdAt" DESC LIMIT 1
  ) r ON true
  WHERE t."exchangeRate" IS NULL
)
UPDATE "CrmDailyCostEntry" t SET "exchangeRate" = p."rate", "rateSource" = p."source", "baseTotal" = round(t."amount" / p."rate"::numeric, 2)
FROM p WHERE p."id" = t."id";

-- ExpenseClaim: base currency at 1, else the rate on or before its date.
UPDATE "ExpenseClaim" t SET "exchangeRate" = 1, "rateSource" = 'BASE', "baseTotal" = t."total"
WHERE t."exchangeRate" IS NULL AND upper(t."currency") = upper(COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD'));

WITH p AS (
  SELECT t."id", r."rate", r."source"::text AS "source"
  FROM "ExpenseClaim" t
  JOIN LATERAL (
    SELECT c."rate", c."source" FROM "CurrencyRate" c
    WHERE c."companyId" = t."companyId" AND c."baseCurrency" = COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD')
      AND c."quoteCurrency" = upper(t."currency") AND c."effectiveDate" <= t."createdAt" AND c."rate" > 0
    ORDER BY c."effectiveDate" DESC, c."createdAt" DESC LIMIT 1
  ) r ON true
  WHERE t."exchangeRate" IS NULL
)
UPDATE "ExpenseClaim" t SET "exchangeRate" = p."rate", "rateSource" = p."source", "baseTotal" = round(t."total" / p."rate"::numeric, 2)
FROM p WHERE p."id" = t."id";

-- CreditNote: its SalesInvoice's rate.
UPDATE "CreditNote" t SET "exchangeRate" = d."exchangeRate", "rateSource" = d."rateSource",
       "baseTotal" = round((t."total" / d."exchangeRate")::numeric, 2)::float8
FROM "SalesInvoice" d
WHERE t."exchangeRate" IS NULL AND d."id" = t."invoiceId" AND d."exchangeRate" > 0;

-- DebitNote: its PurchaseBill's rate.
UPDATE "DebitNote" t SET "exchangeRate" = d."exchangeRate", "rateSource" = d."rateSource",
       "baseTotal" = round((t."total" / d."exchangeRate")::numeric, 2)::float8
FROM "PurchaseBill" d
WHERE t."exchangeRate" IS NULL AND d."id" = t."billId" AND d."exchangeRate" > 0;

-- Vane's and Explore's readers read the new columns, as `pnpm vane:reader-sql` and `pnpm explore:reader-sql` print them.
GRANT SELECT ("id", "companyId", "baseCurrency", "fiscalYearStartMonth", "periodLockPolicy", "legalName", "tradingName", "vatNumber", "taxNumber", "address", "phone", "email", "defaultTaxCodeId", "defaultBankAccountId", "freezeBeforeDate", "retainedEarningsAccountId", "taxSettings", "createdAt", "updatedAt") ON "AccountingSettings" TO vane_reader;
GRANT SELECT ("id", "entryId", "accountId", "debit", "credit", "memo", "costCenterId", "currency", "amountInCurrency", "exchangeRate", "createdAt") ON "JournalLine" TO vane_reader;
GRANT SELECT ("id", "companyId", "taxCategoryId", "name", "contactName", "phone", "email", "address", "taxNumber", "vatNumber", "isVatWithholdingAgent", "isActive", "code", "whatsapp", "area", "dateOfBirth", "marketingConsent", "consentChangedAt", "cardNo", "tierHeld", "tierHeldUntil", "priceListId", "archivedAt", "mergedIntoId", "createdById", "createdAt", "updatedAt") ON "Customer" TO vane_reader;
GRANT SELECT ("id", "companyId", "taxCategoryId", "name", "contactName", "phone", "email", "address", "taxNumber", "vatNumber", "itf263Number", "itf263ExpiresAt", "isVatWithholdingAgent", "isActive", "createdAt", "updatedAt", "code", "whatsapp", "sendOrdersOnWhatsapp", "payTermsDays", "deliversOn", "leadTimeDays", "minimumOrder", "bankDetails", "stoppedAt", "stoppedById", "createdById") ON "Vendor" TO vane_reader;
GRANT SELECT ("id", "companyId", "customerId", "invoiceNumber", "invoiceDate", "dueDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "amountPaid", "creditTotal", "writeOffTotal", "notes", "fiscalStatus", "quotationId", "revision", "createdById", "madeByVane", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "SalesInvoice" TO vane_reader;
GRANT SELECT ("id", "companyId", "customerId", "quotationNumber", "quotationDate", "validUntil", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "notes", "createdById", "madeByVane", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "SalesQuotation" TO vane_reader;
GRANT SELECT ("id", "companyId", "invoiceId", "noteNumber", "noteDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "reason", "createdById", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "CreditNote" TO vane_reader;
GRANT SELECT ("id", "companyId", "vendorId", "billNumber", "billDate", "dueDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "amountPaid", "debitNoteTotal", "writeOffTotal", "notes", "createdById", "issuedById", "issuedAt", "goodsReceiptId", "purchaseOrderId", "needsReview", "supplierFtiNumber", "fdmsStatus", "fdmsCheckedAt", "fdmsCheckedById", "approvedById", "approvedAt", "createdAt", "updatedAt") ON "PurchaseBill" TO vane_reader;
GRANT SELECT ("id", "companyId", "billId", "paymentNumber", "status", "submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "paidById", "voidedAt", "voidedById", "voidReason", "paidAt", "amount", "exchangeRate", "rateSource", "baseTotal", "withholdingAmount", "withholdingType", "certificateNo", "method", "reference", "bankAccountId", "createdById", "createdAt", "vendorId", "groupNo", "requisitionId") ON "PurchasePayment" TO vane_reader;
GRANT SELECT ("id", "companyId", "billId", "noteNumber", "noteDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "reason", "createdById", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "DebitNote" TO vane_reader;
GRANT SELECT ("id", "companyId", "bankAccountId", "startDate", "endDate", "statementBalance", "statementEndDate", "status", "createdById", "closedById", "closedAt", "createdAt", "updatedAt") ON "BankReconciliation" TO vane_reader;
GRANT SELECT ("id", "reconciliationId", "txnDate", "description", "reference", "amount", "direction", "matchedTransactionId", "excludedAt", "excludedById", "excludeReason", "createdAt") ON "BankStatementLine" TO vane_reader;
GRANT SELECT ("id", "companyId", "requisitionNo", "status", "category", "purpose", "notes", "projectId", "siteId", "amount", "currency", "exchangeRate", "rateSource", "baseTotal", "requestedById", "neededBy", "submittedAt", "approvedById", "approvedAt", "approvedAmount", "decisionNote", "disbursedById", "disbursedAt", "bankAccountId", "acquittedAt", "acquittedAmount", "receiptsWaivedById", "receiptWaiverNote", "purchaseOrderId", "expenseTypeId", "payeeVendorId", "approverId", "approvalLimit", "rejectReason", "paidAmount", "paidToId", "payoutMethod", "payoutReference", "receiptsDueAt", "acquittedById", "changeAmount", "changeAccountId", "acquittalNote", "cancelledAt", "cancelledById", "createdAt", "updatedAt") ON "CrmRequisition" TO vane_reader;
GRANT SELECT ("id", "companyId", "logId", "direction", "category", "amount", "currency", "exchangeRate", "rateSource", "baseTotal", "description", "projectId", "requisitionId", "invoiceDocumentId", "receiptUrl", "receiptPathname", "clientEntryId", "createdAt", "updatedAt") ON "CrmDailyCostEntry" TO vane_reader;
GRANT SELECT ("id", "companyId", "claimNo", "status", "claimantId", "currency", "exchangeRate", "rateSource", "baseTotal", "total", "notes", "dailyLogId", "needsReview", "reviewNote", "submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "decisionNote", "paidById", "paidAt", "bankAccountId", "voidedAt", "voidedById", "voidReason", "createdById", "createdAt", "updatedAt") ON "ExpenseClaim" TO vane_reader;
GRANT SELECT ("id", "companyId", "baseCurrency", "fiscalYearStartMonth", "periodLockPolicy", "legalName", "tradingName", "vatNumber", "taxNumber", "address", "phone", "email", "defaultTaxCodeId", "defaultBankAccountId", "freezeBeforeDate", "retainedEarningsAccountId", "taxSettings", "createdAt", "updatedAt") ON "AccountingSettings" TO explore_reader;
GRANT SELECT ("id", "entryId", "accountId", "debit", "credit", "memo", "costCenterId", "currency", "amountInCurrency", "exchangeRate", "createdAt") ON "JournalLine" TO explore_reader;
GRANT SELECT ("id", "companyId", "taxCategoryId", "name", "contactName", "phone", "email", "address", "taxNumber", "vatNumber", "isVatWithholdingAgent", "isActive", "code", "whatsapp", "area", "dateOfBirth", "marketingConsent", "consentChangedAt", "cardNo", "tierHeld", "tierHeldUntil", "priceListId", "archivedAt", "mergedIntoId", "createdById", "createdAt", "updatedAt") ON "Customer" TO explore_reader;
GRANT SELECT ("id", "companyId", "taxCategoryId", "name", "contactName", "phone", "email", "address", "taxNumber", "vatNumber", "itf263Number", "itf263ExpiresAt", "isVatWithholdingAgent", "isActive", "createdAt", "updatedAt", "code", "whatsapp", "sendOrdersOnWhatsapp", "payTermsDays", "deliversOn", "leadTimeDays", "minimumOrder", "bankDetails", "stoppedAt", "stoppedById", "createdById") ON "Vendor" TO explore_reader;
GRANT SELECT ("id", "companyId", "customerId", "invoiceNumber", "invoiceDate", "dueDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "amountPaid", "creditTotal", "writeOffTotal", "notes", "fiscalStatus", "quotationId", "revision", "createdById", "madeByVane", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "SalesInvoice" TO explore_reader;
GRANT SELECT ("id", "companyId", "customerId", "quotationNumber", "quotationDate", "validUntil", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "notes", "createdById", "madeByVane", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "SalesQuotation" TO explore_reader;
GRANT SELECT ("id", "companyId", "invoiceId", "noteNumber", "noteDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "reason", "createdById", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "CreditNote" TO explore_reader;
GRANT SELECT ("id", "companyId", "vendorId", "billNumber", "billDate", "dueDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "amountPaid", "debitNoteTotal", "writeOffTotal", "notes", "createdById", "issuedById", "issuedAt", "goodsReceiptId", "purchaseOrderId", "needsReview", "supplierFtiNumber", "fdmsStatus", "fdmsCheckedAt", "fdmsCheckedById", "approvedById", "approvedAt", "createdAt", "updatedAt") ON "PurchaseBill" TO explore_reader;
GRANT SELECT ("id", "companyId", "billId", "paymentNumber", "status", "submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "paidById", "voidedAt", "voidedById", "voidReason", "paidAt", "amount", "exchangeRate", "rateSource", "baseTotal", "withholdingAmount", "withholdingType", "certificateNo", "method", "reference", "bankAccountId", "createdById", "createdAt", "vendorId", "groupNo", "requisitionId") ON "PurchasePayment" TO explore_reader;
GRANT SELECT ("id", "companyId", "billId", "noteNumber", "noteDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "reason", "createdById", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "DebitNote" TO explore_reader;
GRANT SELECT ("id", "companyId", "bankAccountId", "startDate", "endDate", "statementBalance", "statementEndDate", "status", "createdById", "closedById", "closedAt", "createdAt", "updatedAt") ON "BankReconciliation" TO explore_reader;
GRANT SELECT ("id", "reconciliationId", "txnDate", "description", "reference", "amount", "direction", "matchedTransactionId", "excludedAt", "excludedById", "excludeReason", "createdAt") ON "BankStatementLine" TO explore_reader;
GRANT SELECT ("id", "companyId", "requisitionNo", "status", "category", "purpose", "notes", "projectId", "siteId", "amount", "currency", "exchangeRate", "rateSource", "baseTotal", "requestedById", "neededBy", "submittedAt", "approvedById", "approvedAt", "approvedAmount", "decisionNote", "disbursedById", "disbursedAt", "bankAccountId", "acquittedAt", "acquittedAmount", "receiptsWaivedById", "receiptWaiverNote", "purchaseOrderId", "expenseTypeId", "payeeVendorId", "approverId", "approvalLimit", "rejectReason", "paidAmount", "paidToId", "payoutMethod", "payoutReference", "receiptsDueAt", "acquittedById", "changeAmount", "changeAccountId", "acquittalNote", "cancelledAt", "cancelledById", "createdAt", "updatedAt") ON "CrmRequisition" TO explore_reader;
GRANT SELECT ("id", "companyId", "logId", "direction", "category", "amount", "currency", "exchangeRate", "rateSource", "baseTotal", "description", "projectId", "requisitionId", "invoiceDocumentId", "receiptUrl", "receiptPathname", "clientEntryId", "createdAt", "updatedAt") ON "CrmDailyCostEntry" TO explore_reader;
GRANT SELECT ("id", "companyId", "claimNo", "status", "claimantId", "currency", "exchangeRate", "rateSource", "baseTotal", "total", "notes", "dailyLogId", "needsReview", "reviewNote", "submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "decisionNote", "paidById", "paidAt", "bankAccountId", "voidedAt", "voidedById", "voidReason", "createdById", "createdAt", "updatedAt") ON "ExpenseClaim" TO explore_reader;
