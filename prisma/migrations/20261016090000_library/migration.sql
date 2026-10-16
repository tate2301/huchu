-- The library: what Corelith makes once and publishes to workspaces.
CREATE TYPE "LibraryKind" AS ENUM ('REPORT', 'EXPLORE', 'INSIGHT', 'VISIT_FORM', 'ENQUIRY_FORM', 'BLOCK_TEMPLATE', 'LAYOUT');
CREATE TYPE "LibraryStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
CREATE TYPE "LibraryAudience" AS ENUM ('EVERYONE', 'VERTICALS', 'WORKSPACES');

CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "kind" "LibraryKind" NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "status" "LibraryStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "LibraryAudience" NOT NULL DEFAULT 'EVERYONE',
    "verticals" "Vertical"[],
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LibraryItemWorkspace" (
    "itemId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "LibraryItemWorkspace_pkey" PRIMARY KEY ("itemId","companyId")
);

CREATE UNIQUE INDEX "LibraryItem_key_key" ON "LibraryItem"("key");
CREATE INDEX "LibraryItem_kind_status_idx" ON "LibraryItem"("kind", "status");
CREATE INDEX "LibraryItemWorkspace_companyId_idx" ON "LibraryItemWorkspace"("companyId");

ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LibraryItemWorkspace" ADD CONSTRAINT "LibraryItemWorkspace_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryItemWorkspace" ADD CONSTRAINT "LibraryItemWorkspace_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
