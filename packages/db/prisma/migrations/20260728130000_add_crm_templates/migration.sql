-- Forms, quotes, invoices, receipts, emails and exports, all built from blocks.
CREATE TABLE "CrmTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "attributes" JSONB,
    "blocks" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "linkedEntity" TEXT,
    "linkedRecordId" TEXT,
    "publicToken" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "submitCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "lastSubmitAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmTemplate_publicToken_key" ON "CrmTemplate"("publicToken");
CREATE UNIQUE INDEX "CrmTemplate_companyId_name_kind_key"
    ON "CrmTemplate"("companyId", "name", "kind");
CREATE INDEX "CrmTemplate_companyId_kind_isActive_idx"
    ON "CrmTemplate"("companyId", "kind", "isActive");
CREATE INDEX "CrmTemplate_companyId_linkedEntity_linkedRecordId_idx"
    ON "CrmTemplate"("companyId", "linkedEntity", "linkedRecordId");

ALTER TABLE "CrmTemplate" ADD CONSTRAINT "CrmTemplate_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmTemplate" ADD CONSTRAINT "CrmTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One thing that happened to a template, for its analytics tab.
CREATE TABLE "CrmTemplateEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmTemplateEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmTemplateEvent_companyId_templateId_createdAt_idx"
    ON "CrmTemplateEvent"("companyId", "templateId", "createdAt");
CREATE INDEX "CrmTemplateEvent_templateId_type_createdAt_idx"
    ON "CrmTemplateEvent"("templateId", "type", "createdAt");

ALTER TABLE "CrmTemplateEvent" ADD CONSTRAINT "CrmTemplateEvent_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmTemplateEvent" ADD CONSTRAINT "CrmTemplateEvent_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "CrmTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
