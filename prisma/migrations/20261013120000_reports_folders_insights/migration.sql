-- Reports & Insights (design/core-modules/spec/reports-and-books.md): folders on Reports' panel,
-- insights written by Vane as Vane items of their own kind, and when Vane writes them and which
-- board "Pin to …" adds to.

-- An insight is a Vane item: its headline, body, the question it ran (sql) and the rows it drew
-- (readFrom). It shows on Reports → Insights, never in For you.
ALTER TYPE "VaneItemKind" ADD VALUE 'INSIGHT';

-- The folder a report is filed in.
ALTER TABLE "CustomReport" ADD COLUMN     "folderId" TEXT;

-- When the week's insights are written, and the board they pin to.
ALTER TABLE "VaneSettings" ADD COLUMN     "insightsBoardId" TEXT,
ADD COLUMN     "insightsSchedule" VARCHAR(9) NOT NULL DEFAULT 'MON 06:00';

CREATE TABLE "ReportFolder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportFolder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportFolder_companyId_name_key" ON "ReportFolder"("companyId", "name");
CREATE INDEX "CustomReport_folderId_idx" ON "CustomReport"("folderId");
ALTER TABLE "CustomReport" ADD CONSTRAINT "CustomReport_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ReportFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportFolder" ADD CONSTRAINT "ReportFolder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vane's reader reaches the new table and columns, as `pnpm vane:reader-sql` prints them.
ALTER TABLE "ReportFolder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ReportFolder" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ReportFolder" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "sortOrder", "createdById", "createdAt", "updatedAt") ON "ReportFolder" TO vane_reader;
GRANT SELECT ("folderId") ON "CustomReport" TO vane_reader;
GRANT SELECT ("insightsSchedule", "insightsBoardId") ON "VaneSettings" TO vane_reader;
