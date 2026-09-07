-- S-2.5 and S-2.6 — one migration, because a refund is drawn against a credit
-- and neither half is coherent without the other.
--
-- =============================================================================
-- S-2.5  An overpayment becomes a credit rather than disappearing
-- =============================================================================
--
-- Two surpluses existed and neither was recorded.
--
--   1. A receipt could always carry `amountUnallocated`, but nothing held the
--      three receipt columns in agreement, so any code path was free to write a
--      receipt whose parts did not add up to the whole. The CHECK below makes
--      "allocated + unallocated = received" a property of the row.
--
--   2. `SchoolFeeInvoice.balanceAmount` is computed as
--      `clampAtZero(total - paid - waived - writeOff)`. When a family settled
--      beyond the bill — a full payment followed by a bursary is the ordinary
--      case — the clamp discarded the difference and nothing anywhere held it.
--      `creditAmount` is that difference. `balanceAmount` and `creditAmount`
--      are never both positive, and a CHECK says so, because an invoice cannot
--      simultaneously owe and be owed.
--
-- =============================================================================
-- S-2.6  A bursar can refund a parent
-- =============================================================================
--
-- `SchoolFeeRefund` replaces the 501 stub. Every refund names the credit it
-- draws on: a receipt surplus or an invoice over-payment, exactly one of the
-- two.
--
-- The cap — "a refund may not exceed what is unallocated plus what was
-- over-allocated" — is enforced by the database, not by the route. Requesting a
-- refund increments `refundedAmount` on the source row, and that column carries
-- a CHECK against the credit available on the same row. This is a single-row
-- check, which is what makes it possible at all: two bursars refunding the same
-- $50 at the same instant produce one refund and one constraint violation, and
-- no amount of application-side reading can promise that.
--
-- The same constraint does a second job. Allocating a receipt's credit forward
-- to a later invoice reduces `amountUnallocated`; the CHECK therefore refuses
-- to let credit be allocated away from under a refund that is waiting to be
-- paid.
--
-- Rollback (the whole file):
--   DROP TABLE "SchoolFeeRefund";
--   DROP TYPE "SchoolFeeRefundStatus";
--   ALTER TABLE "SchoolFeeInvoice"
--     DROP CONSTRAINT "SchoolFeeInvoice_credit_nonneg_check",
--     DROP CONSTRAINT "SchoolFeeInvoice_balance_nonneg_check",
--     DROP CONSTRAINT "SchoolFeeInvoice_credit_xor_balance_check",
--     DROP CONSTRAINT "SchoolFeeInvoice_refunded_within_credit_check",
--     DROP COLUMN "creditAmount",
--     DROP COLUMN "refundedAmount";
--   ALTER TABLE "SchoolFeeReceipt"
--     DROP CONSTRAINT "SchoolFeeReceipt_amount_positive_check",
--     DROP CONSTRAINT "SchoolFeeReceipt_split_adds_up_check",
--     DROP CONSTRAINT "SchoolFeeReceipt_refunded_within_unallocated_check",
--     DROP COLUMN "refundedAmount";
--   ALTER TABLE "SchoolFeeReceiptAllocation"
--     DROP CONSTRAINT "SchoolFeeReceiptAllocation_positive_check";

-- -----------------------------------------------------------------------------
-- 1. Invoice: the over-payment that used to be clamped away, and its hold.
-- -----------------------------------------------------------------------------
ALTER TABLE "SchoolFeeInvoice"
    ADD COLUMN "creditAmount"   DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Backfill: any invoice already settled beyond its total has been carrying an
-- unrecorded credit. There is no live data on this database, but a school that
-- had run for a term would have some, and the column must be true from the
-- moment it exists rather than from the next time the invoice is touched.
UPDATE "SchoolFeeInvoice"
SET "creditAmount" = ROUND(
        GREATEST("paidAmount" + "waivedAmount" + "writeOffAmount" - "totalAmount", 0), 2)
WHERE "paidAmount" + "waivedAmount" + "writeOffAmount" > "totalAmount";

ALTER TABLE "SchoolFeeInvoice"
    ADD CONSTRAINT "SchoolFeeInvoice_credit_nonneg_check"
        CHECK ("creditAmount" >= 0),
    ADD CONSTRAINT "SchoolFeeInvoice_balance_nonneg_check"
        CHECK ("balanceAmount" >= 0),
    -- An invoice either owes or is owed. Never both.
    ADD CONSTRAINT "SchoolFeeInvoice_credit_xor_balance_check"
        CHECK (NOT ("creditAmount" > 0 AND "balanceAmount" > 0)),
    -- S-2.6: a refund may not exceed the over-payment it claims to return.
    ADD CONSTRAINT "SchoolFeeInvoice_refunded_within_credit_check"
        CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "creditAmount");

-- -----------------------------------------------------------------------------
-- 2. Receipt: the three amounts must add up, and credit must survive.
-- -----------------------------------------------------------------------------
ALTER TABLE "SchoolFeeReceipt"
    ADD COLUMN "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Backfill: repair any receipt whose split does not add up before the CHECK
-- that forbids it is added, so the migration cannot fail on legacy rows. The
-- allocated figure is the one derived from allocation rows, so the unallocated
-- remainder is what gets corrected.
UPDATE "SchoolFeeReceipt"
SET "amountUnallocated" = ROUND("amountReceived" - "amountAllocated", 2)
WHERE ROUND("amountAllocated" + "amountUnallocated", 2) <> ROUND("amountReceived", 2);

ALTER TABLE "SchoolFeeReceipt"
    ADD CONSTRAINT "SchoolFeeReceipt_amount_positive_check"
        CHECK ("amountReceived" > 0
               AND "amountAllocated" >= 0
               AND "amountUnallocated" >= 0),
    -- S-2.5: the whole of what was received is accounted for, always. A path
    -- that drops the surplus cannot commit.
    ADD CONSTRAINT "SchoolFeeReceipt_split_adds_up_check"
        CHECK ("amountAllocated" + "amountUnallocated" = "amountReceived"),
    -- S-2.6: the refundable credit, and nothing beyond it.
    ADD CONSTRAINT "SchoolFeeReceipt_refunded_within_unallocated_check"
        CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amountUnallocated");

-- -----------------------------------------------------------------------------
-- 3. Allocation lines carry real money.
-- -----------------------------------------------------------------------------
DELETE FROM "SchoolFeeReceiptAllocation" WHERE "allocatedAmount" <= 0;

ALTER TABLE "SchoolFeeReceiptAllocation"
    ADD CONSTRAINT "SchoolFeeReceiptAllocation_positive_check"
        CHECK ("allocatedAmount" > 0);

-- -----------------------------------------------------------------------------
-- 4. The refund itself.
-- -----------------------------------------------------------------------------
CREATE TYPE "SchoolFeeRefundStatus" AS ENUM ('REQUESTED', 'PAID', 'CANCELLED');

CREATE TABLE "SchoolFeeRefund" (
    "id"            TEXT NOT NULL,
    "companyId"     TEXT NOT NULL,
    "refundNo"      TEXT NOT NULL,
    "studentId"     TEXT NOT NULL,
    "receiptId"     TEXT,
    "invoiceId"     TEXT,
    "refundDate"    TIMESTAMP(3) NOT NULL,
    "method"        "SchoolFeePaymentMethod" NOT NULL,
    "reference"     TEXT,
    "reason"        TEXT NOT NULL,
    "amount"        DECIMAL(14,2) NOT NULL,
    "currency"      TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate"  DECIMAL(12,4) NOT NULL DEFAULT 1,
    "baseAmount"    DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status"        "SchoolFeeRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes"         TEXT,
    "requestedById" TEXT,
    "paidById"      TEXT,
    "paidAt"        TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFeeRefund_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SchoolFeeRefund"
    -- A refund of nothing is not a refund.
    ADD CONSTRAINT "SchoolFeeRefund_amount_positive_check"
        CHECK ("amount" > 0),
    ADD CONSTRAINT "SchoolFeeRefund_rate_positive_check"
        CHECK ("exchangeRate" > 0),
    ADD CONSTRAINT "SchoolFeeRefund_currency_shape_check"
        CHECK (char_length("currency") BETWEEN 3 AND 10),
    -- Exactly one source. A refund with neither has no credit behind it; a
    -- refund with both would be double-counted against two holds.
    ADD CONSTRAINT "SchoolFeeRefund_one_source_check"
        CHECK (num_nonnulls("receiptId", "invoiceId") = 1);

CREATE UNIQUE INDEX "SchoolFeeRefund_companyId_refundNo_key"
    ON "SchoolFeeRefund" ("companyId", "refundNo");
CREATE INDEX "SchoolFeeRefund_companyId_status_idx"
    ON "SchoolFeeRefund" ("companyId", "status");
CREATE INDEX "SchoolFeeRefund_studentId_refundDate_idx"
    ON "SchoolFeeRefund" ("studentId", "refundDate");
CREATE INDEX "SchoolFeeRefund_receiptId_idx" ON "SchoolFeeRefund" ("receiptId");
CREATE INDEX "SchoolFeeRefund_invoiceId_idx" ON "SchoolFeeRefund" ("invoiceId");

ALTER TABLE "SchoolFeeRefund"
    ADD CONSTRAINT "SchoolFeeRefund_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "SchoolFeeRefund_studentId_fkey"
        FOREIGN KEY ("studentId") REFERENCES "SchoolStudent" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    -- NO ACTION on both sources, deliberately, and neither SET NULL nor
    -- CASCADE. SET NULL would fight `SchoolFeeRefund_one_source_check` — the
    -- nulling is an update, the check fires, and the delete fails with a
    -- baffling message. CASCADE would erase the record of money that left the
    -- building. NO ACTION refuses to orphan a refund, and because its check is
    -- deferred to the end of the statement rather than taken immediately (which
    -- is the whole difference between NO ACTION and RESTRICT in Postgres), a
    -- company delete that removes the receipts and the refunds together still
    -- succeeds.
    ADD CONSTRAINT "SchoolFeeRefund_receiptId_fkey"
        FOREIGN KEY ("receiptId") REFERENCES "SchoolFeeReceipt" ("id")
        ON DELETE NO ACTION ON UPDATE CASCADE,
    ADD CONSTRAINT "SchoolFeeRefund_invoiceId_fkey"
        FOREIGN KEY ("invoiceId") REFERENCES "SchoolFeeInvoice" ("id")
        ON DELETE NO ACTION ON UPDATE CASCADE;
