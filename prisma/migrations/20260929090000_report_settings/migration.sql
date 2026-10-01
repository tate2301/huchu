-- How a workspace has set up each report: offered or not, its page layout,
-- and the view it opens with. Additive; a report with no row behaves exactly
-- as it did before this table existed.
CREATE TABLE "ReportSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "layout" JSONB,
    "view" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportSetting_companyId_reportKey_key" ON "ReportSetting"("companyId", "reportKey");

ALTER TABLE "ReportSetting" ADD CONSTRAINT "ReportSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
