-- One field on one record, changed once.
CREATE TABLE "CrmFieldChange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmFieldChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmFieldChange_companyId_entity_recordId_createdAt_idx"
    ON "CrmFieldChange"("companyId", "entity", "recordId", "createdAt");
CREATE INDEX "CrmFieldChange_companyId_entity_recordId_field_idx"
    ON "CrmFieldChange"("companyId", "entity", "recordId", "field");

ALTER TABLE "CrmFieldChange" ADD CONSTRAINT "CrmFieldChange_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmFieldChange" ADD CONSTRAINT "CrmFieldChange_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
