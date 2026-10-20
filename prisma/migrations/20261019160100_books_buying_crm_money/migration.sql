-- P2 (books-final §7 and §8, approved 19 Oct): buying and CRM money.
--   D5   PurchasePayment: Draft → To approve → Approved → Paid → Voided, with who approved and
--        who voided. Every existing row was money that left, so it is PAID (the default).
--   D8   A draft requisition or supplier payment carries no number: given at Send for approval / Pay.
--   D10  RetailApprovalSettings becomes the company's money limits: paymentOwnerOver (bills and
--        supplier payments), journalSecondOver (manual journals), voucherHolderUnder (petty cash).
--   D11  RetailPurchaseOrder: optional site (one PO table for retail and everyone else), and the
--        approval snapshot an order over the limit waits with.
--   D12  PurchaseBill.goodsReceiptId and purchaseOrderId (the three-way match). Posted goods
--        receipts with no bill get a draft bill flagged for review; drafts post nothing, so no
--        past month's figures change.
--   D13  ExpenseClaim and ExpenseClaimLine; BankAccount.isFloat, imprestAmount, holderId;
--        PettyCashVoucher. Cost-tracker spends with no requisition since the last close become
--        submitted claims, flagged for review (below).
--   D16  PurchaseBill.supplierFtiNumber, fdmsStatus (NOT_CHECKED until someone checks), fdmsCheckedAt.
--   D19  CrmCommissionEntry: approvedAt, paidById, journalEntryId and void fields. Approved and
--        unpaid commission is queued to post in the current month; paid history stays as it is.
-- Idempotent: every backfill touches only rows it has not touched before.

-- CreateEnum
CREATE TYPE "FdmsCheckStatus" AS ENUM ('NOT_CHECKED', 'VALID', 'NOT_VALID');
CREATE TYPE "PurchasePaymentStatus" AS ENUM ('DRAFT', 'TO_APPROVE', 'APPROVED', 'PAID', 'VOIDED');
CREATE TYPE "ExpenseClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'VOIDED');
CREATE TYPE "PettyCashVoucherKind" AS ENUM ('SPEND', 'TOP_UP');
CREATE TYPE "PettyCashVoucherStatus" AS ENUM ('DRAFT', 'TO_APPROVE', 'POSTED', 'VOIDED');

-- AlterTable
ALTER TABLE "RetailApprovalSettings" ADD COLUMN "paymentOwnerOver" DECIMAL(14,2) NOT NULL DEFAULT 500,
ADD COLUMN "journalSecondOver" DECIMAL(14,2) NOT NULL DEFAULT 1000,
ADD COLUMN "voucherHolderUnder" DECIMAL(14,2) NOT NULL DEFAULT 20;

ALTER TABLE "CrmRequisition" ALTER COLUMN "requisitionNo" DROP NOT NULL;

ALTER TABLE "RetailPurchaseOrder" ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "approverId" TEXT,
ADD COLUMN "approvalLimit" DECIMAL(14,2),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "decisionNote" TEXT,
ALTER COLUMN "siteId" DROP NOT NULL;

ALTER TABLE "PurchaseBill" ADD COLUMN "goodsReceiptId" TEXT,
ADD COLUMN "purchaseOrderId" TEXT,
ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "supplierFtiNumber" TEXT,
ADD COLUMN "fdmsStatus" "FdmsCheckStatus" NOT NULL DEFAULT 'NOT_CHECKED',
ADD COLUMN "fdmsCheckedAt" TIMESTAMP(3),
ADD COLUMN "fdmsCheckedById" TEXT,
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3);

ALTER TABLE "PurchasePayment" ADD COLUMN "status" "PurchasePaymentStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "approverId" TEXT,
ADD COLUMN "approvalLimit" DECIMAL(14,2),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "paidById" TEXT,
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidedById" TEXT,
ADD COLUMN "voidReason" TEXT,
ALTER COLUMN "paymentNumber" DROP NOT NULL;

ALTER TABLE "BankAccount" ADD COLUMN "isFloat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "imprestAmount" DECIMAL(14,2),
ADD COLUMN "holderId" TEXT;

ALTER TABLE "CrmCommissionEntry" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "paidById" TEXT,
ADD COLUMN "paidBankAccountId" TEXT,
ADD COLUMN "journalEntryId" TEXT,
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidedById" TEXT;

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "claimNo" TEXT,
    "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "claimantId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "dailyLogId" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approverId" TEXT,
    "approvalLimit" DECIMAL(14,2),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "bankAccountId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseClaimLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "category" "CrmRequisitionCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "spentOn" TIMESTAMP(3),
    "amount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ftiNumber" TEXT,
    "fdmsStatus" "FdmsCheckStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "expenseAccountId" TEXT,
    "projectId" TEXT,
    "costCenterId" TEXT,
    "receiptUrl" TEXT,
    "costEntryId" TEXT,
    "alreadyPostedEntryId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseClaimLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PettyCashVoucher" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "voucherNo" TEXT,
    "kind" "PettyCashVoucherKind" NOT NULL DEFAULT 'SPEND',
    "status" "PettyCashVoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "bankAccountId" TEXT NOT NULL,
    "fromBankAccountId" TEXT,
    "category" "CrmRequisitionCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ftiNumber" TEXT,
    "fdmsStatus" "FdmsCheckStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "expenseAccountId" TEXT,
    "projectId" TEXT,
    "costCenterId" TEXT,
    "receiptUrl" TEXT,
    "spentAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseClaim_dailyLogId_key" ON "ExpenseClaim"("dailyLogId");
CREATE INDEX "ExpenseClaim_companyId_status_createdAt_idx" ON "ExpenseClaim"("companyId", "status", "createdAt");
CREATE INDEX "ExpenseClaim_companyId_claimantId_status_idx" ON "ExpenseClaim"("companyId", "claimantId", "status");
CREATE UNIQUE INDEX "ExpenseClaim_companyId_claimNo_key" ON "ExpenseClaim"("companyId", "claimNo");
CREATE UNIQUE INDEX "ExpenseClaimLine_costEntryId_key" ON "ExpenseClaimLine"("costEntryId");
CREATE INDEX "ExpenseClaimLine_claimId_idx" ON "ExpenseClaimLine"("claimId");
CREATE INDEX "ExpenseClaimLine_companyId_idx" ON "ExpenseClaimLine"("companyId");
CREATE INDEX "PettyCashVoucher_companyId_bankAccountId_status_idx" ON "PettyCashVoucher"("companyId", "bankAccountId", "status");
CREATE UNIQUE INDEX "PettyCashVoucher_companyId_voucherNo_key" ON "PettyCashVoucher"("companyId", "voucherNo");
CREATE UNIQUE INDEX "PurchaseBill_goodsReceiptId_key" ON "PurchaseBill"("goodsReceiptId");

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "RetailGoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "RetailPurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaimLine" ADD CONSTRAINT "ExpenseClaimLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaimLine" ADD CONSTRAINT "ExpenseClaimLine_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PettyCashVoucher" ADD CONSTRAINT "PettyCashVoucher_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PettyCashVoucher" ADD CONSTRAINT "PettyCashVoucher_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PettyCashVoucher" ADD CONSTRAINT "PettyCashVoucher_fromBankAccountId_fkey" FOREIGN KEY ("fromBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Backfill D12: a draft bill for every posted goods receipt with none, flagged for review. ──
-- Its lines are the receipt's, at cost ex VAT with the product's VAT rate; a draft posts nothing.
INSERT INTO "PurchaseBill" ("id", "companyId", "vendorId", "billNumber", "billDate", "status", "currency",
                            "subTotal", "taxTotal", "total", "notes", "goodsReceiptId", "purchaseOrderId",
                            "needsReview", "createdById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, g."companyId", g."vendorId", NULL, COALESCE(g."postedAt", g."checkedAt", g."createdAt"), 'DRAFT', 'USD',
       COALESCE(t.net, 0), COALESCE(t.tax, 0), COALESCE(t.net, 0) + COALESCE(t.tax, 0),
       'From goods receipt ' || g."receiptNo" || '. Check it against the supplier''s fiscal tax invoice before recording it.',
       g."id", g."purchaseOrderId", true, g."checkedById", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "RetailGoodsReceipt" g
LEFT JOIN LATERAL (
  SELECT sum(l."lineTotal")::float8 AS net, sum(round(l."lineTotal" * l."vatRate" / 100, 2))::float8 AS tax
  FROM "RetailGoodsReceiptLine" l WHERE l."receiptId" = g."id" AND l."quantity" > 0
) t ON true
WHERE g."status" = 'POSTED'
  AND NOT EXISTS (SELECT 1 FROM "PurchaseBill" b WHERE b."goodsReceiptId" = g."id");

INSERT INTO "PurchaseBillLine" ("id", "billId", "description", "quantity", "unitPrice", "taxRate", "taxAmount", "lineTotal", "createdAt")
SELECT gen_random_uuid()::text, b."id", l."itemName", l."quantity"::float8, l."unitCost"::float8, l."vatRate"::float8,
       round(l."lineTotal" * l."vatRate" / 100, 2)::float8, (l."lineTotal" + round(l."lineTotal" * l."vatRate" / 100, 2))::float8, CURRENT_TIMESTAMP
FROM "PurchaseBill" b
JOIN "RetailGoodsReceiptLine" l ON l."receiptId" = b."goodsReceiptId" AND l."quantity" > 0
WHERE b."needsReview" AND b."status" = 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM "PurchaseBillLine" x WHERE x."billId" = b."id");

-- ── Backfill D13: cost-tracker spends with no requisition since the last close become claims. ──
-- One submitted claim per person per day, flagged for review, numbered CLM-n after the series.
-- "Since the last close": after the latest closed month's end and the freeze date, whichever is later.
-- A spend already on the ledger on its own (Dr expense, Cr 2000) keeps its journal: the claim
-- line notes it, and approving the claim only moves that payable to 2190, so nothing is expensed
-- twice. A spend still waiting to post now posts with its claim: its waiting event is removed.
DROP TABLE IF EXISTS "_p2_claim_days";
CREATE TEMP TABLE "_p2_claim_days" AS
SELECT l."id" AS "logId", l."companyId", l."userId", l."logDate", l."submittedAt",
       min(e."currency") AS "currency", sum(e."amount") AS "total"
FROM "CrmDailyLog" l
JOIN "CrmDailyCostEntry" e ON e."logId" = l."id" AND e."direction" = 'SPENT' AND e."requisitionId" IS NULL
LEFT JOIN "AccountingSettings" s ON s."companyId" = l."companyId"
WHERE NOT EXISTS (SELECT 1 FROM "ExpenseClaim" c WHERE c."dailyLogId" = l."id")
  AND NOT EXISTS (SELECT 1 FROM "ExpenseClaimLine" x WHERE x."costEntryId" = e."id")
  AND l."logDate" > COALESCE(GREATEST(
        (SELECT max(p."endDate") FROM "AccountingPeriod" p WHERE p."companyId" = l."companyId" AND p."status" = 'CLOSED'),
        s."freezeBeforeDate"), TIMESTAMP '1900-01-01')
GROUP BY l."id", l."companyId", l."userId", l."logDate", l."submittedAt";

INSERT INTO "ExpenseClaim" ("id", "companyId", "claimNo", "status", "claimantId", "currency", "total", "notes",
                            "dailyLogId", "needsReview", "reviewNote", "submittedAt", "approvalLimit", "createdById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, d."companyId",
       'CLM-' || lpad((row_number() OVER (PARTITION BY d."companyId" ORDER BY d."logDate", d."logId")
                      + COALESCE((SELECT q."lastNumber" FROM "IdSequence" q WHERE q."companyId" = d."companyId" AND q."entityKey" = 'EXPENSE_CLAIM' AND q."scopeKey" = 'GLOBAL'), 0))::text, 4, '0'),
       'SUBMITTED', d."userId", COALESCE(d."currency", 'USD'), d."total",
       'Spent from their own pocket on ' || to_char(d."logDate", 'FMDD Mon YYYY') || ', from the cost tracker.',
       d."logId", true, 'Made from the cost tracker when claims began. Check the lines and receipts before approving.',
       COALESCE(d."submittedAt", CURRENT_TIMESTAMP),
       COALESCE((SELECT r."requisitionOwnerOver" FROM "RetailApprovalSettings" r WHERE r."companyId" = d."companyId"), 500),
       d."userId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_p2_claim_days" d;

INSERT INTO "ExpenseClaimLine" ("id", "companyId", "claimId", "category", "description", "spentOn", "amount", "projectId",
                                "costCenterId", "receiptUrl", "costEntryId", "alreadyPostedEntryId", "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, e."companyId", c."id", e."category", e."description", l."logDate", e."amount", e."projectId",
       p."costCenterId", e."receiptUrl", e."id",
       (SELECT j."id" FROM "JournalEntry" j WHERE j."companyId" = e."companyId" AND j."sourceType" = 'CRM_COST_ENTRY_SPEND' AND j."sourceId" = e."id" LIMIT 1),
       (row_number() OVER (PARTITION BY c."id" ORDER BY e."createdAt", e."id"))::int, CURRENT_TIMESTAMP
FROM "_p2_claim_days" d
JOIN "ExpenseClaim" c ON c."dailyLogId" = d."logId"
JOIN "CrmDailyLog" l ON l."id" = d."logId"
JOIN "CrmDailyCostEntry" e ON e."logId" = d."logId" AND e."direction" = 'SPENT' AND e."requisitionId" IS NULL
LEFT JOIN "CrmProject" p ON p."id" = e."projectId"
WHERE NOT EXISTS (SELECT 1 FROM "ExpenseClaimLine" x WHERE x."costEntryId" = e."id");

DELETE FROM "AccountingIntegrationEvent" a
USING "ExpenseClaimLine" x
WHERE a."sourceType" = 'CRM_COST_ENTRY_SPEND' AND a."sourceId" = x."costEntryId" AND a."companyId" = x."companyId"
  AND a."status" IN ('PENDING', 'FAILED') AND x."alreadyPostedEntryId" IS NULL;

DROP TABLE "_p2_claim_days";

-- The claims series continues after the numbers given here.
INSERT INTO "IdSequence" ("id", "companyId", "entityKey", "scopeKey", "lastNumber", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."companyId", 'EXPENSE_CLAIM', 'GLOBAL', max(substring(c."claimNo" FROM '^CLM-([0-9]{1,9})$')::int), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ExpenseClaim" c WHERE c."claimNo" IS NOT NULL GROUP BY c."companyId"
ON CONFLICT ("companyId", "entityKey", "scopeKey") DO UPDATE
SET "lastNumber" = GREATEST("IdSequence"."lastNumber", EXCLUDED."lastNumber"), "updatedAt" = CURRENT_TIMESTAMP;

-- ── Backfill D19: approved, unpaid commission waits to post in the current month. ──
-- Paid commission before today has no posting and keeps none; it is listed as it was.
INSERT INTO "AccountingIntegrationEvent" ("id", "companyId", "sourceDomain", "sourceAction", "sourceType", "sourceId", "eventKey",
                                          "entryDate", "description", "amount", "netAmount", "taxAmount", "grossAmount",
                                          "currency", "status", "createdById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."companyId", 'accounting', 'auto-post', 'CRM_COMMISSION', c."id",
       lower(c."companyId") || ':accounting:auto-post:crm_commission:' || lower(c."id"),
       CURRENT_TIMESTAMP,
       'Commission approved before it posted (' || c."periodKey" || ')', c."amount", c."amount", 0, c."amount",
       c."currency", 'PENDING', c."approvedById", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CrmCommissionEntry" c
WHERE c."status" = 'APPROVED' AND c."amount" > 0
  AND NOT EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j."companyId" = c."companyId" AND j."sourceType" = 'CRM_COMMISSION' AND j."sourceId" = c."id")
ON CONFLICT ("eventKey") DO NOTHING;

-- Vane's reader reaches the new tables and columns, as `pnpm vane:reader-sql` prints them.
GRANT SELECT ("id", "companyId", "poNo", "siteId", "vendorId", "status", "submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "decisionNote", "expectedDate", "firstExpectedDate", "payment", "noteToSupplier", "createdById", "sentAt", "sentById", "sentVia", "chaseAction", "chasedAt", "chasedById", "followUpDoneAt", "madeByVane", "closedAt", "closedById", "closeNote", "cancelledAt", "cancelledById", "duplicatedFromId", "archivedAt", "createdAt", "updatedAt") ON "RetailPurchaseOrder" TO vane_reader;
GRANT SELECT ("companyId", "requisitionOwnerOver", "ownerApproverId", "priceChanges", "belowCostNeedsOwner", "countDifferences", "countOwnerOver", "accountOwnerOver", "paymentOwnerOver", "journalSecondOver", "voucherHolderUnder", "askBy", "updatedById", "createdAt", "updatedAt") ON "RetailApprovalSettings" TO vane_reader;
GRANT SELECT ("id", "companyId", "vendorId", "billNumber", "billDate", "dueDate", "status", "currency", "subTotal", "taxTotal", "total", "amountPaid", "debitNoteTotal", "writeOffTotal", "notes", "createdById", "issuedById", "issuedAt", "goodsReceiptId", "purchaseOrderId", "needsReview", "supplierFtiNumber", "fdmsStatus", "fdmsCheckedAt", "fdmsCheckedById", "approvedById", "approvedAt", "createdAt", "updatedAt") ON "PurchaseBill" TO vane_reader;
GRANT SELECT ("id", "companyId", "billId", "paymentNumber", "status", "submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "paidById", "voidedAt", "voidedById", "voidReason", "paidAt", "amount", "method", "reference", "bankAccountId", "createdById", "createdAt", "vendorId", "groupNo", "requisitionId") ON "PurchasePayment" TO vane_reader;
GRANT SELECT ("id", "companyId", "name", "bankName", "accountNumber", "currency", "openingBalance", "isActive", "accountName", "showOnDocuments", "documentPosition", "kind", "ledgerAccountId", "isFloat", "imprestAmount", "holderId", "createdAt", "updatedAt") ON "BankAccount" TO vane_reader;
GRANT SELECT ("id", "companyId", "repId", "leadId", "leadDocumentId", "ruleId", "basis", "periodKey", "baseAmount", "ratePercent", "amount", "currency", "status", "approvedById", "approvedAt", "paidById", "paidBankAccountId", "journalEntryId", "voidedAt", "voidedById", "paidAt", "notes", "calculatedAt", "createdAt", "updatedAt") ON "CrmCommissionEntry" TO vane_reader;
ALTER TABLE "ExpenseClaim" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ExpenseClaim" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ExpenseClaim" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "claimNo", "status", "claimantId", "currency", "total", "notes", "dailyLogId", "needsReview", "reviewNote", "submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "decisionNote", "paidById", "paidAt", "bankAccountId", "voidedAt", "voidedById", "voidReason", "createdById", "createdAt", "updatedAt") ON "ExpenseClaim" TO vane_reader;
ALTER TABLE "ExpenseClaimLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ExpenseClaimLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ExpenseClaimLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "claimId", "category", "description", "spentOn", "amount", "taxAmount", "ftiNumber", "fdmsStatus", "expenseAccountId", "projectId", "costCenterId", "receiptUrl", "costEntryId", "alreadyPostedEntryId", "sortOrder", "createdAt") ON "ExpenseClaimLine" TO vane_reader;
ALTER TABLE "PettyCashVoucher" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PettyCashVoucher" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PettyCashVoucher" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "voucherNo", "kind", "status", "bankAccountId", "fromBankAccountId", "category", "description", "amount", "taxAmount", "ftiNumber", "fdmsStatus", "expenseAccountId", "projectId", "costCenterId", "receiptUrl", "spentAt", "createdById", "approvedById", "approvedAt", "postedAt", "voidedAt", "voidedById", "voidReason", "createdAt", "updatedAt") ON "PettyCashVoucher" TO vane_reader;

-- Explore's reader too, as `pnpm explore:reader-sql` prints them.
GRANT SELECT ("id", "companyId", "poNo", "siteId", "vendorId", "status", "submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "decisionNote", "expectedDate", "firstExpectedDate", "payment", "noteToSupplier", "createdById", "sentAt", "sentById", "sentVia", "chaseAction", "chasedAt", "chasedById", "followUpDoneAt", "madeByVane", "closedAt", "closedById", "closeNote", "cancelledAt", "cancelledById", "duplicatedFromId", "archivedAt", "createdAt", "updatedAt") ON "RetailPurchaseOrder" TO explore_reader;
GRANT SELECT ("companyId", "requisitionOwnerOver", "ownerApproverId", "priceChanges", "belowCostNeedsOwner", "countDifferences", "countOwnerOver", "accountOwnerOver", "paymentOwnerOver", "journalSecondOver", "voucherHolderUnder", "askBy", "updatedById", "createdAt", "updatedAt") ON "RetailApprovalSettings" TO explore_reader;
GRANT SELECT ("id", "companyId", "vendorId", "billNumber", "billDate", "dueDate", "status", "currency", "subTotal", "taxTotal", "total", "amountPaid", "debitNoteTotal", "writeOffTotal", "notes", "createdById", "issuedById", "issuedAt", "goodsReceiptId", "purchaseOrderId", "needsReview", "supplierFtiNumber", "fdmsStatus", "fdmsCheckedAt", "fdmsCheckedById", "approvedById", "approvedAt", "createdAt", "updatedAt") ON "PurchaseBill" TO explore_reader;
GRANT SELECT ("id", "companyId", "billId", "paymentNumber", "status", "submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "paidById", "voidedAt", "voidedById", "voidReason", "paidAt", "amount", "method", "reference", "bankAccountId", "createdById", "createdAt", "vendorId", "groupNo", "requisitionId") ON "PurchasePayment" TO explore_reader;
GRANT SELECT ("id", "companyId", "name", "bankName", "accountNumber", "currency", "openingBalance", "isActive", "accountName", "showOnDocuments", "documentPosition", "kind", "ledgerAccountId", "isFloat", "imprestAmount", "holderId", "createdAt", "updatedAt") ON "BankAccount" TO explore_reader;
GRANT SELECT ("id", "companyId", "repId", "leadId", "leadDocumentId", "ruleId", "basis", "periodKey", "baseAmount", "ratePercent", "amount", "currency", "status", "approvedById", "approvedAt", "paidById", "paidBankAccountId", "journalEntryId", "voidedAt", "voidedById", "paidAt", "notes", "calculatedAt", "createdAt", "updatedAt") ON "CrmCommissionEntry" TO explore_reader;
CREATE POLICY "explore_workspace" ON "ExpenseClaim" AS RESTRICTIVE FOR SELECT TO explore_reader USING ('ExpenseClaim' = ANY (COALESCE((SELECT s."tables" FROM "ExploreReaderScope" s WHERE s."pid" = pg_backend_pid()), ARRAY[]::text[])) AND "companyId" = (SELECT s."companyId" FROM "ExploreReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "claimNo", "status", "claimantId", "currency", "total", "notes", "dailyLogId", "needsReview", "reviewNote", "submittedAt", "approverId", "approvalLimit", "approvedById", "approvedAt", "decisionNote", "paidById", "paidAt", "bankAccountId", "voidedAt", "voidedById", "voidReason", "createdById", "createdAt", "updatedAt") ON "ExpenseClaim" TO explore_reader;
CREATE POLICY "explore_workspace" ON "ExpenseClaimLine" AS RESTRICTIVE FOR SELECT TO explore_reader USING ('ExpenseClaimLine' = ANY (COALESCE((SELECT s."tables" FROM "ExploreReaderScope" s WHERE s."pid" = pg_backend_pid()), ARRAY[]::text[])) AND "companyId" = (SELECT s."companyId" FROM "ExploreReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "claimId", "category", "description", "spentOn", "amount", "taxAmount", "ftiNumber", "fdmsStatus", "expenseAccountId", "projectId", "costCenterId", "receiptUrl", "costEntryId", "alreadyPostedEntryId", "sortOrder", "createdAt") ON "ExpenseClaimLine" TO explore_reader;
CREATE POLICY "explore_workspace" ON "PettyCashVoucher" AS RESTRICTIVE FOR SELECT TO explore_reader USING ('PettyCashVoucher' = ANY (COALESCE((SELECT s."tables" FROM "ExploreReaderScope" s WHERE s."pid" = pg_backend_pid()), ARRAY[]::text[])) AND "companyId" = (SELECT s."companyId" FROM "ExploreReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "voucherNo", "kind", "status", "bankAccountId", "fromBankAccountId", "category", "description", "amount", "taxAmount", "ftiNumber", "fdmsStatus", "expenseAccountId", "projectId", "costCenterId", "receiptUrl", "spentAt", "createdById", "approvedById", "approvedAt", "postedAt", "voidedAt", "voidedById", "voidReason", "createdAt", "updatedAt") ON "PettyCashVoucher" TO explore_reader;
