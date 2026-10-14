-- Report schedules (design/core-modules/spec/routes.md §1, Send it; approved 13 Oct): a report
-- emailed every day, week or month to people in the workspace who can open it. Only a person
-- makes one or turns it back on; the sender moves nextRunAt on after each send.

CREATE TYPE "ReportScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "ReportScheduleFormat" AS ENUM ('PDF', 'CSV');
CREATE TYPE "ReportScheduleContent" AS ENUM ('SUMMARY', 'FULL');

CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportKey" VARCHAR(120) NOT NULL,
    "frequency" "ReportScheduleFrequency" NOT NULL,
    "day" INTEGER,
    "time" VARCHAR(5) NOT NULL,
    "recipientIds" TEXT[],
    "format" "ReportScheduleFormat" NOT NULL DEFAULT 'PDF',
    "content" "ReportScheduleContent" NOT NULL DEFAULT 'SUMMARY',
    "query" VARCHAR(4000) NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportSchedule_companyId_reportKey_idx" ON "ReportSchedule"("companyId", "reportKey");
CREATE INDEX "ReportSchedule_active_nextRunAt_idx" ON "ReportSchedule"("active", "nextRunAt");
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vane's reader reaches the new table, as `pnpm vane:reader-sql` prints it. It reads; it never writes.
ALTER TABLE "ReportSchedule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ReportSchedule" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ReportSchedule" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "reportKey", "frequency", "day", "time", "recipientIds", "format", "content", "query", "createdById", "active", "nextRunAt", "lastSentAt", "createdAt", "updatedAt") ON "ReportSchedule" TO vane_reader;
