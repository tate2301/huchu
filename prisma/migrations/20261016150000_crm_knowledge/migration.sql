-- The CRM's knowledge base (CRM → Knowledge): documents people upload, their passages and their
-- prices, searched with Postgres full-text search, so Vane answers and drafts quotes from them. A
-- quote line keeps the knowledge price it came from; a Vane answer keeps what it showed besides
-- its words (VaneMessage.blocks).
-- CreateEnum
CREATE TYPE "CrmKnowledgeKind" AS ENUM ('PRICE_LIST', 'DOCUMENT');

-- AlterTable
ALTER TABLE "SalesQuotationLine" ADD COLUMN     "knowledgePriceId" TEXT;

-- AlterTable
ALTER TABLE "VaneMessage" ADD COLUMN     "blocks" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "CrmKnowledgeDoc" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "CrmKnowledgeKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "pages" INTEGER,
    "vaneReadAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmKnowledgeDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmKnowledgeChunk" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED,

    CONSTRAINT "CrmKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmKnowledgePrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "unit" TEXT,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" TEXT NOT NULL,
    "kept" BOOLEAN NOT NULL DEFAULT true,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('english', "name" || ' ' || coalesce("description", '') || ' ' || coalesce("code", '') || ' ' || coalesce("unit", ''))) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmKnowledgePrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmKnowledgeDoc_companyId_createdAt_idx" ON "CrmKnowledgeDoc"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmKnowledgeDoc_uploadedById_idx" ON "CrmKnowledgeDoc"("uploadedById");

-- CreateIndex
CREATE INDEX "CrmKnowledgeChunk_docId_position_idx" ON "CrmKnowledgeChunk"("docId", "position");

-- CreateIndex
CREATE INDEX "CrmKnowledgeChunk_companyId_idx" ON "CrmKnowledgeChunk"("companyId");

-- CreateIndex
CREATE INDEX "CrmKnowledgePrice_docId_position_idx" ON "CrmKnowledgePrice"("docId", "position");

-- CreateIndex
CREATE INDEX "CrmKnowledgePrice_companyId_kept_idx" ON "CrmKnowledgePrice"("companyId", "kept");

-- CreateIndex
CREATE INDEX "SalesQuotationLine_knowledgePriceId_idx" ON "SalesQuotationLine"("knowledgePriceId");

-- AddForeignKey
ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_knowledgePriceId_fkey" FOREIGN KEY ("knowledgePriceId") REFERENCES "CrmKnowledgePrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmKnowledgeDoc" ADD CONSTRAINT "CrmKnowledgeDoc_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmKnowledgeDoc" ADD CONSTRAINT "CrmKnowledgeDoc_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmKnowledgeChunk" ADD CONSTRAINT "CrmKnowledgeChunk_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmKnowledgeChunk" ADD CONSTRAINT "CrmKnowledgeChunk_docId_fkey" FOREIGN KEY ("docId") REFERENCES "CrmKnowledgeDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmKnowledgePrice" ADD CONSTRAINT "CrmKnowledgePrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmKnowledgePrice" ADD CONSTRAINT "CrmKnowledgePrice_docId_fkey" FOREIGN KEY ("docId") REFERENCES "CrmKnowledgeDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: full-text search over passages and prices.
CREATE INDEX "CrmKnowledgeChunk_search_idx" ON "CrmKnowledgeChunk" USING GIN ("search");
CREATE INDEX "CrmKnowledgePrice_search_idx" ON "CrmKnowledgePrice" USING GIN ("search");

-- Vane's reader reaches the knowledge base, inside its workspace, as `pnpm vane:reader-sql` prints it.
ALTER TABLE "CrmKnowledgeDoc" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmKnowledgeDoc" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmKnowledgeDoc" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "title", "kind", "fileName", "url", "pathname", "contentType", "size", "text", "pages", "vaneReadAt", "uploadedById", "createdAt", "updatedAt") ON "CrmKnowledgeDoc" TO vane_reader;
ALTER TABLE "CrmKnowledgeChunk" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmKnowledgeChunk" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmKnowledgeChunk" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "docId", "position", "text") ON "CrmKnowledgeChunk" TO vane_reader;
ALTER TABLE "CrmKnowledgePrice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmKnowledgePrice" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmKnowledgePrice" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "docId", "position", "name", "description", "code", "unit", "unitPrice", "currency", "source", "kept", "createdAt") ON "CrmKnowledgePrice" TO vane_reader;
GRANT SELECT ("knowledgePriceId") ON "SalesQuotationLine" TO vane_reader;
-- A quote line now links to a knowledge price too: its policies are the generator's again.
DROP POLICY IF EXISTS "vane_workspace" ON "SalesQuotationLine";
CREATE POLICY "vane_workspace" ON "SalesQuotationLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "SalesQuotation" p WHERE p."id" = "SalesQuotationLine"."quotationId") OR EXISTS (SELECT 1 FROM "TaxCode" p WHERE p."id" = "SalesQuotationLine"."taxCodeId") OR EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "SalesQuotationLine"."productId") OR EXISTS (SELECT 1 FROM "CrmKnowledgePrice" p WHERE p."id" = "SalesQuotationLine"."knowledgePriceId"));

-- A rep quotes from the knowledge base: `pnpm vane:reader-sql --rep`.
DROP POLICY IF EXISTS "vane_rep" ON "SalesQuotationLine";
CREATE POLICY "vane_rep" ON "SalesQuotationLine" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ((EXISTS (SELECT 1 FROM "SalesQuotation" p WHERE p."id" = "SalesQuotationLine"."quotationId") OR EXISTS (SELECT 1 FROM "TaxCode" p WHERE p."id" = "SalesQuotationLine"."taxCodeId") OR EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "SalesQuotationLine"."productId") OR EXISTS (SELECT 1 FROM "CrmKnowledgePrice" p WHERE p."id" = "SalesQuotationLine"."knowledgePriceId")) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR EXISTS (SELECT 1 FROM "SalesQuotation" p WHERE p."id" = "SalesQuotationLine"."quotationId")));
GRANT SELECT ("id", "quotationId", "description", "quantity", "unitPrice", "productId", "knowledgePriceId", "taxCodeId", "taxRate", "taxAmount", "lineTotal", "createdAt") ON "SalesQuotationLine" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmKnowledgeDoc" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "title", "kind", "fileName", "url", "pathname", "contentType", "size", "text", "pages", "vaneReadAt", "uploadedById", "createdAt", "updatedAt") ON "CrmKnowledgeDoc" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmKnowledgeChunk" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "docId", "position", "text") ON "CrmKnowledgeChunk" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmKnowledgePrice" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "docId", "position", "name", "description", "code", "unit", "unitPrice", "currency", "source", "kept", "createdAt") ON "CrmKnowledgePrice" TO vane_reader_rep;
