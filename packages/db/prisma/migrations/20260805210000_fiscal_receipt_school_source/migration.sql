-- S-2.7 — a school fee receipt can be fiscalised.
--
-- `FiscalReceipt` was hard-wired to `SalesInvoice`: the only foreign key was
-- `invoiceId`, and `issueFiscalReceipt` read `prisma.salesInvoice` at four
-- separate points. A school takes money on a `SchoolFeeReceipt`, which is not a
-- sales invoice and never will be, so a school on the ZIMRA add-on had nowhere
-- to record what FDMS gave back.
--
-- This adds the second source and makes "exactly one source" a constraint
-- rather than a convention.
--
--   FiscalReceipt.schoolReceiptId            the school fee receipt, when that
--                                            is what was fiscalised
--   FiscalReceipt_schoolReceiptId_key        one fiscal receipt per school
--                                            receipt
--   FiscalReceipt_one_source_check           exactly one of the two sources
--
-- On the unique. The standing rule is that a "one live X" invariant belongs in
-- a partial unique index rather than in application code, and that is what this
-- is: `schoolReceiptId` is nullable and Postgres treats NULLs as distinct, so a
-- plain unique on it constrains exactly the rows that name a school receipt and
-- ignores every sales-invoice row. Written longhand it would be
--
--   CREATE UNIQUE INDEX … ON "FiscalReceipt" ("schoolReceiptId")
--     WHERE "schoolReceiptId" IS NOT NULL;
--
-- which is the same index. The plain form is used because it is what the
-- adjacent `FiscalReceipt_invoiceId_key` already is, and because Prisma can
-- express it — meaning `findUnique({ where: { schoolReceiptId } })` type-checks
-- and the lookup does not have to fall back to `findFirst`.
--
-- On the CHECK. It is added NOT VALID and then validated, so the ordinary path
-- takes no long lock on a table that may be large; this database has no
-- `FiscalReceipt` rows at all, so validation is instant either way. A row with
-- neither source was always meaningless — nothing could ever find it again —
-- and a row with both would be one fiscal document claiming to be two.
--
-- Rollback:
--
--   ALTER TABLE "FiscalReceipt" DROP CONSTRAINT "FiscalReceipt_one_source_check";
--   DROP INDEX "FiscalReceipt_schoolReceiptId_key";
--   ALTER TABLE "FiscalReceipt" DROP CONSTRAINT "FiscalReceipt_schoolReceiptId_fkey";
--   ALTER TABLE "FiscalReceipt" DROP COLUMN "schoolReceiptId";

ALTER TABLE "FiscalReceipt" ADD COLUMN IF NOT EXISTS "schoolReceiptId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FiscalReceipt_schoolReceiptId_fkey'
  ) THEN
    ALTER TABLE "FiscalReceipt"
      ADD CONSTRAINT "FiscalReceipt_schoolReceiptId_fkey"
      FOREIGN KEY ("schoolReceiptId") REFERENCES "SchoolFeeReceipt"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalReceipt_schoolReceiptId_key"
  ON "FiscalReceipt" ("schoolReceiptId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FiscalReceipt_one_source_check'
  ) THEN
    ALTER TABLE "FiscalReceipt"
      ADD CONSTRAINT "FiscalReceipt_one_source_check"
      CHECK (("invoiceId" IS NOT NULL) <> ("schoolReceiptId" IS NOT NULL))
      NOT VALID;
    ALTER TABLE "FiscalReceipt" VALIDATE CONSTRAINT "FiscalReceipt_one_source_check";
  END IF;
END $$;
