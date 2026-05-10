-- Epic 8: Drop dead SKIPPED enum value and rowsSkipped column (§8 Q4)
--
-- ROLLBACK PROCEDURE:
--   1. ALTER TABLE "GoldLedgerImport" ADD COLUMN "rowsSkipped" INTEGER NOT NULL DEFAULT 0;
--   2. ALTER TYPE "GoldLedgerEntryStatus" ADD VALUE 'SKIPPED';
--   Note: removing an enum value from Postgres requires recreating the type.
--   The SKIPPED value was never written to any row, so no data migration is needed.

-- Drop rowsSkipped column (was computed by subtraction — moved to API layer)
ALTER TABLE "GoldLedgerImport" DROP COLUMN IF EXISTS "rowsSkipped";

-- Remove SKIPPED from GoldLedgerEntryStatus enum.
-- Postgres requires recreating the type to remove a value.
-- Steps: rename old, create new without SKIPPED, alter column to use new type, drop old.
ALTER TYPE "GoldLedgerEntryStatus" RENAME TO "GoldLedgerEntryStatus_old";

CREATE TYPE "GoldLedgerEntryStatus" AS ENUM (
  'PENDING',
  'CREATED',
  'ANOMALY',
  'FAILED'
);

ALTER TABLE "GoldLedgerEntry"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "GoldLedgerEntry"
  ALTER COLUMN "status" TYPE "GoldLedgerEntryStatus"
  USING "status"::text::"GoldLedgerEntryStatus";

ALTER TABLE "GoldLedgerEntry"
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "GoldLedgerEntryStatus_old";
