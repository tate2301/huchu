-- CreateTable
CREATE TABLE "ReportTemplateUse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateRef" TEXT NOT NULL,
    "templateId" TEXT,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL,
    "lastOpenedById" TEXT,

    CONSTRAINT "ReportTemplateUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportTemplateUse_templateId_idx" ON "ReportTemplateUse"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplateUse_companyId_templateRef_key" ON "ReportTemplateUse"("companyId", "templateRef");

-- AddForeignKey
ALTER TABLE "ReportTemplateUse" ADD CONSTRAINT "ReportTemplateUse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplateUse" ADD CONSTRAINT "ReportTemplateUse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplateUse" ADD CONSTRAINT "ReportTemplateUse_lastOpenedById_fkey" FOREIGN KEY ("lastOpenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
