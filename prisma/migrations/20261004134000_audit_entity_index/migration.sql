-- CreateIndex
CREATE INDEX "PlatformAuditEvent_companyId_entityType_entityId_createdAt_idx" ON "PlatformAuditEvent"("companyId", "entityType", "entityId", "createdAt");
