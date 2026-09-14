-- B5 — a fee document now says whether the ledger knows about it.
--
-- Every school fee posting is emitted after the money transaction has
-- committed: the receipt is written, the transaction closes, and only then is
-- `emitSchoolFeeAccountingEvent` called. When that call failed the outcome went
-- to `console.error` and into a response body, and nothing was written down. So
-- a school could take $450 at the counter, hand the parent a receipt, and have
-- no journal entry for it — and no query anywhere that would find the receipt
-- again. That is the defect these four columns close.
--
-- The shape follows fiscalisation rather than inventing a second one. A
-- `FiscalReceipt` row is written PENDING before the connector is dialled, so a
-- crash leaves something for `/api/accounting/fiscalisation/replay` to drain.
-- The same ordering applies here: the route sets `accountingStatus` to PENDING
-- inside the transaction that moves the money, and overwrites it with the
-- posting engine's answer afterwards. A process that dies between the two
-- leaves a PENDING row, which is exactly what the unposted query looks for.
--
-- Four columns, one set per document, describing its **most recent** posting.
-- A receipt posts when it is taken and again, inverted, when it is voided; an
-- invoice posts at issue and again at write-off. Keeping a row per posting
-- would model history nobody asks for. The question that has to be answerable
-- is "is the ledger in step with this document as it now stands, and if not
-- why", and the document's own `status` says which posting that was.
--
-- Rollback:
--   ALTER TABLE "SchoolFeeInvoice"
--     DROP COLUMN "accountingStatus", DROP COLUMN "journalEntryId",
--     DROP COLUMN "accountingPostedAt", DROP COLUMN "accountingError";
--   (and the same for "SchoolFeeReceipt", "SchoolFeeWaiver", "SchoolFeeRefund")
--   DROP TYPE "SchoolFeePostingStatus";

CREATE TYPE "SchoolFeePostingStatus" AS ENUM ('NOT_REQUIRED', 'POSTED', 'PENDING', 'FAILED');

ALTER TABLE "SchoolFeeInvoice"
    ADD COLUMN "accountingStatus" "SchoolFeePostingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    ADD COLUMN "journalEntryId" TEXT,
    ADD COLUMN "accountingPostedAt" TIMESTAMP(3),
    ADD COLUMN "accountingError" TEXT;

ALTER TABLE "SchoolFeeReceipt"
    ADD COLUMN "accountingStatus" "SchoolFeePostingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    ADD COLUMN "journalEntryId" TEXT,
    ADD COLUMN "accountingPostedAt" TIMESTAMP(3),
    ADD COLUMN "accountingError" TEXT;

ALTER TABLE "SchoolFeeWaiver"
    ADD COLUMN "accountingStatus" "SchoolFeePostingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    ADD COLUMN "journalEntryId" TEXT,
    ADD COLUMN "accountingPostedAt" TIMESTAMP(3),
    ADD COLUMN "accountingError" TEXT;

ALTER TABLE "SchoolFeeRefund"
    ADD COLUMN "accountingStatus" "SchoolFeePostingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    ADD COLUMN "journalEntryId" TEXT,
    ADD COLUMN "accountingPostedAt" TIMESTAMP(3),
    ADD COLUMN "accountingError" TEXT;

CREATE INDEX "SchoolFeeInvoice_companyId_accountingStatus_idx" ON "SchoolFeeInvoice"("companyId", "accountingStatus");
CREATE INDEX "SchoolFeeReceipt_companyId_accountingStatus_idx" ON "SchoolFeeReceipt"("companyId", "accountingStatus");
CREATE INDEX "SchoolFeeWaiver_companyId_accountingStatus_idx" ON "SchoolFeeWaiver"("companyId", "accountingStatus");
CREATE INDEX "SchoolFeeRefund_companyId_accountingStatus_idx" ON "SchoolFeeRefund"("companyId", "accountingStatus");

-- The backfill, and the reason there is one.
--
-- Leaving every existing row at NOT_REQUIRED would say "this document was never
-- meant to reach the ledger", which is false for every receipt already taken and
-- every invoice already issued, and it would hide precisely the rows the finding
-- is about: the ones that posted nothing. So each document that should have
-- posted is matched against the journal entry it would have written, by the
-- source id `emitSchoolFeeAccountingEvent` builds — `SCHOOL_FEE_RECEIPT:<id>`
-- and friends, unchanged since S-2.3.
--
-- Three outcomes. A journal entry exists: POSTED, with its id and posting time.
-- No entry but an `AccountingIntegrationEvent` carrying an error: FAILED, with
-- the engine's own words. Neither: PENDING, because the posting was never
-- attempted or died before it recorded anything, and "not yet" is the truthful
-- answer for a document nobody has looked at. PENDING is also the safe answer:
-- it puts the row on the unposted list, where a person decides.
--
-- Documents that were never supposed to post keep NOT_REQUIRED and are not
-- touched: DRAFT invoices and receipts, waivers short of APPLIED, refunds short
-- of PAID. VOIDED invoices are left alone too — there is no invoice-void posting
-- to be missing, so nothing about them is outstanding.

WITH expected AS (
    SELECT i.id,
           i."companyId",
           CASE WHEN i.status = 'WRITEOFF' THEN 'SCHOOL_FEE_WRITE_OFF'::"AccountingSourceType"
                ELSE 'SCHOOL_FEE_INVOICE'::"AccountingSourceType" END AS "sourceType",
           CASE WHEN i.status = 'WRITEOFF' THEN 'SCHOOL_FEE_WRITEOFF:' || i.id
                ELSE 'SCHOOL_FEE_INVOICE:' || i.id END AS "sourceId"
    FROM "SchoolFeeInvoice" i
    WHERE i.status IN ('ISSUED', 'PART_PAID', 'PAID', 'WRITEOFF')
), outcome AS (
    SELECT e.id,
           je.id AS "journalEntryId",
           je."postedAt" AS "postedAt",
           ev."lastError" AS "lastError"
    FROM expected e
    LEFT JOIN "JournalEntry" je
        ON je."companyId" = e."companyId" AND je."sourceType" = e."sourceType" AND je."sourceId" = e."sourceId"
    LEFT JOIN "AccountingIntegrationEvent" ev
        ON ev."companyId" = e."companyId" AND ev."sourceType" = e."sourceType" AND ev."sourceId" = e."sourceId"
)
UPDATE "SchoolFeeInvoice" i
SET "accountingStatus" = CASE
        WHEN o."journalEntryId" IS NOT NULL THEN 'POSTED'::"SchoolFeePostingStatus"
        WHEN o."lastError" IS NOT NULL THEN 'FAILED'::"SchoolFeePostingStatus"
        ELSE 'PENDING'::"SchoolFeePostingStatus" END,
    "journalEntryId" = o."journalEntryId",
    "accountingPostedAt" = o."postedAt",
    "accountingError" = CASE WHEN o."journalEntryId" IS NULL
        THEN COALESCE(o."lastError", 'Issued before the posting outcome was recorded; no journal entry found for it') END
FROM outcome o
WHERE o.id = i.id;

WITH expected AS (
    SELECT r.id,
           r."companyId",
           CASE WHEN r.status = 'VOIDED' THEN 'SCHOOL_FEE_RECEIPT_VOID'::"AccountingSourceType"
                ELSE 'SCHOOL_FEE_RECEIPT'::"AccountingSourceType" END AS "sourceType",
           CASE WHEN r.status = 'VOIDED' THEN 'SCHOOL_FEE_RECEIPT_VOID:' || r.id
                ELSE 'SCHOOL_FEE_RECEIPT:' || r.id END AS "sourceId"
    FROM "SchoolFeeReceipt" r
    WHERE r.status IN ('POSTED', 'VOIDED')
), outcome AS (
    SELECT e.id,
           je.id AS "journalEntryId",
           je."postedAt" AS "postedAt",
           ev."lastError" AS "lastError"
    FROM expected e
    LEFT JOIN "JournalEntry" je
        ON je."companyId" = e."companyId" AND je."sourceType" = e."sourceType" AND je."sourceId" = e."sourceId"
    LEFT JOIN "AccountingIntegrationEvent" ev
        ON ev."companyId" = e."companyId" AND ev."sourceType" = e."sourceType" AND ev."sourceId" = e."sourceId"
)
UPDATE "SchoolFeeReceipt" r
SET "accountingStatus" = CASE
        WHEN o."journalEntryId" IS NOT NULL THEN 'POSTED'::"SchoolFeePostingStatus"
        WHEN o."lastError" IS NOT NULL THEN 'FAILED'::"SchoolFeePostingStatus"
        ELSE 'PENDING'::"SchoolFeePostingStatus" END,
    "journalEntryId" = o."journalEntryId",
    "accountingPostedAt" = o."postedAt",
    "accountingError" = CASE WHEN o."journalEntryId" IS NULL
        THEN COALESCE(o."lastError", 'Money taken before the posting outcome was recorded; no journal entry found for it') END
FROM outcome o
WHERE o.id = r.id;

WITH outcome AS (
    SELECT w.id,
           je.id AS "journalEntryId",
           je."postedAt" AS "postedAt",
           ev."lastError" AS "lastError"
    FROM "SchoolFeeWaiver" w
    LEFT JOIN "JournalEntry" je
        ON je."companyId" = w."companyId"
       AND je."sourceType" = 'SCHOOL_FEE_WAIVER'::"AccountingSourceType"
       AND je."sourceId" = 'SCHOOL_FEE_WAIVER:' || w.id
    LEFT JOIN "AccountingIntegrationEvent" ev
        ON ev."companyId" = w."companyId"
       AND ev."sourceType" = 'SCHOOL_FEE_WAIVER'::"AccountingSourceType"
       AND ev."sourceId" = 'SCHOOL_FEE_WAIVER:' || w.id
    WHERE w.status = 'APPLIED'
)
UPDATE "SchoolFeeWaiver" w
SET "accountingStatus" = CASE
        WHEN o."journalEntryId" IS NOT NULL THEN 'POSTED'::"SchoolFeePostingStatus"
        WHEN o."lastError" IS NOT NULL THEN 'FAILED'::"SchoolFeePostingStatus"
        ELSE 'PENDING'::"SchoolFeePostingStatus" END,
    "journalEntryId" = o."journalEntryId",
    "accountingPostedAt" = o."postedAt",
    "accountingError" = CASE WHEN o."journalEntryId" IS NULL
        THEN COALESCE(o."lastError", 'Applied before the posting outcome was recorded; no journal entry found for it') END
FROM outcome o
WHERE o.id = w.id;

WITH outcome AS (
    SELECT f.id,
           je.id AS "journalEntryId",
           je."postedAt" AS "postedAt",
           ev."lastError" AS "lastError"
    FROM "SchoolFeeRefund" f
    LEFT JOIN "JournalEntry" je
        ON je."companyId" = f."companyId"
       AND je."sourceType" = 'SCHOOL_FEE_REFUND'::"AccountingSourceType"
       AND je."sourceId" = 'SCHOOL_FEE_REFUND:' || f.id
    LEFT JOIN "AccountingIntegrationEvent" ev
        ON ev."companyId" = f."companyId"
       AND ev."sourceType" = 'SCHOOL_FEE_REFUND'::"AccountingSourceType"
       AND ev."sourceId" = 'SCHOOL_FEE_REFUND:' || f.id
    WHERE f.status = 'PAID'
)
UPDATE "SchoolFeeRefund" f
SET "accountingStatus" = CASE
        WHEN o."journalEntryId" IS NOT NULL THEN 'POSTED'::"SchoolFeePostingStatus"
        WHEN o."lastError" IS NOT NULL THEN 'FAILED'::"SchoolFeePostingStatus"
        ELSE 'PENDING'::"SchoolFeePostingStatus" END,
    "journalEntryId" = o."journalEntryId",
    "accountingPostedAt" = o."postedAt",
    "accountingError" = CASE WHEN o."journalEntryId" IS NULL
        THEN COALESCE(o."lastError", 'Paid before the posting outcome was recorded; no journal entry found for it') END
FROM outcome o
WHERE o.id = f.id;
