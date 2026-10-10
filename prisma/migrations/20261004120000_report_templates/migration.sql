-- CreateEnum
CREATE TYPE "ReportTemplateAudience" AS ENUM ('JUST_ME', 'MANAGERS', 'EVERYONE');

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "view" JSONB NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "audience" "ReportTemplateAudience" NOT NULL DEFAULT 'JUST_ME',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportTemplate_companyId_reportKey_idx" ON "ReportTemplate"("companyId", "reportKey");

-- CreateIndex
CREATE INDEX "ReportTemplate_companyId_createdById_idx" ON "ReportTemplate"("companyId", "createdById");

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

