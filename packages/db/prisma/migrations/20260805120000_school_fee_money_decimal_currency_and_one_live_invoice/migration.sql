-- S-2.1, S-2.2 and S-2.4 — one migration, because they alter the same six
-- tables and a school cannot be half-migrated.
--
-- =============================================================================
-- S-2.1  Float → Decimal
-- =============================================================================
--
-- Money columns (Decimal(14,2) — the repo's money convention, 15 uses in Gold
-- and accounting before this):
--   SchoolFeeStructureLine.amount             Float → Decimal(14,2)
--   SchoolFeeInvoice.subTotal                 Float → Decimal(14,2)
--   SchoolFeeInvoice.taxTotal                 Float → Decimal(14,2)
--   SchoolFeeInvoice.totalAmount              Float → Decimal(14,2)
--   SchoolFeeInvoice.paidAmount               Float → Decimal(14,2)
--   SchoolFeeInvoice.waivedAmount             Float → Decimal(14,2)
--   SchoolFeeInvoice.writeOffAmount           Float → Decimal(14,2)
--   SchoolFeeInvoice.balanceAmount            Float → Decimal(14,2)
--   SchoolFeeInvoiceLine.unitAmount           Float → Decimal(14,2)
--   SchoolFeeInvoiceLine.taxAmount            Float → Decimal(14,2)
--   SchoolFeeInvoiceLine.lineTotal            Float → Decimal(14,2)
--   SchoolFeeReceipt.amountReceived           Float → Decimal(14,2)
--   SchoolFeeReceipt.amountAllocated          Float → Decimal(14,2)
--   SchoolFeeReceipt.amountUnallocated        Float → Decimal(14,2)
--   SchoolFeeReceiptAllocation.allocatedAmount Float → Decimal(14,2)
--   SchoolFeeWaiver.amount                    Float → Decimal(14,2)
--
-- Not money, so not Decimal(14,2):
--   SchoolFeeInvoiceLine.quantity             Float → Decimal(12,4)
--       A multiplier. At scale 2 a term billed a third at a time (0.3333) is
--       unrepresentable, and the repo already reserves Decimal(12,4) for
--       per-unit rates. The route's own zod schema allows 0.0001, which is
--       exactly four places.
--   SchoolFeeInvoiceLine.taxRate              Float → Decimal(5,2)
--       A percentage, bounded 0–100 by the route. The repo's percentage
--       convention (SchoolGradingScheme.passMark and friends) is Decimal(5,2).
--
-- Deliberately untouched: SchoolBookLoan.fineAmount and
-- SchoolTransportRoute.termFee are already Decimal(10,2); SchoolSubject.passMark
-- and SchoolResultLine.score are marks rather than money and are out of scope.
--
-- Every USING casts through numeric and rounds to the target scale, so the
-- conversion of accumulated float error is deterministic rather than whatever
-- Postgres would otherwise pick.
--
-- =============================================================================
-- S-2.2  currency, exchangeRate, baseAmount
-- =============================================================================
--
-- Added to SchoolFeeInvoice, SchoolFeeReceipt and SchoolFeeWaiver:
--   currency      TEXT           NOT NULL DEFAULT 'USD'
--   exchangeRate  DECIMAL(12,4)  NOT NULL DEFAULT 1
--   baseAmount    DECIMAL(14,2)  NOT NULL DEFAULT 0
--
-- `exchangeRate` follows the repo's only existing FX convention, the
-- `CurrencyRate` table, where a row is {baseCurrency 'USD', quoteCurrency
-- 'ZWG', rate 27.5} and the rate is **quote units per one base unit** — 27.5
-- ZWG buys one USD. A document already in the base currency carries 1.
--
-- `baseAmount` is expressed in the company's AccountingSettings.baseCurrency
-- (default 'USD'), and is amount / exchangeRate rounded to the cent. It is what
-- the ledger and any cross-currency report should sum; the amount columns stay
-- in the currency the family was actually billed in.
--
-- Backfill: every existing row is USD at rate 1, so baseAmount equals the
-- document amount. That is true by construction — before this migration the
-- fee surface had no currency column at all and every posting defaulted to USD.
--
-- =============================================================================
-- S-2.4  A student cannot be invoiced twice for one term
-- =============================================================================
--
-- Scoped by fee structure, and partial. Both are departures from the roadmap's
-- literal `@@unique([companyId, studentId, termId])`, and both are deliberate:
--
--   * Partial, because a VOIDED invoice is a cancelled one. A plain unique
--     index would mean a bursar who voids a wrong invoice can never raise the
--     right one, which turns a correction into a support call.
--
--   * Per fee structure, because a fee structure is unique on
--     (companyId, termId, classId, name) — a class legitimately has several in
--     a term, and the pack sells boarding and transport as separate billable
--     things. A boarder billed for tuition and for boarding has two invoices in
--     one term and always did. The duplicate this story is about is the same
--     structure run twice, which is what the index refuses.
--
-- `feeStructureId` is nullable and Postgres treats NULLs as distinct, so
-- hand-written ad-hoc invoices (a school trip, a replacement blazer) sit
-- outside the index and remain repeatable. Postgres 16 would allow NULLS NOT
-- DISTINCT here; it is not used, because catching a second ad-hoc invoice would
-- cost the bursar the ability to raise two different one-off bills in a term,
-- and no bulk path can produce one by accident.
--
-- =============================================================================
-- Rollback procedure (reverse each statement)
-- =============================================================================
--   DROP INDEX "SchoolFeeInvoice_live_student_term_structure_key";
--   ALTER TABLE "SchoolFeeWaiver"  DROP COLUMN "baseAmount", DROP COLUMN "exchangeRate", DROP COLUMN "currency";
--   ALTER TABLE "SchoolFeeReceipt" DROP COLUMN "baseAmount", DROP COLUMN "exchangeRate", DROP COLUMN "currency";
--   ALTER TABLE "SchoolFeeInvoice" DROP COLUMN "baseAmount", DROP COLUMN "exchangeRate", DROP COLUMN "currency";
--   ALTER TABLE "SchoolFeeStructureLine" ALTER COLUMN "amount" TYPE DOUBLE PRECISION USING "amount"::double precision;
--   ALTER TABLE "SchoolFeeInvoice" ALTER COLUMN "subTotal" TYPE DOUBLE PRECISION USING "subTotal"::double precision;
--   ALTER TABLE "SchoolFeeInvoice" ALTER COLUMN "taxTotal" TYPE DOUBLE PRECISION USING "taxTotal"::double precision;
--   ALTER TABLE "SchoolFeeInvoice" ALTER COLUMN "totalAmount" TYPE DOUBLE PRECISION USING "totalAmount"::double precision;
--   ALTER TABLE "SchoolFeeInvoice" ALTER COLUMN "paidAmount" TYPE DOUBLE PRECISION USING "paidAmount"::double precision;
--   ALTER TABLE "SchoolFeeInvoice" ALTER COLUMN "waivedAmount" TYPE DOUBLE PRECISION USING "waivedAmount"::double precision;
--   ALTER TABLE "SchoolFeeInvoice" ALTER COLUMN "writeOffAmount" TYPE DOUBLE PRECISION USING "writeOffAmount"::double precision;
--   ALTER TABLE "SchoolFeeInvoice" ALTER COLUMN "balanceAmount" TYPE DOUBLE PRECISION USING "balanceAmount"::double precision;
--   ALTER TABLE "SchoolFeeInvoiceLine" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision;
--   ALTER TABLE "SchoolFeeInvoiceLine" ALTER COLUMN "unitAmount" TYPE DOUBLE PRECISION USING "unitAmount"::double precision;
--   ALTER TABLE "SchoolFeeInvoiceLine" ALTER COLUMN "taxRate" TYPE DOUBLE PRECISION USING "taxRate"::double precision;
--   ALTER TABLE "SchoolFeeInvoiceLine" ALTER COLUMN "taxAmount" TYPE DOUBLE PRECISION USING "taxAmount"::double precision;
--   ALTER TABLE "SchoolFeeInvoiceLine" ALTER COLUMN "lineTotal" TYPE DOUBLE PRECISION USING "lineTotal"::double precision;
--   ALTER TABLE "SchoolFeeReceipt" ALTER COLUMN "amountReceived" TYPE DOUBLE PRECISION USING "amountReceived"::double precision;
--   ALTER TABLE "SchoolFeeReceipt" ALTER COLUMN "amountAllocated" TYPE DOUBLE PRECISION USING "amountAllocated"::double precision;
--   ALTER TABLE "SchoolFeeReceipt" ALTER COLUMN "amountUnallocated" TYPE DOUBLE PRECISION USING "amountUnallocated"::double precision;
--   ALTER TABLE "SchoolFeeReceiptAllocation" ALTER COLUMN "allocatedAmount" TYPE DOUBLE PRECISION USING "allocatedAmount"::double precision;
--   ALTER TABLE "SchoolFeeWaiver" ALTER COLUMN "amount" TYPE DOUBLE PRECISION USING "amount"::double precision;

-- ---------------------------------------------------------------------------
-- S-2.1 — the price sheet
-- ---------------------------------------------------------------------------
ALTER TABLE "SchoolFeeStructureLine"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2)
    USING ROUND("amount"::numeric, 2);

-- ---------------------------------------------------------------------------
-- S-2.1 — the invoice
-- ---------------------------------------------------------------------------
ALTER TABLE "SchoolFeeInvoice"
  ALTER COLUMN "subTotal" TYPE DECIMAL(14,2) USING ROUND("subTotal"::numeric, 2),
  ALTER COLUMN "subTotal" SET DEFAULT 0,
  ALTER COLUMN "taxTotal" TYPE DECIMAL(14,2) USING ROUND("taxTotal"::numeric, 2),
  ALTER COLUMN "taxTotal" SET DEFAULT 0,
  ALTER COLUMN "totalAmount" TYPE DECIMAL(14,2) USING ROUND("totalAmount"::numeric, 2),
  ALTER COLUMN "totalAmount" SET DEFAULT 0,
  ALTER COLUMN "paidAmount" TYPE DECIMAL(14,2) USING ROUND("paidAmount"::numeric, 2),
  ALTER COLUMN "paidAmount" SET DEFAULT 0,
  ALTER COLUMN "waivedAmount" TYPE DECIMAL(14,2) USING ROUND("waivedAmount"::numeric, 2),
  ALTER COLUMN "waivedAmount" SET DEFAULT 0,
  ALTER COLUMN "writeOffAmount" TYPE DECIMAL(14,2) USING ROUND("writeOffAmount"::numeric, 2),
  ALTER COLUMN "writeOffAmount" SET DEFAULT 0,
  ALTER COLUMN "balanceAmount" TYPE DECIMAL(14,2) USING ROUND("balanceAmount"::numeric, 2),
  ALTER COLUMN "balanceAmount" SET DEFAULT 0;

-- ---------------------------------------------------------------------------
-- S-2.1 — the invoice line. quantity and taxRate are rates, not money.
-- ---------------------------------------------------------------------------
ALTER TABLE "SchoolFeeInvoiceLine"
  ALTER COLUMN "quantity" TYPE DECIMAL(12,4) USING ROUND("quantity"::numeric, 4),
  ALTER COLUMN "quantity" SET DEFAULT 1,
  ALTER COLUMN "unitAmount" TYPE DECIMAL(14,2) USING ROUND("unitAmount"::numeric, 2),
  ALTER COLUMN "taxRate" TYPE DECIMAL(5,2) USING ROUND("taxRate"::numeric, 2),
  ALTER COLUMN "taxRate" SET DEFAULT 0,
  ALTER COLUMN "taxAmount" TYPE DECIMAL(14,2) USING ROUND("taxAmount"::numeric, 2),
  ALTER COLUMN "taxAmount" SET DEFAULT 0,
  ALTER COLUMN "lineTotal" TYPE DECIMAL(14,2) USING ROUND("lineTotal"::numeric, 2);

-- ---------------------------------------------------------------------------
-- S-2.1 — the receipt and its allocations
-- ---------------------------------------------------------------------------
ALTER TABLE "SchoolFeeReceipt"
  ALTER COLUMN "amountReceived" TYPE DECIMAL(14,2) USING ROUND("amountReceived"::numeric, 2),
  ALTER COLUMN "amountAllocated" TYPE DECIMAL(14,2) USING ROUND("amountAllocated"::numeric, 2),
  ALTER COLUMN "amountAllocated" SET DEFAULT 0,
  ALTER COLUMN "amountUnallocated" TYPE DECIMAL(14,2) USING ROUND("amountUnallocated"::numeric, 2),
  ALTER COLUMN "amountUnallocated" SET DEFAULT 0;

ALTER TABLE "SchoolFeeReceiptAllocation"
  ALTER COLUMN "allocatedAmount" TYPE DECIMAL(14,2)
    USING ROUND("allocatedAmount"::numeric, 2);

-- ---------------------------------------------------------------------------
-- S-2.1 — the waiver
-- ---------------------------------------------------------------------------
ALTER TABLE "SchoolFeeWaiver"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2)
    USING ROUND("amount"::numeric, 2);

-- ---------------------------------------------------------------------------
-- S-2.2 — currency, exchange rate and the base-currency equivalent
-- ---------------------------------------------------------------------------
ALTER TABLE "SchoolFeeInvoice"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "SchoolFeeReceipt"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "SchoolFeeWaiver"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- An existing invoice inherits the currency of the structure it was priced
-- from; everything else was USD at 1 and stays so.
UPDATE "SchoolFeeInvoice" i
SET "currency" = s."currency"
FROM "SchoolFeeStructure" s
WHERE i."feeStructureId" = s."id" AND s."currency" <> i."currency";

UPDATE "SchoolFeeInvoice" SET "baseAmount" = ROUND("totalAmount" / "exchangeRate", 2)
WHERE "baseAmount" = 0 AND "totalAmount" <> 0;

UPDATE "SchoolFeeReceipt" SET "baseAmount" = ROUND("amountReceived" / "exchangeRate", 2)
WHERE "baseAmount" = 0 AND "amountReceived" <> 0;

UPDATE "SchoolFeeWaiver" SET "baseAmount" = ROUND("amount" / "exchangeRate", 2)
WHERE "baseAmount" = 0 AND "amount" <> 0;

-- A rate of zero would make baseAmount undefined, and a blank currency makes
-- the ledger guess. Neither is representable.
ALTER TABLE "SchoolFeeInvoice"
  ADD CONSTRAINT "SchoolFeeInvoice_exchangeRate_check" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "SchoolFeeInvoice_currency_check" CHECK (char_length("currency") BETWEEN 3 AND 10);

ALTER TABLE "SchoolFeeReceipt"
  ADD CONSTRAINT "SchoolFeeReceipt_exchangeRate_check" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "SchoolFeeReceipt_currency_check" CHECK (char_length("currency") BETWEEN 3 AND 10);

ALTER TABLE "SchoolFeeWaiver"
  ADD CONSTRAINT "SchoolFeeWaiver_exchangeRate_check" CHECK ("exchangeRate" > 0),
  ADD CONSTRAINT "SchoolFeeWaiver_currency_check" CHECK (char_length("currency") BETWEEN 3 AND 10);

-- ---------------------------------------------------------------------------
-- S-2.4 — one live invoice per student, per term, per fee structure
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "SchoolFeeInvoice_live_student_term_structure_key"
    ON "SchoolFeeInvoice" ("companyId", "studentId", "termId", "feeStructureId")
    WHERE "status" <> 'VOIDED';

-- The index above only serves lookups that supply all four columns. Bulk
-- generation asks "which of these students already has one", which is the
-- three-column prefix plus the structure, so give it its own index.
CREATE INDEX IF NOT EXISTS "SchoolFeeInvoice_companyId_studentId_termId_feeStructureId_idx"
    ON "SchoolFeeInvoice" ("companyId", "studentId", "termId", "feeStructureId");
