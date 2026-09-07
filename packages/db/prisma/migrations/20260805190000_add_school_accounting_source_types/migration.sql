-- S-2.3 — school money posts under its own source types.
--
-- Until now every school fee event borrowed a retail one: an invoice posted as
-- SALES_INVOICE, a receipt and its void both as SALES_RECEIPT, and a bursary
-- waiver as SALES_WRITE_OFF alongside genuinely uncollectable fees. The ledger
-- therefore credited tuition to "Retail Sales Revenue" and charged a
-- scholarship to "Bad Debt Expense", and nothing in a drill-down said the entry
-- came from a school at all.
--
-- Seven members, one per school fee document:
--
--   SCHOOL_FEE_INVOICE         a bill raised against a student
--   SCHOOL_FEE_RECEIPT         money taken from a family
--   SCHOOL_FEE_RECEIPT_VOID    that receipt reversed
--   SCHOOL_FEE_CREDIT_APPLIED  a surplus spent on a later bill
--   SCHOOL_FEE_WAIVER          a bursary or discount
--   SCHOOL_FEE_WRITE_OFF       a fee given up as uncollectable
--   SCHOOL_FEE_REFUND          credit handed back to the family
--
-- Postgres forbids *using* an enum value added inside the same transaction that
-- added it, so this migration only extends the type. The posting rules that
-- reference these values are seed data, written by `runAccountingSeedPack` at
-- runtime, not by SQL here.
--
-- Rollback. Postgres cannot drop an enum value. Reversing this means recreating
-- the type without the seven members, which requires every column of the type
-- to be rewritten and every dependent view dropped:
--
--   -- 1. delete or reclassify every row referencing a school member
--   --    DELETE FROM "PostingRule"  WHERE "sourceType"::text LIKE 'SCHOOL\_FEE\_%';
--   --    DELETE FROM "JournalEntry" WHERE "sourceType"::text LIKE 'SCHOOL\_FEE\_%';
--   --    DELETE FROM "AccountingIntegrationEvent" WHERE "sourceType"::text LIKE 'SCHOOL\_FEE\_%';
--   --    DELETE FROM "PaymentLedgerEntry" WHERE "sourceType"::text LIKE 'SCHOOL\_FEE\_%';
--   -- 2. ALTER TYPE "AccountingSourceType" RENAME TO "AccountingSourceType_old";
--   -- 3. CREATE TYPE "AccountingSourceType" AS ENUM (...the 37 original members...);
--   -- 4. ALTER TABLE each dependent column TYPE "AccountingSourceType"
--   --      USING "sourceType"::text::"AccountingSourceType";
--   -- 5. DROP TYPE "AccountingSourceType_old";
--
-- IF NOT EXISTS makes re-running this file a no-op, which is what the house
-- pattern (20260804150000_add_hod_warden_roles) does.

ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'SCHOOL_FEE_INVOICE';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'SCHOOL_FEE_RECEIPT';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'SCHOOL_FEE_RECEIPT_VOID';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'SCHOOL_FEE_CREDIT_APPLIED';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'SCHOOL_FEE_WAIVER';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'SCHOOL_FEE_WRITE_OFF';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'SCHOOL_FEE_REFUND';
