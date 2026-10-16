-- The knowledge base holds more than prices: FAQs, facts and tips about the business
-- (CrmKnowledgeEntry), written by people, kept from Vane's answers, or found by Vane in a
-- document and kept by a person; searched with Postgres full-text search like the rest.
-- CreateEnum
CREATE TYPE "CrmKnowledgeEntryKind" AS ENUM ('FAQ', 'FACT', 'TIP');

-- CreateTable
CREATE TABLE "CrmKnowledgeEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "CrmKnowledgeEntryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "docId" TEXT,
    "source" TEXT,
    "kept" BOOLEAN NOT NULL DEFAULT true,
    "madeByVane" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((title || ' '::text) || body))) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmKnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmKnowledgeEntry_companyId_kind_kept_idx" ON "CrmKnowledgeEntry"("companyId", "kind", "kept");

-- CreateIndex
CREATE INDEX "CrmKnowledgeEntry_docId_idx" ON "CrmKnowledgeEntry"("docId");

-- CreateIndex
CREATE INDEX "CrmKnowledgeEntry_createdById_idx" ON "CrmKnowledgeEntry"("createdById");

-- CreateIndex
CREATE INDEX "CrmKnowledgeEntry_search_idx" ON "CrmKnowledgeEntry" USING GIN ("search");

-- AddForeignKey
ALTER TABLE "CrmKnowledgeEntry" ADD CONSTRAINT "CrmKnowledgeEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmKnowledgeEntry" ADD CONSTRAINT "CrmKnowledgeEntry_docId_fkey" FOREIGN KEY ("docId") REFERENCES "CrmKnowledgeDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmKnowledgeEntry" ADD CONSTRAINT "CrmKnowledgeEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vane's reader, and a rep's reading, read the entries inside the workspace (`pnpm vane:reader-sql`, `--rep`).
ALTER TABLE "CrmKnowledgeEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmKnowledgeEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmKnowledgeEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "kind", "title", "body", "docId", "source", "kept", "madeByVane", "createdById", "createdAt", "updatedAt") ON "CrmKnowledgeEntry" TO vane_reader;
CREATE POLICY "vane_rep" ON "CrmKnowledgeEntry" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "kind", "title", "body", "docId", "source", "kept", "madeByVane", "createdById", "createdAt", "updatedAt") ON "CrmKnowledgeEntry" TO vane_reader_rep;
