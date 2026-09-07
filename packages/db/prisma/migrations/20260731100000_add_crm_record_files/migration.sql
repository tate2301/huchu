-- Files attached to a record, as opposed to billing documents the system
-- raised. The owner is a nullable column per kind rather than an entity+id
-- pair, so the database can cascade a delete and refuse a file pointing at a
-- record that does not exist — a string id pointing at nothing is how
-- orphaned files outlive the customer who sent them.
CREATE TABLE "CrmRecordFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER,
    "contentType" TEXT,
    "note" TEXT,
    "leadId" TEXT,
    "dealId" TEXT,
    "clientId" TEXT,
    "personId" TEXT,
    "siteId" TEXT,
    "userId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmRecordFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmRecordFile_companyId_leadId_createdAt_idx" ON "CrmRecordFile"("companyId", "leadId", "createdAt");
CREATE INDEX "CrmRecordFile_companyId_dealId_createdAt_idx" ON "CrmRecordFile"("companyId", "dealId", "createdAt");
CREATE INDEX "CrmRecordFile_companyId_clientId_createdAt_idx" ON "CrmRecordFile"("companyId", "clientId", "createdAt");
CREATE INDEX "CrmRecordFile_companyId_personId_createdAt_idx" ON "CrmRecordFile"("companyId", "personId", "createdAt");
CREATE INDEX "CrmRecordFile_companyId_siteId_createdAt_idx" ON "CrmRecordFile"("companyId", "siteId", "createdAt");
CREATE INDEX "CrmRecordFile_companyId_userId_createdAt_idx" ON "CrmRecordFile"("companyId", "userId", "createdAt");

ALTER TABLE "CrmRecordFile" ADD CONSTRAINT "CrmRecordFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmRecordFile" ADD CONSTRAINT "CrmRecordFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmRecordFile" ADD CONSTRAINT "CrmRecordFile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmRecordFile" ADD CONSTRAINT "CrmRecordFile_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmRecordFile" ADD CONSTRAINT "CrmRecordFile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmRecordFile" ADD CONSTRAINT "CrmRecordFile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmRecordFile" ADD CONSTRAINT "CrmRecordFile_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CrmSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmRecordFile" ADD CONSTRAINT "CrmRecordFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
