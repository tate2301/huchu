-- Epic 14 Import Studio schema extras
-- These columns/tables were added to schema.prisma in commit 4894b6671 via
-- `prisma db push` (which mutates the DB but does NOT generate migration
-- files). Without this migration, prod's `prisma migrate deploy` leaves the
-- DB out of sync with the Prisma client and runtime queries fail.

-- 1. Add sampleHeaderHash to GoldLedgerImport for preset matching
ALTER TABLE "GoldLedgerImport" ADD COLUMN "sampleHeaderHash" TEXT;

-- 2. Add rawLine to GoldLedgerEntry for diagnostic labels
ALTER TABLE "GoldLedgerEntry" ADD COLUMN "rawLine" TEXT;

-- 3. Create GoldImportSavedView model (per-user saved filter views)
CREATE TABLE "GoldImportSavedView" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filterJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldImportSavedView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoldImportSavedView_companyId_userId_idx" ON "GoldImportSavedView"("companyId", "userId");

CREATE UNIQUE INDEX "GoldImportSavedView_companyId_userId_name_key" ON "GoldImportSavedView"("companyId", "userId", "name");

ALTER TABLE "GoldImportSavedView" ADD CONSTRAINT "GoldImportSavedView_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoldImportSavedView" ADD CONSTRAINT "GoldImportSavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
