-- Migration: 20260510400001_add_import_workflow_data_model
-- Epic 9.0 — import data model (presets, tags, comments, snapshots, period-close)
--
-- ROLLBACK PROCEDURE:
--   1. DROP TABLE "GoldPeriodClose";
--   2. DROP TABLE "GoldImportSnapshot";
--   3. DROP TABLE "GoldLedgerImportComment";
--   4. DROP TABLE "GoldLedgerImportTag";
--   5. DROP TABLE "GoldLedgerImportPreset";
--   6. ALTER TABLE "GoldLedgerImport"
--        DROP COLUMN IF EXISTS "name",
--        DROP COLUMN IF EXISTS "assignedToId",
--        DROP COLUMN IF EXISTS "sourceFileSha256",
--        DROP COLUMN IF EXISTS "tombstonedAt",
--        DROP COLUMN IF EXISTS "archivedAt",
--        DROP COLUMN IF EXISTS "presetId";
--   7. DROP INDEX IF EXISTS "GoldLedgerImport_companyId_archivedAt_idx";
--   8. DROP INDEX IF EXISTS "GoldLedgerImport_companyId_tombstonedAt_idx";
--   9. DROP INDEX IF EXISTS "GoldLedgerImport_sourceFileSha256_idx";
--
-- All operations are additive. No existing data is modified.

-- Extend GoldLedgerImport
ALTER TABLE "GoldLedgerImport" ADD COLUMN "name" TEXT;
ALTER TABLE "GoldLedgerImport" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "GoldLedgerImport" ADD COLUMN "sourceFileSha256" TEXT;
ALTER TABLE "GoldLedgerImport" ADD COLUMN "tombstonedAt" TIMESTAMP(3);
ALTER TABLE "GoldLedgerImport" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "GoldLedgerImport" ADD COLUMN "presetId" TEXT;

-- New indexes on GoldLedgerImport
CREATE INDEX "GoldLedgerImport_companyId_archivedAt_idx" ON "GoldLedgerImport"("companyId", "archivedAt");
CREATE INDEX "GoldLedgerImport_companyId_tombstonedAt_idx" ON "GoldLedgerImport"("companyId", "tombstonedAt");
CREATE INDEX "GoldLedgerImport_sourceFileSha256_idx" ON "GoldLedgerImport"("sourceFileSha256");

-- GoldLedgerImportPreset
CREATE TABLE "GoldLedgerImportPreset" (
    "id"               TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "mappingJson"      TEXT NOT NULL,
    "sampleHeaderHash" TEXT,
    "isDefault"        BOOLEAN NOT NULL DEFAULT false,
    "createdById"      TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldLedgerImportPreset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoldLedgerImportPreset_companyId_name_key" ON "GoldLedgerImportPreset"("companyId", "name");
CREATE INDEX "GoldLedgerImportPreset_companyId_sampleHeaderHash_idx" ON "GoldLedgerImportPreset"("companyId", "sampleHeaderHash");

ALTER TABLE "GoldLedgerImportPreset"
    ADD CONSTRAINT "GoldLedgerImportPreset_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoldLedgerImportPreset"
    ADD CONSTRAINT "GoldLedgerImportPreset_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Wire GoldLedgerImport FK to preset
ALTER TABLE "GoldLedgerImport"
    ADD CONSTRAINT "GoldLedgerImport_presetId_fkey"
        FOREIGN KEY ("presetId") REFERENCES "GoldLedgerImportPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Wire GoldLedgerImport FK to assignedTo
ALTER TABLE "GoldLedgerImport"
    ADD CONSTRAINT "GoldLedgerImport_assignedToId_fkey"
        FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- GoldLedgerImportTag
CREATE TABLE "GoldLedgerImportTag" (
    "id"        TEXT NOT NULL,
    "importId"  TEXT NOT NULL,
    "label"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoldLedgerImportTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoldLedgerImportTag_importId_label_key" ON "GoldLedgerImportTag"("importId", "label");
CREATE INDEX "GoldLedgerImportTag_label_idx" ON "GoldLedgerImportTag"("label");

ALTER TABLE "GoldLedgerImportTag"
    ADD CONSTRAINT "GoldLedgerImportTag_importId_fkey"
        FOREIGN KEY ("importId") REFERENCES "GoldLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GoldLedgerImportComment
CREATE TABLE "GoldLedgerImportComment" (
    "id"            TEXT NOT NULL,
    "importId"      TEXT NOT NULL,
    "ledgerEntryId" TEXT,
    "body"          TEXT NOT NULL,
    "createdById"   TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldLedgerImportComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoldLedgerImportComment_importId_createdAt_idx" ON "GoldLedgerImportComment"("importId", "createdAt");
CREATE INDEX "GoldLedgerImportComment_ledgerEntryId_idx" ON "GoldLedgerImportComment"("ledgerEntryId");

ALTER TABLE "GoldLedgerImportComment"
    ADD CONSTRAINT "GoldLedgerImportComment_importId_fkey"
        FOREIGN KEY ("importId") REFERENCES "GoldLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoldLedgerImportComment"
    ADD CONSTRAINT "GoldLedgerImportComment_ledgerEntryId_fkey"
        FOREIGN KEY ("ledgerEntryId") REFERENCES "GoldLedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoldLedgerImportComment"
    ADD CONSTRAINT "GoldLedgerImportComment_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GoldImportSnapshot
CREATE TABLE "GoldImportSnapshot" (
    "id"          TEXT NOT NULL,
    "importId"    TEXT NOT NULL,
    "takenAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason"      TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "takenById"   TEXT NOT NULL,

    CONSTRAINT "GoldImportSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoldImportSnapshot_importId_takenAt_idx" ON "GoldImportSnapshot"("importId", "takenAt" DESC);

ALTER TABLE "GoldImportSnapshot"
    ADD CONSTRAINT "GoldImportSnapshot_importId_fkey"
        FOREIGN KEY ("importId") REFERENCES "GoldLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoldImportSnapshot"
    ADD CONSTRAINT "GoldImportSnapshot_takenById_fkey"
        FOREIGN KEY ("takenById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GoldPeriodClose
CREATE TABLE "GoldPeriodClose" (
    "id"             TEXT NOT NULL,
    "companyId"      TEXT NOT NULL,
    "siteId"         TEXT,
    "periodStart"    TIMESTAMP(3) NOT NULL,
    "periodEnd"      TIMESTAMP(3) NOT NULL,
    "closedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById"     TEXT NOT NULL,
    "overrideReason" TEXT,
    "overrideById"   TEXT,
    "overrideAt"     TIMESTAMP(3),

    CONSTRAINT "GoldPeriodClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoldPeriodClose_companyId_siteId_periodStart_key" ON "GoldPeriodClose"("companyId", "siteId", "periodStart");
CREATE INDEX "GoldPeriodClose_companyId_periodStart_idx" ON "GoldPeriodClose"("companyId", "periodStart");

ALTER TABLE "GoldPeriodClose"
    ADD CONSTRAINT "GoldPeriodClose_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoldPeriodClose"
    ADD CONSTRAINT "GoldPeriodClose_siteId_fkey"
        FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GoldPeriodClose"
    ADD CONSTRAINT "GoldPeriodClose_closedById_fkey"
        FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoldPeriodClose"
    ADD CONSTRAINT "GoldPeriodClose_overrideById_fkey"
        FOREIGN KEY ("overrideById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
