-- Resources the client reviews alongside a quote or an invoice.
--
-- A quote is rarely read on its own. Floorcode sends its brand brochure and
-- the data sheet for the resin with every one, and until now that meant a rep
-- attaching the same PDFs by hand to a separate email -- or forgetting to. The
-- tenant keeps a library of those links and files; each document records which
-- of them it offered, and the approval page, the covering email and the PDF
-- all list them.
--
-- The library is data. Nothing about any tenant's materials lives in code.

CREATE TYPE "CrmResourceKind" AS ENUM ('LINK', 'FILE');

-- 1. The library. Retired entries are archived, never deleted: a document
--    already sent still points at them, and its links have to keep working.
CREATE TABLE "CrmResource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "CrmResourceKind" NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT,
    "contentType" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmResource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmResource_companyId_archivedAt_sortOrder_idx" ON "CrmResource"("companyId", "archivedAt", "sortOrder");

ALTER TABLE "CrmResource"
  ADD CONSTRAINT "CrmResource_companyId_fkey" FOREIGN KEY ("companyId")
  REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Which resources one document offered. Once per resource per document,
--    and it goes with the document.
CREATE TABLE "CrmDocumentResource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmDocumentResource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmDocumentResource_documentId_resourceId_key" ON "CrmDocumentResource"("documentId", "resourceId");
CREATE INDEX "CrmDocumentResource_companyId_resourceId_idx" ON "CrmDocumentResource"("companyId", "resourceId");

ALTER TABLE "CrmDocumentResource"
  ADD CONSTRAINT "CrmDocumentResource_companyId_fkey" FOREIGN KEY ("companyId")
  REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmDocumentResource"
  ADD CONSTRAINT "CrmDocumentResource_documentId_fkey" FOREIGN KEY ("documentId")
  REFERENCES "CrmLeadDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmDocumentResource"
  ADD CONSTRAINT "CrmDocumentResource_resourceId_fkey" FOREIGN KEY ("resourceId")
  REFERENCES "CrmResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
