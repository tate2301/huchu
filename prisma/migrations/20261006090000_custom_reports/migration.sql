-- Reports a workspace builds itself: a page of blocks, each a query over the
-- report sources. Only the document is stored; rows are fetched each time.
CREATE TABLE "CustomReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "document" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomReport_companyId_createdById_idx" ON "CustomReport"("companyId", "createdById");

ALTER TABLE "CustomReport" ADD CONSTRAINT "CustomReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
