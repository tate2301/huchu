-- FD-0 — the schema foundations native ZIMRA FDMS v7.2 fiscalisation needs.
--
-- One migration, because the four changes are one story: a receipt cannot be
-- signed without a taxID per rate (FD-0.2), cannot attach to the documents that
-- actually get fiscalised (FD-0.4a), cannot know its currency at the till
-- (FD-0.4b), and cannot be counted or chained without a fiscal day (FD-2).
-- Splitting them would leave the tree in a state where the signer has half its
-- inputs, which is worse than one wider change.
--
-- =============================================================================
-- FD-0.2  TaxCode.zimraTaxId
-- =============================================================================
--
-- FDGA v7.2 identifies a tax rate by an integer, not by a name or a percentage.
-- Every receipt tax line carries `taxID`, the device learns the valid set from
-- `getConfig`, and the receipt signature concatenates those lines sorted by
-- that integer — so an unmapped tax code cannot be signed at all, and issuing
-- against one has to be refused rather than defaulted to something plausible.
--
-- Nullable, because every existing tenant predates the mapping. The column is
-- filled per company from the device's `getConfig` response, which is also why
-- there is no uniqueness on it: ZIMRA reuses the same taxID across taxpayers,
-- and a tenant may legitimately map two of its own codes (a legacy 15% and the
-- current 15.5%, say) to different IDs while another tenant maps neither.
--
-- =============================================================================
-- FD-0.4b  RetailSale.currency
-- =============================================================================
--
-- A fiscal receipt carries `receiptCurrency`, and the signature is computed
-- over the receipt total expressed in that currency's minor units. A till sale
-- that does not record what it was rung in therefore cannot be fiscalised, and
-- POS is the highest-volume receipt surface there is.
--
-- Backfill rule: every existing row becomes 'USD'. That is not a guess — USD is
-- the platform base currency, it is the only currency `RetailSale` has ever
-- been priced in (there was no column to hold another), and it is what
-- `SalesInvoice.currency` already defaults to. The column default does the
-- backfill in one metadata-only step; no UPDATE is needed or wanted on a table
-- this hot.
--
-- =============================================================================
-- FD-0.4a  The fiscal source widens from two documents to four
-- =============================================================================
--
-- `FiscalReceipt_one_source_check` allowed exactly one of (invoiceId,
-- schoolReceiptId). Two more documents have to be fiscalisable:
--
--   creditNoteId   v7.2 treats a credit note as a fiscal document in its own
--                  right — it cites the original receipt's global number and is
--                  validated against it on the portal. The old CHECK was the
--                  thing blocking FD-4.1 outright.
--   retailSaleId   POS. See FD-0.4b above.
--
-- The `<>` form (boolean inequality) says "exactly one" for two columns only;
-- it does not generalise. Rather than write it as a six-way pairwise
-- expression, the constraint is replaced with the numeric form — cast each
-- NULL test to int and require the sum to be 1 — which stays readable as more
-- sources are added and is exactly the invariant: a fiscal receipt names one
-- source document. Neither is meaningless (nothing could ever find the row
-- again); both is one fiscal document claiming to be two.
--
-- The old constraint is dropped and the new one added NOT VALID then VALIDATEd,
-- so the ordinary path takes no long lock. There is a window between the DROP
-- and the ADD in which no source constraint holds; it is inside this
-- transaction, so no other session sees it.
--
-- Each new source gets a plain unique index, for the same reason
-- `FiscalReceipt_schoolReceiptId_key` is one: the column is nullable and
-- Postgres treats NULLs as distinct, so the index constrains exactly the rows
-- that name that kind of source and ignores every other row — a partial unique
-- index written in a form Prisma can express, so `findUnique({ where: {
-- retailSaleId } })` type-checks.
--
-- =============================================================================
-- FD-2  FiscalDay, and the signing columns on FiscalReceipt
-- =============================================================================
--
-- FDGA v7.2 will not accept a receipt outside an open day. The cycle is
-- OpenDay -> receipts -> CloseDay, and CloseDay submits the day's counters
-- aggregated by taxID together with a device signature over them. The fiscal
-- day, not the receipt, is the unit ZIMRA reconciles against, so it is a
-- durable row with its own counters rather than state inferred from a scan of
-- `FiscalReceipt`.
--
-- `lastReceiptCounter` is the receipt's position within the day and resets to 0
-- on every open. `lastReceiptGlobalNo` is its position on the device for all
-- time; it never resets and must be gap-free, because a gap is precisely what
-- ZIMRA reads as a receipt that was issued and withheld. Both live on this row
-- so that allocating the next number is a single-row UPDATE that can be taken
-- under a lock — deriving them with MAX() over `FiscalReceipt` would let two
-- concurrent issuers read the same maximum and mint the same number.
--
-- `FiscalDay_one_open_per_device` is a PARTIAL unique index and is written here
-- in raw SQL because Prisma cannot express one. It is load-bearing, not
-- decorative: two tills (or a till and the console, or a retry of a request
-- whose response was lost) can call OpenDay at the same instant, and a
-- check-then-write in application code cannot stop them — both read "no day
-- open", both insert. A device with two open days has two receipt counters
-- issuing the same numbers, which forks the hash chain, which invalidates every
-- receipt from the fork onward. The index makes the second INSERT fail instead.
-- It covers OPENED and CLOSING alike: a day being closed is still that device's
-- day, and a new one may not be opened underneath it.
--
-- `FiscalDay_providerConfigId_fiscalDayNo_key` is the other half — a day number
-- is consumed once per device and never reissued, or ZIMRA gets two Z-reports
-- for one day.
--
-- On FiscalReceipt, the signing columns are all nullable because every row
-- written before native fiscalisation has none of them, and a PENDING row has
-- none until the signer runs. `receiptType` and `receiptCurrency` are stored
-- rather than re-derived from the source document, because the source document
-- can be edited after the receipt was signed and the signature has to stay
-- verifiable against what was actually sent.
--
-- On the two new uniques:
--
--   (fiscalDayId, receiptCounter)                 two receipts cannot occupy
--                                                 the same slot in a day
--   (companyId, providerKey, receiptGlobalNo)     gap-free, collision-free
--                                                 global numbering per device
--
-- The second deliberately includes `companyId`. Global numbering is per DEVICE,
-- and a device is one `FiscalisationProviderConfig`, which is already keyed as
-- (companyId, providerKey). Scoping the unique to `providerKey` alone would put
-- every tenant on the platform on a single number line and reject tenant B's
-- first receipt because tenant A already has a receipt #1 — a stop-the-line
-- failure the moment there are two fiscalising tenants. When FD-7 gives one
-- company more than one device, this unique moves to a `providerConfigId` on
-- the receipt; (companyId, providerKey) is exactly the device identity until
-- then.
--
-- Both uniques contain nullable columns, so pre-native rows (every column NULL)
-- are outside them entirely, which is the intent.
--
-- =============================================================================
-- Rollback (the whole file)
-- =============================================================================
--
--   ALTER TABLE "FiscalReceipt"
--     DROP CONSTRAINT "FiscalReceipt_one_source_check",
--     DROP CONSTRAINT "FiscalReceipt_fiscalDayId_fkey",
--     DROP CONSTRAINT "FiscalReceipt_retailSaleId_fkey",
--     DROP CONSTRAINT "FiscalReceipt_creditNoteId_fkey",
--     DROP COLUMN "receiptCurrency",
--     DROP COLUMN "receiptType",
--     DROP COLUMN "fiscalDayId",
--     DROP COLUMN "receiptHash",
--     DROP COLUMN "previousReceiptHash",
--     DROP COLUMN "receiptGlobalNo",
--     DROP COLUMN "receiptCounter",
--     DROP COLUMN "retailSaleId",
--     DROP COLUMN "creditNoteId";
--   ALTER TABLE "FiscalReceipt"
--     ADD CONSTRAINT "FiscalReceipt_one_source_check"
--     CHECK (("invoiceId" IS NOT NULL) <> ("schoolReceiptId" IS NOT NULL));
--   DROP TABLE "FiscalDay";
--   ALTER TABLE "RetailSale" DROP COLUMN "currency";
--   ALTER TABLE "TaxCode" DROP COLUMN "zimraTaxId";
--
-- Rolling back is only safe while no receipt has been signed. Once a chain
-- exists, dropping `receiptHash`/`previousReceiptHash` destroys the only record
-- of it and every subsequent receipt becomes unverifiable.

-- -----------------------------------------------------------------------------
-- FD-0.2
-- -----------------------------------------------------------------------------

ALTER TABLE "TaxCode" ADD COLUMN IF NOT EXISTS "zimraTaxId" INTEGER;

-- -----------------------------------------------------------------------------
-- FD-0.4b  — the DEFAULT is the backfill; every pre-existing sale was USD.
-- -----------------------------------------------------------------------------

ALTER TABLE "RetailSale"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';

-- -----------------------------------------------------------------------------
-- FD-2  FiscalDay
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "FiscalDay" (
    "id"                  TEXT NOT NULL,
    "companyId"           TEXT NOT NULL,
    "providerConfigId"    TEXT NOT NULL,
    "deviceId"            TEXT NOT NULL,
    "fiscalDayNo"         INTEGER NOT NULL,
    "status"              TEXT NOT NULL DEFAULT 'OPENED',
    "openedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt"            TIMESTAMP(3),
    "lastReceiptCounter"  INTEGER NOT NULL DEFAULT 0,
    "lastReceiptGlobalNo" INTEGER NOT NULL DEFAULT 0,
    "lastReceiptHash"     TEXT,
    "closingSignature"    TEXT,
    "countersJson"        TEXT,
    "lastError"           TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDay_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FiscalDay_companyId_fkey'
  ) THEN
    ALTER TABLE "FiscalDay"
      ADD CONSTRAINT "FiscalDay_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FiscalDay_providerConfigId_fkey'
  ) THEN
    ALTER TABLE "FiscalDay"
      ADD CONSTRAINT "FiscalDay_providerConfigId_fkey"
      FOREIGN KEY ("providerConfigId") REFERENCES "FiscalisationProviderConfig"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDay_providerConfigId_fiscalDayNo_key"
  ON "FiscalDay" ("providerConfigId", "fiscalDayNo");

CREATE INDEX IF NOT EXISTS "FiscalDay_companyId_status_openedAt_idx"
  ON "FiscalDay" ("companyId", "status", "openedAt");

-- The race this closes cannot be closed in application code. See the header.
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDay_one_open_per_device"
  ON "FiscalDay" ("providerConfigId")
  WHERE "status" <> 'CLOSED';

-- -----------------------------------------------------------------------------
-- FD-0.4a  new sources
-- -----------------------------------------------------------------------------

ALTER TABLE "FiscalReceipt" ADD COLUMN IF NOT EXISTS "creditNoteId" TEXT;
ALTER TABLE "FiscalReceipt" ADD COLUMN IF NOT EXISTS "retailSaleId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FiscalReceipt_creditNoteId_fkey'
  ) THEN
    ALTER TABLE "FiscalReceipt"
      ADD CONSTRAINT "FiscalReceipt_creditNoteId_fkey"
      FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FiscalReceipt_retailSaleId_fkey'
  ) THEN
    ALTER TABLE "FiscalReceipt"
      ADD CONSTRAINT "FiscalReceipt_retailSaleId_fkey"
      FOREIGN KEY ("retailSaleId") REFERENCES "RetailSale"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalReceipt_creditNoteId_key"
  ON "FiscalReceipt" ("creditNoteId");

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalReceipt_retailSaleId_key"
  ON "FiscalReceipt" ("retailSaleId");

-- Exactly one source, now across four columns. The `<>` form does not
-- generalise past two, so the numeric form replaces it.
ALTER TABLE "FiscalReceipt" DROP CONSTRAINT IF EXISTS "FiscalReceipt_one_source_check";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FiscalReceipt_one_source_check'
  ) THEN
    ALTER TABLE "FiscalReceipt"
      ADD CONSTRAINT "FiscalReceipt_one_source_check"
      CHECK ((("invoiceId" IS NOT NULL)::int + ("schoolReceiptId" IS NOT NULL)::int
              + ("creditNoteId" IS NOT NULL)::int + ("retailSaleId" IS NOT NULL)::int) = 1)
      NOT VALID;
    ALTER TABLE "FiscalReceipt" VALIDATE CONSTRAINT "FiscalReceipt_one_source_check";
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- FD-2/FD-3  signing columns
-- -----------------------------------------------------------------------------

ALTER TABLE "FiscalReceipt" ADD COLUMN IF NOT EXISTS "receiptCounter"      INTEGER;
ALTER TABLE "FiscalReceipt" ADD COLUMN IF NOT EXISTS "receiptGlobalNo"     INTEGER;
ALTER TABLE "FiscalReceipt" ADD COLUMN IF NOT EXISTS "previousReceiptHash" TEXT;
ALTER TABLE "FiscalReceipt" ADD COLUMN IF NOT EXISTS "receiptHash"         TEXT;
ALTER TABLE "FiscalReceipt" ADD COLUMN IF NOT EXISTS "fiscalDayId"         TEXT;
ALTER TABLE "FiscalReceipt" ADD COLUMN IF NOT EXISTS "receiptType"         TEXT;
ALTER TABLE "FiscalReceipt" ADD COLUMN IF NOT EXISTS "receiptCurrency"     TEXT;

-- ON DELETE SET NULL rather than RESTRICT: a RESTRICT here fires during the
-- Company cascade and would make deleting a tenant fail. Nothing deletes a
-- fiscal day in normal operation, and the chain is reconstructible from
-- previousReceiptHash without the day row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FiscalReceipt_fiscalDayId_fkey'
  ) THEN
    ALTER TABLE "FiscalReceipt"
      ADD CONSTRAINT "FiscalReceipt_fiscalDayId_fkey"
      FOREIGN KEY ("fiscalDayId") REFERENCES "FiscalDay"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalReceipt_fiscalDayId_receiptCounter_key"
  ON "FiscalReceipt" ("fiscalDayId", "receiptCounter");

CREATE UNIQUE INDEX IF NOT EXISTS "FiscalReceipt_companyId_providerKey_receiptGlobalNo_key"
  ON "FiscalReceipt" ("companyId", "providerKey", "receiptGlobalNo");

CREATE INDEX IF NOT EXISTS "FiscalReceipt_fiscalDayId_idx"
  ON "FiscalReceipt" ("fiscalDayId");
