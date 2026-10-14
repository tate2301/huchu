-- Saved views (design/core-modules/spec/routes.md §0, approved 13 Oct): a page's address kept
-- under a name in its module's panel, for the person who saved it or shared with the workspace.

CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "query" VARCHAR(2000) NOT NULL DEFAULT '',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedView_companyId_path_idx" ON "SavedView"("companyId", "path");
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vane's reader reaches the new table, as `pnpm vane:reader-sql` prints it.
ALTER TABLE "SavedView" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SavedView" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SavedView" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "path", "name", "query", "isShared", "createdById", "createdAt", "updatedAt") ON "SavedView" TO vane_reader;
