-- AlterTable
ALTER TABLE "CrmRequisition" ADD COLUMN "siteId" TEXT;

-- CreateIndex
CREATE INDEX "CrmRequisition_companyId_siteId_status_idx" ON "CrmRequisition"("companyId", "siteId", "status");

-- AddForeignKey
ALTER TABLE "CrmRequisition" ADD CONSTRAINT "CrmRequisition_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
