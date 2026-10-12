-- Vane: its tables, a "made by Vane" mark on the drafts it writes, and the two
-- read-only roles it reads the workspace through. See docs/vane.md.
--
-- Part 1 (Prisma): the tables and the madeByVane columns.
-- Part 2 (scripts/vane-reader-sql.ts): the vane_reader and vane_reader_private
-- roles, a row policy per readable table and per-column grants. Enabling row
-- level security changes nothing for the app: every table also gets a
-- permissive "app_all" policy, and the table owner bypasses policies anyway.
-- The restrictive "vane_workspace" policies apply to the reader roles only.

-- CreateEnum
CREATE TYPE "VaneItemKind" AS ENUM ('ISSUE', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "VaneItemStatus" AS ENUM ('OPEN', 'DONE', 'MUTED');

-- CreateEnum
CREATE TYPE "VanePlanStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VanePlanStepOwner" AS ENUM ('VANE', 'PERSON');

-- CreateEnum
CREATE TYPE "VanePlanStepStatus" AS ENUM ('TODO', 'NOW', 'DONE');

-- CreateEnum
CREATE TYPE "VaneJobTrigger" AS ENUM ('RECORD', 'SCHEDULE', 'NIGHTLY', 'PERSON');

-- CreateEnum
CREATE TYPE "VaneJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'WAITING', 'FAILED');

-- AlterTable
ALTER TABLE "RetailPurchaseOrder" ADD COLUMN     "madeByVane" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN     "madeByVane" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SalesQuotation" ADD COLUMN     "madeByVane" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VaneItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "VaneItemKind" NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "action" JSONB NOT NULL,
    "readFrom" JSONB NOT NULL DEFAULT '[]',
    "sql" TEXT,
    "status" "VaneItemStatus" NOT NULL DEFAULT 'OPEN',
    "mutedReason" TEXT,
    "audienceRole" TEXT,
    "audienceUserId" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "VaneItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VanePlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueOn" DATE,
    "status" "VanePlanStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "VanePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VanePlanStep" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "owner" "VanePlanStepOwner" NOT NULL,
    "status" "VanePlanStepStatus" NOT NULL DEFAULT 'TODO',
    "progressLabel" TEXT,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "VanePlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaneJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "trigger" "VaneJobTrigger" NOT NULL,
    "requestedById" TEXT,
    "status" "VaneJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "progressDone" INTEGER,
    "progressTotal" INTEGER,
    "model" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaneJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaneSettings" (
    "companyId" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "watches" JSONB NOT NULL DEFAULT '{}',
    "raiseIssues" BOOLEAN NOT NULL DEFAULT true,
    "plans" BOOLEAN NOT NULL DEFAULT true,
    "drafts" BOOLEAN NOT NULL DEFAULT true,
    "readsPeoplePrivate" BOOLEAN NOT NULL DEFAULT false,
    "quietFrom" VARCHAR(5) NOT NULL DEFAULT '20:00',
    "quietTo" VARCHAR(5) NOT NULL DEFAULT '06:00',
    "routing" JSONB NOT NULL DEFAULT '{}',
    "monthlyAllowance" INTEGER NOT NULL DEFAULT 5000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaneSettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "VaneReaderScope" (
    "pid" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaneReaderScope_pkey" PRIMARY KEY ("pid")
);

-- CreateIndex
CREATE INDEX "VaneItem_companyId_status_createdAt_idx" ON "VaneItem"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VaneItem_companyId_subjectType_subjectId_idx" ON "VaneItem"("companyId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "VaneItem_audienceUserId_idx" ON "VaneItem"("audienceUserId");

-- CreateIndex
CREATE INDEX "VaneItem_resolvedById_idx" ON "VaneItem"("resolvedById");

-- CreateIndex
CREATE INDEX "VaneItem_jobId_idx" ON "VaneItem"("jobId");

-- CreateIndex
CREATE INDEX "VanePlan_companyId_status_idx" ON "VanePlan"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VanePlanStep_planId_position_key" ON "VanePlanStep"("planId", "position");

-- CreateIndex
CREATE INDEX "VaneJob_companyId_status_runAfter_idx" ON "VaneJob"("companyId", "status", "runAfter");

-- CreateIndex
CREATE INDEX "VaneJob_companyId_createdAt_idx" ON "VaneJob"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "VaneJob_requestedById_idx" ON "VaneJob"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "VaneJob_companyId_key_key" ON "VaneJob"("companyId", "key");

-- CreateIndex
CREATE INDEX "VaneReaderScope_companyId_idx" ON "VaneReaderScope"("companyId");

-- AddForeignKey
ALTER TABLE "VaneItem" ADD CONSTRAINT "VaneItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneItem" ADD CONSTRAINT "VaneItem_audienceUserId_fkey" FOREIGN KEY ("audienceUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneItem" ADD CONSTRAINT "VaneItem_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneItem" ADD CONSTRAINT "VaneItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "VaneJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanePlan" ADD CONSTRAINT "VanePlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VanePlanStep" ADD CONSTRAINT "VanePlanStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "VanePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneJob" ADD CONSTRAINT "VaneJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneJob" ADD CONSTRAINT "VaneJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneSettings" ADD CONSTRAINT "VaneSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneReaderScope" ADD CONSTRAINT "VaneReaderScope_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Part 2: what Vane may read. Generated by `pnpm vane:reader-sql`; do not edit by hand.
-- -----------------------------------------------------------------------------

-- Roles. NOLOGIN here: give each a password by hand on the server (see docs/vane.md); none is kept in git.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vane_reader') THEN CREATE ROLE vane_reader NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vane_reader_private') THEN CREATE ROLE vane_reader_private NOLOGIN; END IF;
END $$;
GRANT vane_reader TO vane_reader_private;
GRANT USAGE ON SCHEMA public TO vane_reader;

-- The binding: the app writes (pid → workspace) inside the reading transaction. A reader sees only its own row and cannot write it.
ALTER TABLE "VaneReaderScope" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VaneReaderScope" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_own_pid" ON "VaneReaderScope" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("pid" = pg_backend_pid());
GRANT SELECT ("pid", "companyId") ON "VaneReaderScope" TO vane_reader;

-- Every readable table: rows of the bound workspace only, for the readers; nothing changes for anyone else.
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Company" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Company" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("id" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "name", "slug", "siteVisitTemplateKey", "fieldCameraAppName", "fieldCameraAppUrl", "tenantStatus", "workspaceProfile", "product", "isProvisioned", "suspendedAt", "disabledAt", "payrollCycle", "cashDisbursementOnly", "autoGeneratePayrollPeriods", "periodGenerationHorizon", "createdAt", "updatedAt") ON "Company" TO vane_reader;
ALTER TABLE "IdSequence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "IdSequence" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "IdSequence" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "entityKey", "scopeKey", "lastNumber", "createdAt", "updatedAt") ON "IdSequence" TO vane_reader;
ALTER TABLE "SignupRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SignupRequest" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SignupRequest" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "product", "email", "name", "attribution", "verifiedAt", "companyId", "createdAt", "updatedAt") ON "SignupRequest" TO vane_reader;
ALTER TABLE "CompanySubscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CompanySubscription" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CompanySubscription" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "planId", "status", "externalSubscriptionId", "startedAt", "trialEndsAt", "currentPeriodStart", "currentPeriodEnd", "canceledAt", "endedAt", "effectiveMonthlyAmount", "priceSnapshotJson", "lastPriceComputedAt", "createdAt", "updatedAt") ON "CompanySubscription" TO vane_reader;
ALTER TABLE "CompanyFeatureFlag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CompanyFeatureFlag" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CompanyFeatureFlag" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "featureId", "isEnabled", "reason", "expiresAt", "createdAt", "updatedAt") ON "CompanyFeatureFlag" TO vane_reader;
ALTER TABLE "UserFeatureFlag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "UserFeatureFlag" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "UserFeatureFlag" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "UserFeatureFlag"."userId"));
GRANT SELECT ("id", "userId", "featureId", "isEnabled", "createdAt", "updatedAt") ON "UserFeatureFlag" TO vane_reader;
ALTER TABLE "UserPermissionOverride" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "UserPermissionOverride" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "UserPermissionOverride" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "permissionKey", "isAllowed", "grantedById", "createdAt", "updatedAt") ON "UserPermissionOverride" TO vane_reader;
ALTER TABLE "CompanySubscriptionAddon" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CompanySubscriptionAddon" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CompanySubscriptionAddon" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "bundleId", "isEnabled", "reason", "createdAt", "updatedAt") ON "CompanySubscriptionAddon" TO vane_reader;
ALTER TABLE "SubscriptionPayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SubscriptionPayment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SubscriptionPayment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "subscriptionId", "provider", "providerReference", "amount", "currency", "status", "periodMonths", "idempotencyKey", "rawPayloadJson", "paidAt", "failureReason", "createdAt", "updatedAt") ON "SubscriptionPayment" TO vane_reader;
ALTER TABLE "ProvisioningEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ProvisioningEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ProvisioningEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "eventType", "status", "message", "payloadJson", "errorJson", "startedAt", "finishedAt", "createdAt", "updatedAt") ON "ProvisioningEvent" TO vane_reader;
ALTER TABLE "SubdomainReservation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SubdomainReservation" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SubdomainReservation" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "subdomain", "status", "provider", "providerRef", "lastCheckedAt", "reservedAt", "activatedAt", "releasedAt", "createdAt", "updatedAt") ON "SubdomainReservation" TO vane_reader;
ALTER TABLE "CompanyBranding" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CompanyBranding" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CompanyBranding" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "displayName", "primaryColor", "secondaryColor", "accentColor", "fontFamilyKey", "logoUrl", "secondaryLogoUrl", "signatureUrl", "stampUrl", "legalName", "tradingName", "registrationNumber", "vatNumber", "taxNumber", "email", "phone", "website", "physicalAddress", "postalAddress", "bankName", "bankBranch", "bankBranchCode", "bankAddress", "bankAccountName", "bankAccountNumber", "bankSwiftCode", "bankIban", "defaultFooterText", "legalDisclaimer", "paymentTerms", "privacyPolicyUrl", "termsUrl", "documentLocale", "dateFormat", "timeFormat", "numberFormat", "currencyDisplayMode", "createdAt", "updatedAt") ON "CompanyBranding" TO vane_reader;
ALTER TABLE "CompanyDomain" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CompanyDomain" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CompanyDomain" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "hostname", "status", "verificationType", "verificationHost", "verificationValue", "lastCheckedAt", "verifiedAt", "activatedAt", "createdAt", "updatedAt") ON "CompanyDomain" TO vane_reader;
ALTER TABLE "SupportAccessRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SupportAccessRequest" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SupportAccessRequest" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "requestedBy", "approvedBy", "reason", "scope", "status", "requestedAt", "approvedAt", "expiresAt", "createdAt", "updatedAt") ON "SupportAccessRequest" TO vane_reader;
ALTER TABLE "RunbookDefinition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RunbookDefinition" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RunbookDefinition" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "actionType", "schedule", "enabled", "riskLevel", "inputJson", "createdBy", "createdAt", "updatedAt") ON "RunbookDefinition" TO vane_reader;
ALTER TABLE "RunbookExecution" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RunbookExecution" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RunbookExecution" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "runbookId", "companyId", "status", "dryRun", "startedAt", "finishedAt", "resultJson", "errorJson", "createdAt", "updatedAt") ON "RunbookExecution" TO vane_reader;
ALTER TABLE "TenantSloMetricSnapshot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "TenantSloMetricSnapshot" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "TenantSloMetricSnapshot" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "metricKey", "value", "status", "windowStart", "windowEnd", "createdAt") ON "TenantSloMetricSnapshot" TO vane_reader;
ALTER TABLE "HealthIncident" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "HealthIncident" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "HealthIncident" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "metricKey", "riskLevel", "actionType", "status", "message", "actualValue", "thresholdValue", "createdAt", "resolvedAt", "updatedAt") ON "HealthIncident" TO vane_reader;
ALTER TABLE "ContractEnforcementEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ContractEnforcementEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ContractEnforcementEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "fromState", "toState", "reason", "overrideBy", "expiresAt", "effectiveAt", "createdAt") ON "ContractEnforcementEvent" TO vane_reader;
ALTER TABLE "PlatformAuditEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PlatformAuditEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PlatformAuditEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "actor", "eventType", "entityType", "entityId", "reason", "payloadJson", "createdAt") ON "PlatformAuditEvent" TO vane_reader;
ALTER TABLE "Site" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Site" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Site" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "name", "code", "location", "companyId", "isActive", "measurementUnit", "phone", "openingHours", "priceListId", "closedAt", "closedById", "createdAt", "updatedAt") ON "Site" TO vane_reader;
ALTER TABLE "Section" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Section" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Section" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Site" p WHERE p."id" = "Section"."siteId") OR EXISTS (SELECT 1 FROM "Department" p WHERE p."id" = "Section"."departmentId"));
GRANT SELECT ("id", "name", "code", "siteId", "departmentId", "isActive", "createdAt", "updatedAt") ON "Section" TO vane_reader;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "User" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "User" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "email", "name", "role", "companyId", "isActive", "allSites", "accessRemovedAt", "accessRemovedById", "emailVerified", "image", "createdAt", "updatedAt") ON "User" TO vane_reader;
GRANT SELECT ("phone") ON "User" TO vane_reader_private;
ALTER TABLE "UserSiteAccess" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "UserSiteAccess" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "UserSiteAccess" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("userId", "siteId", "companyId", "createdAt") ON "UserSiteAccess" TO vane_reader;
ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Employee" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Employee" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "employeeId", "userId", "name", "jobTitle", "position", "departmentId", "gradeId", "supervisorId", "employmentType", "hireDate", "terminationDate", "defaultCurrency", "companyId", "isActive", "createdAt", "updatedAt") ON "Employee" TO vane_reader;
GRANT SELECT ("phone", "nextOfKinName", "nextOfKinPhone", "passportPhotoUrl", "nationalIdNumber", "nationalIdDocumentUrl", "villageOfOrigin", "taxNumber", "nssaNumber", "taxStatus", "dateOfBirth", "hasDisability", "overtimeHourlyRate", "bankName", "bankAccountNumber", "bankBranchCode", "mobileMoneyProvider", "mobileMoneyNumber") ON "Employee" TO vane_reader_private;
ALTER TABLE "EmployeeModuleAssignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "EmployeeModuleAssignment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "EmployeeModuleAssignment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "employeeId", "module", "accessRole", "requiresUserAccess", "isPrimary", "isActive", "createdAt", "updatedAt") ON "EmployeeModuleAssignment" TO vane_reader;
ALTER TABLE "FixedSalary" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "FixedSalary" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "FixedSalary" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "FixedSalary"."employeeId"));
GRANT SELECT ("id", "employeeId", "monthlyAmount", "currency", "isActive", "createdAt", "updatedAt") ON "FixedSalary" TO vane_reader_private;
ALTER TABLE "EmployeePayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "EmployeePayment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "EmployeePayment" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "EmployeePayment"."employeeId") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "EmployeePayment"."createdById") OR EXISTS (SELECT 1 FROM "PayrollRun" p WHERE p."id" = "EmployeePayment"."payrollRunId") OR EXISTS (SELECT 1 FROM "DisbursementBatch" p WHERE p."id" = "EmployeePayment"."disbursementBatchId"));
GRANT SELECT ("id", "employeeId", "periodStart", "periodEnd", "dueDate", "amount", "unit", "paidAmount", "paidAt", "status", "notes", "payrollRunId", "payrollLineItemId", "disbursementBatchId", "disbursementItemId", "createdById", "createdAt", "updatedAt") ON "EmployeePayment" TO vane_reader_private;
ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Department" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Department" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "isActive", "headEmployeeId", "costCenterId", "siteId", "createdAt", "updatedAt") ON "Department" TO vane_reader;
ALTER TABLE "JobGrade" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "JobGrade" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "JobGrade" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "rank", "isActive", "createdAt", "updatedAt") ON "JobGrade" TO vane_reader;
ALTER TABLE "CompensationProfile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CompensationProfile" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CompensationProfile" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "CompensationProfile"."employeeId") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "CompensationProfile"."createdById") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "CompensationProfile"."submittedById") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "CompensationProfile"."approvedById"));
GRANT SELECT ("id", "employeeId", "baseAmount", "currency", "effectiveFrom", "effectiveTo", "status", "workflowStatus", "notes", "createdById", "submittedById", "approvedById", "submittedAt", "approvedAt", "createdAt", "updatedAt") ON "CompensationProfile" TO vane_reader_private;
ALTER TABLE "CompensationRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CompensationRule" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CompensationRule" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "type", "calcMethod", "value", "cap", "taxable", "currency", "sequence", "basedOnKey", "statutoryKey", "isActive", "workflowStatus", "employeeId", "departmentId", "gradeId", "createdById", "submittedById", "approvedById", "submittedAt", "approvedAt", "createdAt", "updatedAt") ON "CompensationRule" TO vane_reader_private;
ALTER TABLE "CompensationTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CompensationTemplate" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CompensationTemplate" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "description", "employmentType", "position", "baseAmount", "currency", "isActive", "createdById", "createdAt", "updatedAt") ON "CompensationTemplate" TO vane_reader_private;
ALTER TABLE "CompensationTemplateRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CompensationTemplateRule" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CompensationTemplateRule" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "CompensationTemplate" p WHERE p."id" = "CompensationTemplateRule"."templateId") OR EXISTS (SELECT 1 FROM "CompensationRule" p WHERE p."id" = "CompensationTemplateRule"."compensationRuleId"));
GRANT SELECT ("id", "templateId", "compensationRuleId", "sortOrder") ON "CompensationTemplateRule" TO vane_reader_private;
ALTER TABLE "PayrollPeriod" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PayrollPeriod" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PayrollPeriod" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "periodKey", "startDate", "endDate", "dueDate", "cycle", "status", "isAutoGenerated", "periodPurpose", "appliesToContractorsOnly", "employeeScopeJson", "notes", "createdById", "submittedById", "approvedById", "submittedAt", "approvedAt", "createdAt", "updatedAt") ON "PayrollPeriod" TO vane_reader_private;
ALTER TABLE "PayrollRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PayrollRun" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PayrollRun" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "periodId", "runNumber", "status", "notes", "grossTotal", "allowancesTotal", "deductionsTotal", "netTotal", "employerCostTotal", "journalEntryId", "postingSkippedReason", "createdById", "submittedById", "approvedById", "submittedAt", "approvedAt", "createdAt", "updatedAt") ON "PayrollRun" TO vane_reader_private;
ALTER TABLE "PayrollLineItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PayrollLineItem" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PayrollLineItem" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "PayrollRun" p WHERE p."id" = "PayrollLineItem"."runId") OR EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "PayrollLineItem"."employeeId"));
GRANT SELECT ("id", "runId", "employeeId", "compensationProfileId", "baseAmount", "variableAmount", "allowancesTotal", "deductionsTotal", "grossAmount", "netAmount", "taxableGross", "employerCost", "currency", "exchangeRate", "netBaseAmount", "notes", "createdAt", "updatedAt") ON "PayrollLineItem" TO vane_reader_private;
ALTER TABLE "PayrollLineComponent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PayrollLineComponent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PayrollLineComponent" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "CompensationRule" p WHERE p."id" = "PayrollLineComponent"."ruleId"));
GRANT SELECT ("id", "lineItemId", "ruleId", "name", "type", "calcMethod", "rateOrAmount", "amount", "isTaxable", "statutoryKey", "sequence", "basis", "createdAt") ON "PayrollLineComponent" TO vane_reader_private;
ALTER TABLE "DisbursementBatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DisbursementBatch" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DisbursementBatch" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "payrollRunId", "code", "status", "method", "notes", "cashCustodian", "cashIssuedAt", "totalAmount", "currency", "itemCount", "createdById", "submittedById", "approvedById", "submittedAt", "approvedAt", "paidAt", "createdAt", "updatedAt") ON "DisbursementBatch" TO vane_reader_private;
ALTER TABLE "DisbursementItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DisbursementItem" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DisbursementItem" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "DisbursementBatch" p WHERE p."id" = "DisbursementItem"."batchId") OR EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "DisbursementItem"."employeeId"));
GRANT SELECT ("id", "batchId", "lineItemId", "employeeId", "amount", "paidAmount", "currency", "exchangeRate", "baseAmount", "status", "paidAt", "receiptReference", "notes", "createdAt", "updatedAt") ON "DisbursementItem" TO vane_reader_private;
ALTER TABLE "ApprovalAction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ApprovalAction" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ApprovalAction" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "entityType", "entityId", "action", "fromStatus", "toStatus", "note", "actedById", "actedAt", "createdAt") ON "ApprovalAction" TO vane_reader;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Notification" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Notification" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "type", "title", "summary", "severity", "payloadJson", "entityType", "entityId", "sourceAction", "expiresAt", "createdAt", "updatedAt") ON "Notification" TO vane_reader;
ALTER TABLE "NotificationRecipient" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "NotificationRecipient" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "NotificationRecipient" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Notification" p WHERE p."id" = "NotificationRecipient"."notificationId") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "NotificationRecipient"."userId"));
GRANT SELECT ("id", "notificationId", "userId", "isRead", "readAt", "isArchived", "archivedAt", "actionTaken", "actedAt", "createdAt", "updatedAt") ON "NotificationRecipient" TO vane_reader;
ALTER TABLE "UserNotificationPreference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "UserNotificationPreference" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "UserNotificationPreference" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "UserNotificationPreference"."userId"));
GRANT SELECT ("id", "userId", "inAppEnabled", "webPushEnabled", "hrEnabled", "opsEnabled", "crmEnabled", "emailEnabled", "createdAt", "updatedAt") ON "UserNotificationPreference" TO vane_reader;
ALTER TABLE "UserDisplayPreference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "UserDisplayPreference" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "UserDisplayPreference" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "UserDisplayPreference"."userId"));
GRANT SELECT ("id", "userId", "density", "openOn", "reduceMotion", "createdAt", "updatedAt") ON "UserDisplayPreference" TO vane_reader;
ALTER TABLE "WebPushSubscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "WebPushSubscription" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "WebPushSubscription" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "WebPushSubscription"."userId"));
GRANT SELECT ("id", "userId", "endpoint", "p256dh", "auth", "isActive", "createdAt", "updatedAt") ON "WebPushSubscription" TO vane_reader;
ALTER TABLE "AdjustmentEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "AdjustmentEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "AdjustmentEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "targetType", "payrollRunId", "disbursementBatchId", "lineItemId", "disbursementItemId", "employeeId", "amountDelta", "reason", "status", "createdById", "submittedById", "approvedById", "submittedAt", "approvedAt", "createdAt", "updatedAt") ON "AdjustmentEntry" TO vane_reader;
ALTER TABLE "PayeTable" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PayeTable" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PayeTable" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "currency", "cycle", "label", "effectiveFrom", "effectiveTo", "source", "isSeeded", "createdAt", "updatedAt") ON "PayeTable" TO vane_reader_private;
ALTER TABLE "PayeBand" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PayeBand" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PayeBand" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "PayeTable" p WHERE p."id" = "PayeBand"."tableId"));
GRANT SELECT ("id", "tableId", "lowerBound", "upperBound", "ratePercent", "deductAmount", "sortOrder", "createdAt") ON "PayeBand" TO vane_reader_private;
ALTER TABLE "StatutoryRate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "StatutoryRate" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "StatutoryRate" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "key", "currency", "ratePercent", "ceilingAmount", "floorAmount", "effectiveFrom", "effectiveTo", "source", "isSeeded", "createdAt", "updatedAt") ON "StatutoryRate" TO vane_reader_private;
ALTER TABLE "TaxCredit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "TaxCredit" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "TaxCredit" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "key", "currency", "amount", "ratePercent", "effectiveFrom", "effectiveTo", "source", "isSeeded", "createdAt", "updatedAt") ON "TaxCredit" TO vane_reader;
ALTER TABLE "NecAgreement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "NecAgreement" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "NecAgreement" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "councilName", "currency", "employeeRatePercent", "employeeFixedAmount", "employerRatePercent", "employerFixedAmount", "effectiveFrom", "effectiveTo", "source", "isActive", "createdAt", "updatedAt") ON "NecAgreement" TO vane_reader;
ALTER TABLE "LeaveType" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "LeaveType" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "LeaveType" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "unit", "accrualMethod", "defaultEntitlement", "isPaid", "requiresDocumentAfterDays", "carryOverLimit", "carryOverExpiresOn", "policyNote", "effectiveFrom", "effectiveTo", "source", "isSeeded", "isActive", "createdAt", "updatedAt") ON "LeaveType" TO vane_reader;
ALTER TABLE "LeaveEntitlement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "LeaveEntitlement" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "LeaveEntitlement" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "employeeId", "leaveTypeId", "year", "granted", "carriedOver", "adjustment", "note", "createdAt", "updatedAt") ON "LeaveEntitlement" TO vane_reader;
ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "LeaveRequest" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "LeaveRequest" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "employeeId", "leaveTypeId", "startDate", "endDate", "workingDays", "isHalfDay", "reason", "attachmentUrl", "coveringEmployeeId", "status", "decidedById", "decidedAt", "decisionNote", "createdById", "submittedAt", "createdAt", "updatedAt") ON "LeaveRequest" TO vane_reader;
ALTER TABLE "PublicHoliday" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PublicHoliday" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PublicHoliday" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "date", "name", "isPaid", "doublePayIfWorked", "siteId", "isSeeded", "createdAt", "updatedAt") ON "PublicHoliday" TO vane_reader;
ALTER TABLE "SettlementIntake" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SettlementIntake" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SettlementIntake" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "source", "label", "periodStart", "periodEnd", "dueDate", "currency", "workflowStatus", "notes", "createdById", "submittedById", "approvedById", "submittedAt", "approvedAt", "createdAt", "updatedAt") ON "SettlementIntake" TO vane_reader;
ALTER TABLE "SettlementIntakeItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SettlementIntakeItem" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SettlementIntakeItem" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "SettlementIntake" p WHERE p."id" = "SettlementIntakeItem"."intakeId") OR EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "SettlementIntakeItem"."employeeId"));
GRANT SELECT ("id", "intakeId", "employeeId", "quantity", "unit", "amount", "notes", "createdAt", "updatedAt") ON "SettlementIntakeItem" TO vane_reader;
ALTER TABLE "SettlementRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SettlementRun" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SettlementRun" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "source", "periodStart", "periodEnd", "dueDate", "mode", "currency", "ratePerUnit", "rateUnit", "totalQuantity", "totalAmount", "status", "journalEntryId", "postingSkippedReason", "notes", "createdById", "submittedById", "approvedById", "submittedAt", "approvedAt", "createdAt", "updatedAt") ON "SettlementRun" TO vane_reader;
ALTER TABLE "SettlementLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SettlementLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SettlementLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "SettlementRun" p WHERE p."id" = "SettlementLine"."runId") OR EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "SettlementLine"."employeeId"));
GRANT SELECT ("id", "runId", "employeeId", "quantity", "unit", "unitRate", "grossAmount", "netAmount", "currency", "exchangeRate", "baseAmount", "notes", "createdAt", "updatedAt") ON "SettlementLine" TO vane_reader;
ALTER TABLE "SettlementLineOrigin" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SettlementLineOrigin" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SettlementLineOrigin" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "GoldShiftAllocation" p WHERE p."id" = "SettlementLineOrigin"."goldShiftAllocationId") OR EXISTS (SELECT 1 FROM "SettlementIntake" p WHERE p."id" = "SettlementLineOrigin"."settlementIntakeId"));
GRANT SELECT ("id", "lineId", "goldShiftAllocationId", "settlementIntakeId", "quantity", "amount") ON "SettlementLineOrigin" TO vane_reader;
ALTER TABLE "SettlementBatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SettlementBatch" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SettlementBatch" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "settlementRunId", "code", "method", "cashCustodian", "cashIssuedAt", "status", "totalAmount", "currency", "itemCount", "notes", "createdById", "submittedById", "approvedById", "submittedAt", "approvedAt", "paidAt", "createdAt", "updatedAt") ON "SettlementBatch" TO vane_reader;
ALTER TABLE "SettlementBatchItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SettlementBatchItem" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SettlementBatchItem" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "SettlementBatch" p WHERE p."id" = "SettlementBatchItem"."batchId") OR EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "SettlementBatchItem"."employeeId"));
GRANT SELECT ("id", "batchId", "lineId", "employeeId", "amount", "paidAmount", "currency", "status", "paidAt", "receiptReference", "notes", "createdAt", "updatedAt") ON "SettlementBatchItem" TO vane_reader;
ALTER TABLE "SettlementPayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SettlementPayment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SettlementPayment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "employeeId", "source", "settlementRunId", "lineId", "batchId", "batchItemId", "quantity", "unit", "valuationDate", "unitPrice", "amount", "paidAmount", "currency", "periodStart", "periodEnd", "dueDate", "paidAt", "status", "notes", "createdById", "createdAt", "updatedAt") ON "SettlementPayment" TO vane_reader;
ALTER TABLE "ShiftReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ShiftReport" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ShiftReport" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Site" p WHERE p."id" = "ShiftReport"."siteId") OR EXISTS (SELECT 1 FROM "ShiftGroup" p WHERE p."id" = "ShiftReport"."shiftGroupId") OR EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "ShiftReport"."groupLeaderId") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "ShiftReport"."createdById") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "ShiftReport"."verifiedById") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "ShiftReport"."approvedById"));
GRANT SELECT ("id", "date", "shift", "siteId", "sectionId", "shiftGroupId", "groupLeaderId", "crewCount", "workType", "outputTonnes", "outputTrips", "outputWheelbarrows", "metresAdvanced", "hasIncident", "incidentNotes", "handoverNotes", "photos", "status", "createdById", "verifiedById", "approvedById", "verifiedAt", "approvedAt", "createdAt", "updatedAt") ON "ShiftReport" TO vane_reader;
ALTER TABLE "DowntimeCode" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DowntimeCode" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DowntimeCode" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Site" p WHERE p."id" = "DowntimeCode"."siteId"));
GRANT SELECT ("id", "code", "description", "siteId", "isActive", "sortOrder", "createdAt") ON "DowntimeCode" TO vane_reader;
ALTER TABLE "DowntimeEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DowntimeEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DowntimeEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "ShiftReport" p WHERE p."id" = "DowntimeEvent"."shiftReportId") OR EXISTS (SELECT 1 FROM "PlantReport" p WHERE p."id" = "DowntimeEvent"."plantReportId") OR EXISTS (SELECT 1 FROM "DowntimeCode" p WHERE p."id" = "DowntimeEvent"."downtimeCodeId"));
GRANT SELECT ("id", "shiftReportId", "plantReportId", "downtimeCodeId", "durationHours", "notes", "createdAt") ON "DowntimeEvent" TO vane_reader;
ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Attendance" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Attendance" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "date", "siteId", "shift", "shiftGroupId", "shiftLeaderId", "shiftLeaderName", "employeeId", "status", "overtime", "notes", "goldLedgerEntryId", "createdAt") ON "Attendance" TO vane_reader;
ALTER TABLE "ShiftGroup" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ShiftGroup" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ShiftGroup" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "name", "code", "leaderEmployeeId", "isActive", "createdAt", "updatedAt") ON "ShiftGroup" TO vane_reader;
ALTER TABLE "ShiftGroupMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ShiftGroupMember" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ShiftGroupMember" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "ShiftGroup" p WHERE p."id" = "ShiftGroupMember"."shiftGroupId") OR EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "ShiftGroupMember"."employeeId"));
GRANT SELECT ("id", "shiftGroupId", "employeeId", "isActive", "joinedAt", "leftAt", "createdAt", "updatedAt") ON "ShiftGroupMember" TO vane_reader;
ALTER TABLE "ShiftGroupSchedule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ShiftGroupSchedule" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ShiftGroupSchedule" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "date", "shift", "shiftGroupId", "notes", "createdById", "createdAt", "updatedAt") ON "ShiftGroupSchedule" TO vane_reader;
ALTER TABLE "PlantReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PlantReport" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PlantReport" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Site" p WHERE p."id" = "PlantReport"."siteId") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "PlantReport"."reportedById"));
GRANT SELECT ("id", "date", "siteId", "tonnesFed", "tonnesProcessed", "runHours", "dieselUsed", "grindingMedia", "reagentsUsed", "waterUsed", "goldRecovered", "notes", "reportedById", "status", "createdAt", "updatedAt") ON "PlantReport" TO vane_reader;
ALTER TABLE "GoldPrice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldPrice" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldPrice" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "effectiveDate", "priceUsdPerGram", "note", "createdById", "createdAt", "updatedAt") ON "GoldPrice" TO vane_reader;
ALTER TABLE "GoldExpenseType" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldExpenseType" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldExpenseType" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "sortOrder", "isActive", "createdAt", "updatedAt") ON "GoldExpenseType" TO vane_reader;
ALTER TABLE "GoldPour" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldPour" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldPour" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "pourBarId", "pourDate", "siteId", "companyId", "sourceType", "createdById", "goldShiftAllocationId", "grossWeight", "estimatedPurity", "witness1Id", "witness2Id", "storageLocation", "additionalExpensesWeight", "additionalExpensesNote", "notes", "goldPriceUsdPerGram", "goldPriceSource", "valuationDate", "valueUsd", "createdAt", "updatedAt", "corrections") ON "GoldPour" TO vane_reader;
ALTER TABLE "GoldCompanyConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldCompanyConfig" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldCompanyConfig" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "defaultSplitMode", "defaultPayCycleWeeks", "defaultStorageLocation", "defaultEstimatedPurity", "liveSpotPriceEnabled", "liveSpotPriceProvider", "importCommitCoSignThresholdRows", "importCommitCoSignThresholdUsd", "createdAt", "updatedAt") ON "GoldCompanyConfig" TO vane_reader;
ALTER TABLE "GoldPurchase" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldPurchase" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldPurchase" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "goldPourId", "purchaseNumber", "purchaseDate", "sellerType", "sellerEmployeeId", "sellerName", "sellerPhone", "grossWeight", "estimatedPurity", "storageLocation", "receiver1Id", "receiver2Id", "paidAmount", "currency", "paymentMethod", "paymentChannel", "paymentReference", "attachmentsJson", "notes", "createdById", "createdAt", "updatedAt") ON "GoldPurchase" TO vane_reader;
ALTER TABLE "GoldDispatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldDispatch" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldDispatch" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "goldPourId", "companyId", "dispatchDate", "courier", "vehicle", "destination", "sealNumbers", "handedOverById", "receivedBy", "notes", "goldPriceUsdPerGram", "goldPriceSource", "valuationDate", "valueUsd", "createdAt", "updatedAt") ON "GoldDispatch" TO vane_reader;
ALTER TABLE "GoldDispatchBatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldDispatchBatch" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldDispatchBatch" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "dispatchId", "goldPourId", "companyId", "sortOrder", "createdAt") ON "GoldDispatchBatch" TO vane_reader;
ALTER TABLE "BuyerReceipt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "BuyerReceipt" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "BuyerReceipt" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "goldDispatchId", "goldPourId", "companyId", "receiptNumber", "receiptDate", "assayResult", "paidAmount", "paymentMethod", "paymentChannel", "paymentReference", "notes", "goldPriceUsdPerGram", "goldPriceSource", "valuationDate", "createdAt", "updatedAt") ON "BuyerReceipt" TO vane_reader;
ALTER TABLE "BuyerReceiptBatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "BuyerReceiptBatch" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "BuyerReceiptBatch" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "buyerReceiptId", "goldPourId", "companyId", "grams", "valueUsd", "goldPriceUsdPerGram", "goldPriceSource", "notes", "createdAt") ON "BuyerReceiptBatch" TO vane_reader;
ALTER TABLE "BuyerReceiptDispatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "BuyerReceiptDispatch" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "BuyerReceiptDispatch" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "BuyerReceipt" p WHERE p."id" = "BuyerReceiptDispatch"."buyerReceiptId") OR EXISTS (SELECT 1 FROM "GoldDispatch" p WHERE p."id" = "BuyerReceiptDispatch"."goldDispatchId"));
GRANT SELECT ("id", "buyerReceiptId", "goldDispatchId", "createdAt") ON "BuyerReceiptDispatch" TO vane_reader;
ALTER TABLE "GoldShiftAllocation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldShiftAllocation" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldShiftAllocation" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "date", "shift", "siteId", "companyId", "shiftGroupId", "shiftReportId", "totalWeight", "netWeight", "splitMode", "workerShareOverrideWeight", "splitOverrideReason", "workerShareWeight", "companyShareWeight", "perWorkerWeight", "goldPriceUsdPerGram", "goldPriceSource", "valuationDate", "totalWeightValueUsd", "netWeightValueUsd", "workerShareValueUsd", "companyShareValueUsd", "perWorkerValueUsd", "payCycleWeeks", "workflowStatus", "createdById", "submittedById", "approvedById", "submittedAt", "approvedAt", "createdAt", "updatedAt") ON "GoldShiftAllocation" TO vane_reader;
ALTER TABLE "GoldShiftExpense" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldShiftExpense" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldShiftExpense" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "GoldShiftAllocation" p WHERE p."id" = "GoldShiftExpense"."allocationId"));
GRANT SELECT ("id", "allocationId", "type", "weight") ON "GoldShiftExpense" TO vane_reader;
ALTER TABLE "GoldShiftWorkerShare" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldShiftWorkerShare" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldShiftWorkerShare" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "GoldShiftAllocation" p WHERE p."id" = "GoldShiftWorkerShare"."allocationId") OR EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "GoldShiftWorkerShare"."employeeId"));
GRANT SELECT ("id", "allocationId", "employeeId", "shareWeight", "shareValueUsd") ON "GoldShiftWorkerShare" TO vane_reader_private;
ALTER TABLE "GoldLedgerCorrection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldLedgerCorrection" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldLedgerCorrection" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "entityType", "entityId", "type", "reason", "beforeJson", "afterJson", "deltaUsd", "deltaGrams", "adjustmentEntryId", "createdById", "createdAt") ON "GoldLedgerCorrection" TO vane_reader;
ALTER TABLE "BuyerReceiptCorrection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "BuyerReceiptCorrection" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "BuyerReceiptCorrection" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "buyerReceiptId", "companyId", "type", "reason", "beforeJson", "afterJson", "deltaAmountUsd", "deltaAssay", "adjustmentEntryId", "createdById", "createdAt") ON "BuyerReceiptCorrection" TO vane_reader;
ALTER TABLE "GoldInventoryEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldInventoryEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldInventoryEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "eventDate", "direction", "grams", "goldPriceUsdPerGram", "goldPriceSource", "valueUsd", "sourceType", "sourceId", "notes", "createdById", "createdAt") ON "GoldInventoryEvent" TO vane_reader;
ALTER TABLE "GoldException" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldException" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldException" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "category", "severity", "status", "entityType", "entityId", "description", "metadata", "acknowledgedById", "acknowledgedAt", "resolvedById", "resolvedAt", "createdById", "createdAt", "updatedAt") ON "GoldException" TO vane_reader;
ALTER TABLE "GoldLedgerImport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldLedgerImport" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldLedgerImport" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "uploadedById", "fileName", "rowsTotal", "rowsCreated", "rowsAnomaly", "rowsFailed", "status", "mappingsJson", "notes", "createdAt", "updatedAt", "committedAt", "name", "assignedToId", "sourceFileSha256", "tombstonedAt", "archivedAt", "presetId") ON "GoldLedgerImport" TO vane_reader;
ALTER TABLE "GoldLedgerEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldLedgerEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldLedgerEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "importId", "companyId", "lineNo", "rawJson", "rawLine", "parsedDate", "parsedName", "mappedShiftGroupId", "gramsTotal", "expensesJson", "boysGrams", "mdaraGrams", "balGrams", "status", "goldShiftAllocationId", "goldPourId", "buyerReceiptId", "errorMessage", "parserWarning", "createdAt", "updatedAt") ON "GoldLedgerEntry" TO vane_reader;
ALTER TABLE "EditingLock" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "EditingLock" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "EditingLock" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "EditingLock"."userId"));
GRANT SELECT ("resource", "userId", "expiresAt", "createdAt", "updatedAt") ON "EditingLock" TO vane_reader;
ALTER TABLE "GoldLedgerImportPreset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldLedgerImportPreset" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldLedgerImportPreset" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "mappingJson", "isDefault", "createdById", "createdAt", "updatedAt") ON "GoldLedgerImportPreset" TO vane_reader;
ALTER TABLE "GoldLedgerImportTag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldLedgerImportTag" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldLedgerImportTag" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "GoldLedgerImport" p WHERE p."id" = "GoldLedgerImportTag"."importId"));
GRANT SELECT ("id", "importId", "label", "createdAt") ON "GoldLedgerImportTag" TO vane_reader;
ALTER TABLE "GoldLedgerImportComment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldLedgerImportComment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldLedgerImportComment" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "GoldLedgerImport" p WHERE p."id" = "GoldLedgerImportComment"."importId") OR EXISTS (SELECT 1 FROM "GoldLedgerEntry" p WHERE p."id" = "GoldLedgerImportComment"."ledgerEntryId") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "GoldLedgerImportComment"."createdById"));
GRANT SELECT ("id", "importId", "ledgerEntryId", "body", "createdById", "createdAt", "updatedAt") ON "GoldLedgerImportComment" TO vane_reader;
ALTER TABLE "GoldImportSnapshot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldImportSnapshot" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldImportSnapshot" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "GoldLedgerImport" p WHERE p."id" = "GoldImportSnapshot"."importId") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "GoldImportSnapshot"."takenById"));
GRANT SELECT ("id", "importId", "takenAt", "reason", "payloadJson", "takenById") ON "GoldImportSnapshot" TO vane_reader;
ALTER TABLE "GoldImportSavedView" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldImportSavedView" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldImportSavedView" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "name", "filterJson", "createdAt", "updatedAt") ON "GoldImportSavedView" TO vane_reader;
ALTER TABLE "GoldPeriodClose" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "GoldPeriodClose" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "GoldPeriodClose" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "periodStart", "periodEnd", "closedAt", "closedById", "overrideReason", "overrideById", "overrideAt") ON "GoldPeriodClose" TO vane_reader;
ALTER TABLE "StockLocation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "StockLocation" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "StockLocation" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Site" p WHERE p."id" = "StockLocation"."siteId"));
GRANT SELECT ("id", "code", "name", "siteId", "isActive", "createdAt", "sortOrder") ON "StockLocation" TO vane_reader;
ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "InventoryItem" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "InventoryItem" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Site" p WHERE p."id" = "InventoryItem"."siteId") OR EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "InventoryItem"."productId"));
GRANT SELECT ("id", "itemCode", "name", "category", "unit", "siteId", "locationId", "currentStock", "minStock", "maxStock", "unitCost", "productId", "reorderQty", "shelf", "createdAt", "updatedAt") ON "InventoryItem" TO vane_reader;
ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "StockMovement" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "StockMovement" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "StockMovement"."issuedById"));
GRANT SELECT ("id", "referenceId", "itemId", "toLocationId", "movementType", "quantity", "unit", "issuedTo", "requestedBy", "issuedById", "approvedBy", "notes", "photoUrl", "sourceType", "sourceId", "reason", "reference", "change", "balanceAfter", "reversesId", "createdAt") ON "StockMovement" TO vane_reader;
ALTER TABLE "RetailPaymentSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPaymentSettings" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPaymentSettings" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "takeCashUsd", "takeCashZig", "takeCard", "takeEcocash", "takeInnbucks", "takeBankTransfer", "takeOnAccount", "takeVouchers", "zigRateSource", "zigChangeRounding", "ecocashMethod", "ecocashMerchantCode", "ecocashPhone", "ecocashDisplayName", "updatedById", "createdAt", "updatedAt") ON "RetailPaymentSettings" TO vane_reader;
ALTER TABLE "RetailAccountRoleMapping" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailAccountRoleMapping" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailAccountRoleMapping" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "role", "accountId", "updatedAt") ON "RetailAccountRoleMapping" TO vane_reader;
ALTER TABLE "RetailPostingSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPostingSettings" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPostingSettings" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "schedule", "updatedById", "createdAt", "updatedAt") ON "RetailPostingSettings" TO vane_reader;
ALTER TABLE "RetailPostingRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPostingRun" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPostingRun" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "trigger", "startedById", "startedAt", "finishedAt", "updatedAt", "sliceUntil", "salesPosted", "refundsPosted", "deliveriesPosted", "countsPosted", "otherPosted", "failed") ON "RetailPostingRun" TO vane_reader;
ALTER TABLE "RetailShopProfile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailShopProfile" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailShopProfile" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "businessType", "ageCheck", "licenceHours", "emptiesAndDeposits", "casesAndSingles", "licenceNumber", "licenceExpiresOn", "whatsapp", "vatRegistered", "defaultSiteId", "updatedById", "createdAt", "updatedAt") ON "RetailShopProfile" TO vane_reader;
ALTER TABLE "RetailLicenceHours" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailLicenceHours" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailLicenceHours" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "weekday", "alcoholFrom", "alcoholUntil", "createdAt", "updatedAt") ON "RetailLicenceHours" TO vane_reader;
ALTER TABLE "RetailCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailCategory" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailCategory" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "vatRate", "ageRestricted", "returnable", "depositAmount", "targetMarginPercent", "sortOrder", "archivedAt", "parentId", "vatExempt", "seededFor", "createdAt", "updatedAt") ON "RetailCategory" TO vane_reader;
ALTER TABLE "RetailRegister" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailRegister" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailRegister" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "siteId", "isActive", "deviceKind", "hasPrinter", "hasDrawer", "hasScale", "priceListId", "createdById", "createdAt", "updatedAt") ON "RetailRegister" TO vane_reader;
ALTER TABLE "RetailPrintJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPrintJob" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPrintJob" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "registerId", "kind", "payload", "status", "error", "createdById", "createdAt", "printedAt") ON "RetailPrintJob" TO vane_reader;
ALTER TABLE "RetailBundle" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailBundle" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailBundle" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "kind", "name", "barcode", "categoryId", "price", "buyQuantity", "days", "daysOfWeek", "endsOn", "siteId", "tillButton", "pausedAt", "stoppedAt", "archivedAt", "createdById", "createdAt", "updatedAt") ON "RetailBundle" TO vane_reader;
ALTER TABLE "RetailBundleItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailBundleItem" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailBundleItem" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "RetailBundle" p WHERE p."id" = "RetailBundleItem"."bundleId") OR EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "RetailBundleItem"."productId"));
GRANT SELECT ("id", "bundleId", "productId", "quantity", "sortOrder") ON "RetailBundleItem" TO vane_reader;
ALTER TABLE "RetailDevice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailDevice" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailDevice" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "registerId", "kind", "label", "appVersion", "pairedAt", "pairedById", "lastSeenAt", "unpairedAt", "unpairedById", "unpairReason", "createdAt", "updatedAt") ON "RetailDevice" TO vane_reader;
ALTER TABLE "RetailPairingThrottle" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPairingThrottle" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPairingThrottle" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "installId", "failedAttempts", "lockedUntil", "updatedAt") ON "RetailPairingThrottle" TO vane_reader;
ALTER TABLE "RetailDeviceMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailDeviceMessage" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailDeviceMessage" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "registerId", "body", "sentById", "createdAt", "dismissedAt") ON "RetailDeviceMessage" TO vane_reader;
ALTER TABLE "RetailPromotion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPromotion" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPromotion" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "promoCode", "name", "type", "value", "buyQuantity", "scope", "minBasket", "daysOfWeek", "fromTime", "toTime", "audience", "stacks", "siteId", "startsAt", "endsAt", "pausedAt", "endedAt", "createdById", "archivedAt", "createdAt", "updatedAt") ON "RetailPromotion" TO vane_reader;
ALTER TABLE "RetailVoucher" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailVoucher" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailVoucher" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "kind", "funding", "value", "balance", "percentOff", "amountOff", "copies", "usesLeft", "customerId", "holderNote", "minSale", "expiresOn", "siteId", "sendBy", "sentAt", "soldSaleId", "issuedById", "issuedAt", "expiredAt", "voidedAt", "voidedById", "voidReason", "wrongSince", "lockedUntil", "createdAt", "updatedAt") ON "RetailVoucher" TO vane_reader;
ALTER TABLE "RetailVoucherUse" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailVoucherUse" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailVoucherUse" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "voucherId", "saleId", "amount", "balanceAfter", "createdAt") ON "RetailVoucherUse" TO vane_reader;
ALTER TABLE "RetailPromotionProduct" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPromotionProduct" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPromotionProduct" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "RetailPromotion" p WHERE p."id" = "RetailPromotionProduct"."promotionId") OR EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "RetailPromotionProduct"."productId"));
GRANT SELECT ("promotionId", "productId") ON "RetailPromotionProduct" TO vane_reader;
ALTER TABLE "RetailPromotionCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPromotionCategory" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPromotionCategory" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "RetailPromotion" p WHERE p."id" = "RetailPromotionCategory"."promotionId") OR EXISTS (SELECT 1 FROM "RetailCategory" p WHERE p."id" = "RetailPromotionCategory"."categoryId"));
GRANT SELECT ("promotionId", "categoryId") ON "RetailPromotionCategory" TO vane_reader;
ALTER TABLE "RetailPurchaseOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPurchaseOrder" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPurchaseOrder" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "poNo", "siteId", "supplierName", "status", "expectedDate", "notes", "createdById", "madeByVane", "closedAt", "closedById", "closeNote", "createdAt", "updatedAt") ON "RetailPurchaseOrder" TO vane_reader;
ALTER TABLE "RetailPurchaseOrderLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPurchaseOrderLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPurchaseOrderLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "purchaseOrderId", "inventoryItemId", "itemName", "quantity", "unitCost", "lineTotal", "receivedQuantity", "createdAt") ON "RetailPurchaseOrderLine" TO vane_reader;
ALTER TABLE "RetailGoodsReceipt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailGoodsReceipt" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailGoodsReceipt" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "receiptNo", "purchaseOrderId", "siteId", "supplierName", "status", "notes", "receivedById", "createdAt", "postedAt", "updatedAt") ON "RetailGoodsReceipt" TO vane_reader;
ALTER TABLE "RetailGoodsReceiptLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailGoodsReceiptLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailGoodsReceiptLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "receiptId", "inventoryItemId", "itemName", "quantity", "unitCost", "lineTotal", "purchaseOrderLineId", "createdAt") ON "RetailGoodsReceiptLine" TO vane_reader;
ALTER TABLE "RetailShift" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailShift" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailShift" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "shiftNo", "registerCode", "registerName", "registerId", "deviceId", "siteId", "cashierId", "cashierName", "openingFloat", "openingFloatZig", "openingFloatZigBase", "floatLeft", "status", "openedAt", "closedAt", "expectedCash", "countedCash", "variance", "notes", "closedById", "countedUsd", "countedZig", "countRate", "countLines", "closeNote", "toSafe", "signOffOutcome", "signedOffAt", "signedOffById", "signOffNote", "recoverAmount", "createdAt", "updatedAt") ON "RetailShift" TO vane_reader;
ALTER TABLE "RetailCashMovement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailCashMovement" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailCashMovement" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "shiftId", "type", "amount", "currency", "exchangeRate", "baseAmount", "reasonCode", "reason", "denominations", "recordedById", "recordedByName", "approvedById", "approvedByName", "createdAt") ON "RetailCashMovement" TO vane_reader;
ALTER TABLE "RetailTillRules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailTillRules" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailTillRules" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "refundReasons", "voidReasons", "splitTender", "referenceRequired", "maxCashierDiscountPercent", "drawerOpenWithoutSale", "cashDropPromptOver", "offlineHours", "updatedById", "createdAt", "updatedAt") ON "RetailTillRules" TO vane_reader;
ALTER TABLE "RetailApprovalSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailApprovalSettings" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailApprovalSettings" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "requisitionOwnerOver", "ownerApproverId", "priceChanges", "belowCostNeedsOwner", "countDifferences", "countOwnerOver", "accountOwnerOver", "askBy", "updatedById", "createdAt", "updatedAt") ON "RetailApprovalSettings" TO vane_reader;
ALTER TABLE "RetailReceiptSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailReceiptSettings" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailReceiptSettings" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "header", "footer", "showVatNumber", "showLicenceNumber", "printLogo", "copies", "alsoSendBy", "updatedById", "createdAt", "updatedAt") ON "RetailReceiptSettings" TO vane_reader;
ALTER TABLE "RetailFiscalSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailFiscalSettings" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailFiscalSettings" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "dayClose", "whenUnreachable", "updatedById", "createdAt", "updatedAt") ON "RetailFiscalSettings" TO vane_reader;
ALTER TABLE "RetailMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailMessage" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailMessage" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "channel", "to", "template", "body", "saleId", "mediaUrl", "mediaName", "mediaKind", "scheduledFor", "status", "attempts", "lastError", "externalId", "sentAt", "createdById", "createdAt", "direction", "entityType", "entityId", "fromNumber") ON "RetailMessage" TO vane_reader;
ALTER TABLE "RetailDayClose" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailDayClose" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailDayClose" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "businessDate", "takings", "refunds", "cashDifference", "cashUsd", "cashZig", "tenders", "tills", "banked", "bankAccountId", "slipUrl", "fiscalDayNo", "zReportIds", "closedAt", "closedById", "closedByName") ON "RetailDayClose" TO vane_reader;
ALTER TABLE "RetailZReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailZReport" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailZReport" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "reportNo", "businessDate", "registerCode", "registerName", "siteId", "currency", "generatedAt", "generatedById", "generatedByName", "shiftCount", "saleCount", "refundCount", "voidCount", "approvedDiscountCount", "itemCount", "grossSales", "discountTotal", "netSales", "taxTotal", "taxRatePercent", "grossTakings", "depositTotal", "refundTotal", "voidTotal", "openingFloat", "cashTakings", "cashDropTotal", "cashTopUpTotal", "cashPayoutTotal", "cashMovementNet", "expectedCash", "countedCash", "cashVariance", "tenderBreakdown", "topItems", "cashMovements", "shifts", "createdAt") ON "RetailZReport" TO vane_reader;
ALTER TABLE "RetailHeldCart" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailHeldCart" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailHeldCart" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "holdNo", "shiftId", "cashierId", "label", "cartSnapshot", "status", "releasedAt", "releasedById", "createdAt", "updatedAt") ON "RetailHeldCart" TO vane_reader;
ALTER TABLE "RetailSale" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailSale" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailSale" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "saleNo", "clientRef", "shiftId", "sourceSaleId", "siteId", "cashierId", "cashierName", "customerName", "customerId", "approvedById", "approvedByName", "restocked", "saleType", "subtotal", "discountAmount", "taxAmount", "totalAmount", "tenderedAmount", "changeAmount", "changeZig", "currency", "exchangeRate", "baseAmount", "tenderSummary", "overrideReason", "voidReason", "status", "notes", "idCheckedAt", "depositAmount", "registerId", "deviceId", "printedAt", "reviewReason", "reviewedAt", "reviewedById", "postedAt", "fiscalWaitsSince", "vouchersSoldAmount", "discountVoucherId", "createdAt", "updatedAt") ON "RetailSale" TO vane_reader;
ALTER TABLE "RetailSaleLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailSaleLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailSaleLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "saleId", "sourceLineId", "inventoryItemId", "productId", "priceListId", "itemName", "quantity", "unitPrice", "discountAmount", "taxAmount", "lineTotal", "costUnit", "costTotal", "depositAmount", "bundleId", "bundleRef", "promotionId", "promotionDiscount", "createdAt") ON "RetailSaleLine" TO vane_reader;
ALTER TABLE "RetailDepositKind" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailDepositKind" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailDepositKind" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "amount", "name", "createdAt", "updatedAt") ON "RetailDepositKind" TO vane_reader;
ALTER TABLE "RetailEmptiesEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailEmptiesEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailEmptiesEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "supplierId", "saleId", "productId", "quantity", "depositAmount", "createdAt") ON "RetailEmptiesEntry" TO vane_reader;
ALTER TABLE "RetailSalePayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailSalePayment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailSalePayment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "saleId", "tenderType", "amount", "currency", "exchangeRate", "baseAmount", "reference", "voucherId", "createdAt") ON "RetailSalePayment" TO vane_reader;
ALTER TABLE "Equipment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Equipment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Equipment" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Site" p WHERE p."id" = "Equipment"."siteId"));
GRANT SELECT ("id", "equipmentCode", "name", "category", "siteId", "locationId", "numberOfItems", "qrCode", "isActive", "serviceHours", "serviceDays", "lastServiceDate", "nextServiceDue", "createdAt", "updatedAt") ON "Equipment" TO vane_reader;
ALTER TABLE "WorkOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "WorkOrder" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "WorkOrder" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Employee" p WHERE p."id" = "WorkOrder"."technicianId"));
GRANT SELECT ("id", "equipmentId", "issue", "downtimeStart", "downtimeEnd", "workDone", "partsUsed", "partsCost", "laborCost", "technicianId", "status", "createdAt", "updatedAt") ON "WorkOrder" TO vane_reader;
ALTER TABLE "AccountingSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "AccountingSettings" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "AccountingSettings" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "baseCurrency", "fiscalYearStartMonth", "periodLockPolicy", "legalName", "tradingName", "vatNumber", "taxNumber", "address", "phone", "email", "defaultTaxCodeId", "defaultBankAccountId", "freezeBeforeDate", "retainedEarningsAccountId", "createdAt", "updatedAt") ON "AccountingSettings" TO vane_reader;
ALTER TABLE "ChartOfAccount" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ChartOfAccount" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ChartOfAccount" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "type", "nodeType", "parentAccountId", "hierarchyPath", "level", "category", "description", "isActive", "systemManaged", "createdAt", "updatedAt") ON "ChartOfAccount" TO vane_reader;
ALTER TABLE "AccountingPeriod" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "AccountingPeriod" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "AccountingPeriod" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "startDate", "endDate", "status", "closedAt", "closedById", "reopenedAt", "reopenedById", "reopenReason", "createdAt", "updatedAt") ON "AccountingPeriod" TO vane_reader;
ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "JournalEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "JournalEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "entryNumber", "entryDate", "description", "status", "periodId", "sourceType", "sourceId", "createdById", "postedById", "postedAt", "reversedById", "reversedAt", "voidedById", "voidedAt", "periodOverrideReason", "periodOverrideById", "periodOverrideAt", "reversalOfEntryId", "createdAt", "updatedAt") ON "JournalEntry" TO vane_reader;
ALTER TABLE "AccountingIntegrationEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "AccountingIntegrationEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "AccountingIntegrationEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "sourceDomain", "sourceAction", "sourceType", "sourceId", "sourceSubtype", "siteId", "registerCode", "causationKey", "eventKey", "entryDate", "description", "amount", "netAmount", "taxAmount", "grossAmount", "deductionsAmount", "allowancesAmount", "currency", "payloadJson", "status", "attemptCount", "nextRetryAt", "lastError", "journalEntryId", "createdById", "createdAt", "updatedAt") ON "AccountingIntegrationEvent" TO vane_reader;
ALTER TABLE "JournalLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "JournalLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "JournalLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "JournalEntry" p WHERE p."id" = "JournalLine"."entryId") OR EXISTS (SELECT 1 FROM "ChartOfAccount" p WHERE p."id" = "JournalLine"."accountId") OR EXISTS (SELECT 1 FROM "CostCenter" p WHERE p."id" = "JournalLine"."costCenterId"));
GRANT SELECT ("id", "entryId", "accountId", "debit", "credit", "memo", "costCenterId", "createdAt") ON "JournalLine" TO vane_reader;
ALTER TABLE "PostingRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PostingRule" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PostingRule" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "sourceType", "description", "priority", "scopeType", "siteId", "ruleMode", "isFallback", "isActive", "createdAt", "updatedAt") ON "PostingRule" TO vane_reader;
ALTER TABLE "PostingRuleLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PostingRuleLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PostingRuleLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "PostingRule" p WHERE p."id" = "PostingRuleLine"."ruleId") OR EXISTS (SELECT 1 FROM "ChartOfAccount" p WHERE p."id" = "PostingRuleLine"."accountId") OR EXISTS (SELECT 1 FROM "TaxCode" p WHERE p."id" = "PostingRuleLine"."taxCodeId") OR EXISTS (SELECT 1 FROM "CostCenter" p WHERE p."id" = "PostingRuleLine"."costCenterId"));
GRANT SELECT ("id", "ruleId", "accountId", "direction", "basis", "allocationType", "allocationValue", "taxCodeId", "repeatMode", "accountSource", "accountRole", "valuePath", "memoTemplate", "costCenterId", "sortOrder", "createdAt") ON "PostingRuleLine" TO vane_reader;
ALTER TABLE "PostingRuleCondition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PostingRuleCondition" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PostingRuleCondition" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "PostingRule" p WHERE p."id" = "PostingRuleCondition"."ruleId"));
GRANT SELECT ("id", "ruleId", "field", "operator", "valueString", "valueListJson", "createdAt", "updatedAt") ON "PostingRuleCondition" TO vane_reader;
ALTER TABLE "TaxCode" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "TaxCode" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "TaxCode" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "rate", "type", "appliesTo", "vat7OutputBox", "vat7InputBox", "zimraTaxId", "scheduleType", "effectiveFrom", "effectiveTo", "isActive", "createdAt", "updatedAt") ON "TaxCode" TO vane_reader;
ALTER TABLE "TaxCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "TaxCategory" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "TaxCategory" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "scope", "isActive", "createdAt", "updatedAt") ON "TaxCategory" TO vane_reader;
ALTER TABLE "TaxTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "TaxTemplate" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "TaxTemplate" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "description", "isActive", "createdAt", "updatedAt") ON "TaxTemplate" TO vane_reader;
ALTER TABLE "TaxTemplateLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "TaxTemplateLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "TaxTemplateLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "TaxTemplate" p WHERE p."id" = "TaxTemplateLine"."templateId") OR EXISTS (SELECT 1 FROM "TaxCode" p WHERE p."id" = "TaxTemplateLine"."taxCodeId"));
GRANT SELECT ("id", "templateId", "taxCodeId", "sortOrder", "appliesTo", "isDefault", "createdAt", "updatedAt") ON "TaxTemplateLine" TO vane_reader;
ALTER TABLE "TaxRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "TaxRule" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "TaxRule" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "appliesTo", "priority", "taxCategoryId", "templateId", "currency", "effectiveFrom", "effectiveTo", "isActive", "createdAt", "updatedAt") ON "TaxRule" TO vane_reader;
ALTER TABLE "CurrencyDefinition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CurrencyDefinition" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CurrencyDefinition" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "symbol", "decimalPlaces", "isBase", "isActive", "sortOrder", "createdAt", "updatedAt") ON "CurrencyDefinition" TO vane_reader;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Customer" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Customer" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "taxCategoryId", "name", "contactName", "phone", "email", "address", "taxNumber", "vatNumber", "isActive", "createdAt", "updatedAt") ON "Customer" TO vane_reader;
ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Vendor" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Vendor" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "taxCategoryId", "name", "contactName", "phone", "email", "address", "taxNumber", "vatNumber", "isActive", "createdAt", "updatedAt", "code", "whatsapp", "sendOrdersOnWhatsapp", "payTermsDays", "deliversOn", "leadTimeDays", "minimumOrder", "bankDetails", "stoppedAt", "stoppedById", "createdById") ON "Vendor" TO vane_reader;
ALTER TABLE "VendorContact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VendorContact" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VendorContact" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "vendorId", "name", "role", "phone", "email", "sends", "removedAt", "createdAt", "updatedAt") ON "VendorContact" TO vane_reader;
ALTER TABLE "SalesInvoice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SalesInvoice" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SalesInvoice" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "customerId", "invoiceNumber", "invoiceDate", "dueDate", "status", "currency", "subTotal", "taxTotal", "total", "amountPaid", "creditTotal", "writeOffTotal", "notes", "fiscalStatus", "quotationId", "revision", "createdById", "madeByVane", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "SalesInvoice" TO vane_reader;
ALTER TABLE "SalesInvoiceLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SalesInvoiceLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SalesInvoiceLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "SalesInvoice" p WHERE p."id" = "SalesInvoiceLine"."invoiceId") OR EXISTS (SELECT 1 FROM "TaxCode" p WHERE p."id" = "SalesInvoiceLine"."taxCodeId"));
GRANT SELECT ("id", "invoiceId", "description", "quantity", "unitPrice", "taxCodeId", "taxRate", "taxAmount", "lineTotal", "debit", "credit", "createdAt") ON "SalesInvoiceLine" TO vane_reader;
ALTER TABLE "SalesQuotation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SalesQuotation" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SalesQuotation" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "customerId", "quotationNumber", "quotationDate", "validUntil", "status", "currency", "subTotal", "taxTotal", "total", "notes", "createdById", "madeByVane", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "SalesQuotation" TO vane_reader;
ALTER TABLE "SalesQuotationLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SalesQuotationLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SalesQuotationLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "SalesQuotation" p WHERE p."id" = "SalesQuotationLine"."quotationId") OR EXISTS (SELECT 1 FROM "TaxCode" p WHERE p."id" = "SalesQuotationLine"."taxCodeId"));
GRANT SELECT ("id", "quotationId", "description", "quantity", "unitPrice", "taxCodeId", "taxRate", "taxAmount", "lineTotal", "createdAt") ON "SalesQuotationLine" TO vane_reader;
ALTER TABLE "SalesReceipt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SalesReceipt" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SalesReceipt" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "invoiceId", "receiptNumber", "receivedAt", "amount", "method", "reference", "bankAccountId", "createdById", "createdAt") ON "SalesReceipt" TO vane_reader;
ALTER TABLE "CreditNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CreditNote" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CreditNote" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "invoiceId", "noteNumber", "noteDate", "status", "currency", "subTotal", "taxTotal", "total", "reason", "createdById", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "CreditNote" TO vane_reader;
ALTER TABLE "CreditNoteLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CreditNoteLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CreditNoteLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "CreditNote" p WHERE p."id" = "CreditNoteLine"."noteId") OR EXISTS (SELECT 1 FROM "TaxCode" p WHERE p."id" = "CreditNoteLine"."taxCodeId"));
GRANT SELECT ("id", "noteId", "description", "quantity", "unitPrice", "taxCodeId", "taxRate", "taxAmount", "lineTotal", "createdAt") ON "CreditNoteLine" TO vane_reader;
ALTER TABLE "SalesWriteOff" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SalesWriteOff" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SalesWriteOff" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "invoiceId", "amount", "reason", "status", "createdById", "createdAt") ON "SalesWriteOff" TO vane_reader;
ALTER TABLE "PurchaseBill" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PurchaseBill" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PurchaseBill" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "vendorId", "billNumber", "billDate", "dueDate", "status", "currency", "subTotal", "taxTotal", "total", "amountPaid", "debitNoteTotal", "writeOffTotal", "notes", "createdById", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "PurchaseBill" TO vane_reader;
ALTER TABLE "PurchaseBillLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PurchaseBillLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PurchaseBillLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "PurchaseBill" p WHERE p."id" = "PurchaseBillLine"."billId") OR EXISTS (SELECT 1 FROM "TaxCode" p WHERE p."id" = "PurchaseBillLine"."taxCodeId"));
GRANT SELECT ("id", "billId", "description", "quantity", "unitPrice", "taxCodeId", "taxRate", "taxAmount", "lineTotal", "debit", "credit", "createdAt") ON "PurchaseBillLine" TO vane_reader;
ALTER TABLE "PurchasePayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PurchasePayment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PurchasePayment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "billId", "paymentNumber", "paidAt", "amount", "method", "reference", "bankAccountId", "createdById", "createdAt") ON "PurchasePayment" TO vane_reader;
ALTER TABLE "DebitNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DebitNote" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DebitNote" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "billId", "noteNumber", "noteDate", "status", "currency", "subTotal", "taxTotal", "total", "reason", "createdById", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "DebitNote" TO vane_reader;
ALTER TABLE "DebitNoteLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DebitNoteLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DebitNoteLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "DebitNote" p WHERE p."id" = "DebitNoteLine"."noteId") OR EXISTS (SELECT 1 FROM "TaxCode" p WHERE p."id" = "DebitNoteLine"."taxCodeId"));
GRANT SELECT ("id", "noteId", "description", "quantity", "unitPrice", "taxCodeId", "taxRate", "taxAmount", "lineTotal", "createdAt") ON "DebitNoteLine" TO vane_reader;
ALTER TABLE "PurchaseWriteOff" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PurchaseWriteOff" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PurchaseWriteOff" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "billId", "amount", "reason", "status", "createdById", "createdAt") ON "PurchaseWriteOff" TO vane_reader;
ALTER TABLE "PaymentLedgerEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PaymentLedgerEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PaymentLedgerEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "sourceType", "sourceId", "entryDate", "accountType", "partyType", "partyId", "invoiceId", "billId", "amount", "debit", "credit", "currency", "description", "journalEntryId", "status", "createdAt", "updatedAt") ON "PaymentLedgerEntry" TO vane_reader;
ALTER TABLE "BankAccount" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "BankAccount" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "BankAccount" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "bankName", "accountNumber", "currency", "openingBalance", "isActive", "accountName", "showOnDocuments", "documentPosition", "createdAt", "updatedAt") ON "BankAccount" TO vane_reader;
ALTER TABLE "TenderAccountMapping" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "TenderAccountMapping" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "TenderAccountMapping" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "registerCode", "tenderType", "currency", "priority", "clearingAccountId", "offsetAccountId", "isActive", "createdAt", "updatedAt") ON "TenderAccountMapping" TO vane_reader;
ALTER TABLE "BankTransaction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "BankTransaction" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "BankTransaction" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "bankAccountId", "txnDate", "description", "reference", "amount", "direction", "sourceType", "sourceId", "reconciliationId", "reconciledAt", "createdAt") ON "BankTransaction" TO vane_reader;
ALTER TABLE "BankReconciliation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "BankReconciliation" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "BankReconciliation" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "bankAccountId", "startDate", "endDate", "statementBalance", "status", "createdById", "closedById", "closedAt", "createdAt", "updatedAt") ON "BankReconciliation" TO vane_reader;
ALTER TABLE "BankStatementLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "BankStatementLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "BankStatementLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "BankReconciliation" p WHERE p."id" = "BankStatementLine"."reconciliationId") OR EXISTS (SELECT 1 FROM "BankTransaction" p WHERE p."id" = "BankStatementLine"."matchedTransactionId"));
GRANT SELECT ("id", "reconciliationId", "txnDate", "description", "reference", "amount", "direction", "matchedTransactionId", "createdAt") ON "BankStatementLine" TO vane_reader;
ALTER TABLE "VatReturnSummary" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VatReturnSummary" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VatReturnSummary" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "periodStart", "periodEnd", "outputTax", "inputTax", "netTax", "createdById", "createdAt") ON "VatReturnSummary" TO vane_reader;
ALTER TABLE "VatReturn" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VatReturn" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VatReturn" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "periodStart", "periodEnd", "status", "filingCategory", "returnDueDate", "paymentDueDate", "outputTax", "inputTax", "adjustmentsTax", "netTax", "vat7BoxesJson", "schedulesJson", "referenceNumber", "notes", "preparedById", "reviewedById", "reviewedAt", "finalizedById", "finalizedAt", "filedById", "filedAt", "createdAt", "updatedAt") ON "VatReturn" TO vane_reader;
ALTER TABLE "VatReturnLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VatReturnLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VatReturnLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "VatReturn" p WHERE p."id" = "VatReturnLine"."vatReturnId"));
GRANT SELECT ("id", "vatReturnId", "taxCodeId", "code", "name", "rate", "taxableAmount", "outputTax", "inputTax", "adjustments", "netTax", "createdAt", "updatedAt") ON "VatReturnLine" TO vane_reader;
ALTER TABLE "OpeningBalanceImport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "OpeningBalanceImport" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "OpeningBalanceImport" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "effectiveDate", "sourceReference", "notes", "totalDebit", "totalCredit", "journalEntryId", "createdById", "createdAt") ON "OpeningBalanceImport" TO vane_reader;
ALTER TABLE "PeriodCloseVoucher" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PeriodCloseVoucher" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PeriodCloseVoucher" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "periodId", "closingDate", "retainedEarningsAccountId", "netResult", "journalEntryId", "createdById", "reversedAt", "reversedById", "reversedReason", "reversedJournalEntryId", "createdAt", "updatedAt") ON "PeriodCloseVoucher" TO vane_reader;
ALTER TABLE "CostCenter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CostCenter" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CostCenter" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "isActive", "createdAt", "updatedAt") ON "CostCenter" TO vane_reader;
ALTER TABLE "AccountingSeedExecution" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "AccountingSeedExecution" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "AccountingSeedExecution" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "packCode", "mode", "status", "actorId", "actorEmail", "inputJson", "summaryJson", "error", "createdAt", "updatedAt", "completedAt") ON "AccountingSeedExecution" TO vane_reader;
ALTER TABLE "CurrencyRate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CurrencyRate" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CurrencyRate" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "baseCurrency", "quoteCurrency", "rate", "effectiveDate", "createdAt", "createdById", "source") ON "CurrencyRate" TO vane_reader;
ALTER TABLE "FiscalisationProviderConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "FiscalisationProviderConfig" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "FiscalisationProviderConfig" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "providerKey", "apiBaseUrl", "username", "authType", "deviceId", "timeoutMs", "retryPolicyJson", "certificateRef", "metadataJson", "isActive", "serialNumber", "registeredAt", "registeredById", "lastOkAt", "lastFailedAt", "createdAt", "updatedAt") ON "FiscalisationProviderConfig" TO vane_reader;
ALTER TABLE "FiscalDay" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "FiscalDay" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "FiscalDay" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "providerConfigId", "deviceId", "fiscalDayNo", "status", "openedAt", "closedAt", "lastReceiptCounter", "lastReceiptGlobalNo", "closingSignature", "countersJson", "closingSince", "lastError", "createdAt", "updatedAt") ON "FiscalDay" TO vane_reader;
ALTER TABLE "FiscalReceipt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "FiscalReceipt" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "FiscalReceipt" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "invoiceId", "schoolReceiptId", "creditNoteId", "retailSaleId", "receiptNumber", "fiscalNumber", "status", "issuedAt", "qrCodeData", "signature", "providerKey", "providerReference", "requestIdempotencyKey", "rawResponseJson", "attemptCount", "nextRetryAt", "lastSyncedAt", "lastError", "receiptCounter", "receiptGlobalNo", "fiscalDayId", "receiptType", "receiptCurrency", "receiptDate", "signedTax", "createdAt", "updatedAt") ON "FiscalReceipt" TO vane_reader;
ALTER TABLE "ReportSetting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ReportSetting" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ReportSetting" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "reportKey", "enabled", "layout", "view", "updatedById", "createdAt", "updatedAt") ON "ReportSetting" TO vane_reader;
ALTER TABLE "CustomReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CustomReport" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CustomReport" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "title", "description", "document", "audience", "createdById", "updatedById", "createdAt", "updatedAt") ON "CustomReport" TO vane_reader;
ALTER TABLE "ReportTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ReportTemplate" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ReportTemplate" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "reportKey", "name", "description", "view", "params", "audience", "createdById", "createdAt", "updatedAt") ON "ReportTemplate" TO vane_reader;
ALTER TABLE "ReportTemplateUse" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ReportTemplateUse" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ReportTemplateUse" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "templateRef", "templateId", "opens", "lastOpenedAt", "lastOpenedById") ON "ReportTemplateUse" TO vane_reader;
ALTER TABLE "DocumentTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DocumentTemplate" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DocumentTemplate" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "scope", "documentType", "targetType", "sourceKey", "name", "description", "isDefault", "isActive", "createdById", "updatedById", "createdAt", "updatedAt") ON "DocumentTemplate" TO vane_reader;
ALTER TABLE "DocumentTemplateVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DocumentTemplateVersion" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DocumentTemplateVersion" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "DocumentTemplate" p WHERE p."id" = "DocumentTemplateVersion"."templateId"));
GRANT SELECT ("id", "templateId", "version", "schemaJson", "checksum", "isPublished", "publishedAt", "publishedById", "createdById", "createdAt") ON "DocumentTemplateVersion" TO vane_reader;
ALTER TABLE "DocumentRenderJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DocumentRenderJob" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DocumentRenderJob" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "templateId", "templateVersionId", "documentType", "targetType", "sourceKey", "sourceEntityId", "renderMode", "status", "payloadJson", "filtersJson", "idempotencyKey", "requestedById", "attemptCount", "maxAttempts", "queuedAt", "startedAt", "finishedAt", "nextRetryAt", "lastError", "createdAt", "updatedAt") ON "DocumentRenderJob" TO vane_reader;
ALTER TABLE "DocumentArtifact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DocumentArtifact" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DocumentArtifact" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "jobId", "companyId", "mimeType", "fileName", "blobUrl", "byteSize", "sha256", "expiresAt", "createdAt", "updatedAt") ON "DocumentArtifact" TO vane_reader;
ALTER TABLE "Permit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Permit" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Permit" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Site" p WHERE p."id" = "Permit"."siteId"));
GRANT SELECT ("id", "permitType", "permitNumber", "siteId", "issueDate", "expiryDate", "responsiblePerson", "documentUrl", "status", "createdAt", "updatedAt") ON "Permit" TO vane_reader;
ALTER TABLE "Inspection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Inspection" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Inspection" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Site" p WHERE p."id" = "Inspection"."siteId") OR EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "Inspection"."completedById"));
GRANT SELECT ("id", "siteId", "inspectionDate", "inspectorName", "inspectorOrg", "findings", "actions", "actionsDue", "completedById", "completedAt", "documentUrl", "createdAt", "updatedAt") ON "Inspection" TO vane_reader;
ALTER TABLE "Incident" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Incident" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Incident" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "Site" p WHERE p."id" = "Incident"."siteId"));
GRANT SELECT ("id", "siteId", "incidentDate", "incidentType", "severity", "description", "actionsTaken", "reportedBy", "photoUrls", "status", "createdAt", "updatedAt") ON "Incident" TO vane_reader;
ALTER TABLE "HrIncident" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "HrIncident" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "HrIncident" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "employeeId", "siteId", "sourceIncidentId", "incidentDate", "category", "severity", "status", "title", "description", "investigationNotes", "reportedById", "resolvedById", "resolvedAt", "createdAt", "updatedAt") ON "HrIncident" TO vane_reader;
ALTER TABLE "DisciplinaryAction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "DisciplinaryAction" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "DisciplinaryAction" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "incidentId", "employeeId", "actionType", "status", "summary", "notes", "effectiveDate", "penaltyAmount", "penaltyCurrency", "penaltyStatus", "createdById", "submittedById", "approvedById", "appliedById", "submittedAt", "approvedAt", "appliedAt", "createdAt", "updatedAt") ON "DisciplinaryAction" TO vane_reader;
ALTER TABLE "TrainingRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "TrainingRecord" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "TrainingRecord" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "User" p WHERE p."id" = "TrainingRecord"."userId"));
GRANT SELECT ("id", "userId", "trainingType", "trainingDate", "expiryDate", "certificateUrl", "trainedBy", "notes", "createdAt", "updatedAt") ON "TrainingRecord" TO vane_reader;
ALTER TABLE "SchoolSchemeOfWork" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolSchemeOfWork" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolSchemeOfWork" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "subjectId", "termId", "level", "weekOfTerm", "topic", "objectives", "activities", "resourcesNote", "createdAt", "updatedAt") ON "SchoolSchemeOfWork" TO vane_reader;
ALTER TABLE "SchoolMessageThread" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolMessageThread" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolMessageThread" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentId", "guardianId", "teacherProfileId", "subject", "lastMessageAt", "guardianReadAt", "staffReadAt", "closedAt", "createdAt", "updatedAt") ON "SchoolMessageThread" TO vane_reader;
ALTER TABLE "SchoolMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolMessage" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolMessage" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "threadId", "senderUserId", "senderSide", "body", "createdAt") ON "SchoolMessage" TO vane_reader;
ALTER TABLE "SchoolIdentitySettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolIdentitySettings" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolIdentitySettings" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentPrefix", "studentSeparator", "studentPadWidth", "cardAccentColor", "cardMotto", "cardShowPhoto", "cardShowGuardianPhone", "createdAt", "updatedAt") ON "SchoolIdentitySettings" TO vane_reader;
ALTER TABLE "SchoolAcademicYear" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolAcademicYear" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolAcademicYear" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "startDate", "endDate", "isActive", "createdAt", "updatedAt") ON "SchoolAcademicYear" TO vane_reader;
ALTER TABLE "SchoolTerm" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolTerm" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolTerm" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "academicYearId", "code", "name", "startDate", "endDate", "isActive", "createdAt", "updatedAt") ON "SchoolTerm" TO vane_reader;
ALTER TABLE "SchoolClass" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolClass" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolClass" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "level", "capacity", "academicYearId", "termId", "avatarUrl", "emoji", "accent", "createdAt", "updatedAt") ON "SchoolClass" TO vane_reader;
ALTER TABLE "SchoolStream" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolStream" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolStream" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "classId", "termId", "code", "name", "capacity", "createdAt", "updatedAt") ON "SchoolStream" TO vane_reader;
ALTER TABLE "SchoolTeacherProfile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolTeacherProfile" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolTeacherProfile" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "employeeId", "employeeCode", "department", "isClassTeacher", "isHod", "isActive", "avatarUrl", "accent", "createdAt", "updatedAt") ON "SchoolTeacherProfile" TO vane_reader;
ALTER TABLE "SchoolSubject" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolSubject" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolSubject" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "isCore", "passMark", "isActive", "avatarUrl", "emoji", "accent", "createdAt", "updatedAt") ON "SchoolSubject" TO vane_reader;
ALTER TABLE "SchoolClassSubject" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolClassSubject" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolClassSubject" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "classId", "streamId", "subjectId", "teacherProfileId", "isActive", "createdAt", "updatedAt") ON "SchoolClassSubject" TO vane_reader;
ALTER TABLE "SchoolStudent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolStudent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolStudent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "studentNo", "admissionNo", "firstName", "lastName", "gender", "status", "currentClassId", "currentStreamId", "isBoarding", "isPrefect", "admissionDate", "certifiedName", "house", "avatarUrl", "accent", "customFields", "createdAt", "updatedAt") ON "SchoolStudent" TO vane_reader;
GRANT SELECT ("dateOfBirth", "nationalId", "birthCertificateNo") ON "SchoolStudent" TO vane_reader_private;
ALTER TABLE "SchoolGuardian" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolGuardian" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolGuardian" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "guardianNo", "firstName", "lastName", "email", "avatarUrl", "accent", "customFields", "createdAt", "updatedAt") ON "SchoolGuardian" TO vane_reader;
GRANT SELECT ("phone", "address", "nationalId") ON "SchoolGuardian" TO vane_reader_private;
ALTER TABLE "SchoolStudentGuardian" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolStudentGuardian" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolStudentGuardian" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentId", "guardianId", "relationship", "isPrimary", "canReceiveFinancials", "canReceiveAcademicResults", "createdAt", "updatedAt") ON "SchoolStudentGuardian" TO vane_reader;
ALTER TABLE "SchoolEnrollment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolEnrollment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolEnrollment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentId", "termId", "classId", "streamId", "status", "enrolledAt", "endedAt", "notes", "createdAt", "updatedAt") ON "SchoolEnrollment" TO vane_reader;
ALTER TABLE "SchoolHostel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolHostel" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolHostel" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "genderPolicy", "capacity", "isActive", "avatarUrl", "emoji", "accent", "createdAt", "updatedAt") ON "SchoolHostel" TO vane_reader;
ALTER TABLE "SchoolHostelRoom" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolHostelRoom" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolHostelRoom" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "hostelId", "code", "floor", "capacity", "isPrefectDorm", "yearGroupIds", "isActive", "createdAt", "updatedAt") ON "SchoolHostelRoom" TO vane_reader;
ALTER TABLE "SchoolHostelBed" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolHostelBed" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolHostelBed" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "hostelId", "roomId", "code", "status", "statusReason", "bay", "tier", "isActive", "createdAt", "updatedAt") ON "SchoolHostelBed" TO vane_reader;
ALTER TABLE "SchoolBoardingAllocation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolBoardingAllocation" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolBoardingAllocation" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentId", "termId", "hostelId", "roomId", "bedId", "status", "startDate", "endDate", "reason", "createdAt", "updatedAt") ON "SchoolBoardingAllocation" TO vane_reader;
ALTER TABLE "SchoolLeaveRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolLeaveRequest" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolLeaveRequest" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentId", "allocationId", "termId", "requestType", "startDateTime", "endDateTime", "destination", "guardianContact", "status", "reason", "approvedById", "approvedAt", "checkedOutById", "checkedOutAt", "checkedInById", "checkedInAt", "createdById", "createdAt", "updatedAt") ON "SchoolLeaveRequest" TO vane_reader;
ALTER TABLE "SchoolBoardingMovementLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolBoardingMovementLog" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolBoardingMovementLog" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "leaveRequestId", "studentId", "movementType", "recordedById", "recordedAt", "notes", "createdAt", "updatedAt") ON "SchoolBoardingMovementLog" TO vane_reader;
ALTER TABLE "SchoolRollCall" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolRollCall" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolRollCall" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "hostelId", "termId", "takenOn", "session", "status", "takenById", "submittedAt", "notes", "createdAt", "updatedAt") ON "SchoolRollCall" TO vane_reader;
ALTER TABLE "SchoolRollCallEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolRollCallEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolRollCallEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "rollCallId", "studentId", "bedId", "status", "notes", "recordedAt", "createdAt", "updatedAt") ON "SchoolRollCallEntry" TO vane_reader;
ALTER TABLE "SchoolSickBayAdmission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolSickBayAdmission" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolSickBayAdmission" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentId", "termId", "bedId", "admittedAt", "dischargedAt", "dischargedTo", "reason", "notes", "admittedById", "createdAt", "updatedAt") ON "SchoolSickBayAdmission" TO vane_reader;
ALTER TABLE "SchoolResultSheet" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolResultSheet" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolResultSheet" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "classId", "streamId", "title", "status", "submittedById", "hodApprovedById", "publishedById", "submittedAt", "hodApprovedAt", "publishedAt", "createdAt", "updatedAt") ON "SchoolResultSheet" TO vane_reader;
ALTER TABLE "SchoolResultModerationAction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolResultModerationAction" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolResultModerationAction" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "sheetId", "actionType", "fromStatus", "toStatus", "actorUserId", "comment", "actedAt", "createdAt") ON "SchoolResultModerationAction" TO vane_reader;
ALTER TABLE "SchoolPublishWindow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolPublishWindow" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolPublishWindow" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "classId", "streamId", "openAt", "closeAt", "status", "notes", "createdById", "createdAt", "updatedAt") ON "SchoolPublishWindow" TO vane_reader;
ALTER TABLE "SchoolResultLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolResultLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolResultLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "sheetId", "studentId", "subjectCode", "score", "grade", "remarks", "createdAt", "updatedAt") ON "SchoolResultLine" TO vane_reader;
ALTER TABLE "SchoolFeeStructure" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolFeeStructure" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolFeeStructure" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "classId", "name", "currency", "status", "notes", "createdAt", "updatedAt") ON "SchoolFeeStructure" TO vane_reader;
ALTER TABLE "SchoolFeeStructureLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolFeeStructureLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolFeeStructureLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "feeStructureId", "feeCode", "description", "amount", "isMandatory", "sortOrder", "createdAt", "updatedAt") ON "SchoolFeeStructureLine" TO vane_reader;
ALTER TABLE "SchoolFeeInvoice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolFeeInvoice" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolFeeInvoice" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "invoiceNo", "studentId", "termId", "feeStructureId", "issueDate", "dueDate", "status", "subTotal", "taxTotal", "totalAmount", "paidAmount", "waivedAmount", "writeOffAmount", "balanceAmount", "creditAmount", "refundedAmount", "currency", "exchangeRate", "baseAmount", "notes", "issuedById", "issuedAt", "createdById", "createdAt", "updatedAt", "accountingStatus", "journalEntryId", "accountingPostedAt", "accountingError") ON "SchoolFeeInvoice" TO vane_reader;
ALTER TABLE "SchoolFeeInvoiceLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolFeeInvoiceLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolFeeInvoiceLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "invoiceId", "feeCode", "description", "quantity", "unitAmount", "taxRate", "taxAmount", "lineTotal", "createdAt", "updatedAt") ON "SchoolFeeInvoiceLine" TO vane_reader;
ALTER TABLE "SchoolFeeReceipt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolFeeReceipt" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolFeeReceipt" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "receiptNo", "studentId", "receiptDate", "paymentMethod", "reference", "amountReceived", "amountAllocated", "amountUnallocated", "refundedAmount", "currency", "exchangeRate", "baseAmount", "status", "notes", "postedById", "postedAt", "voidedById", "voidedAt", "createdById", "createdAt", "updatedAt", "accountingStatus", "journalEntryId", "accountingPostedAt", "accountingError") ON "SchoolFeeReceipt" TO vane_reader;
ALTER TABLE "SchoolFeeReceiptAllocation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolFeeReceiptAllocation" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolFeeReceiptAllocation" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "receiptId", "invoiceId", "allocatedAmount", "createdAt", "updatedAt") ON "SchoolFeeReceiptAllocation" TO vane_reader;
ALTER TABLE "SchoolFeeWaiver" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolFeeWaiver" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolFeeWaiver" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentId", "termId", "invoiceId", "waiverType", "reason", "amount", "currency", "exchangeRate", "baseAmount", "status", "approvedById", "approvedAt", "appliedById", "appliedAt", "createdById", "createdAt", "updatedAt", "accountingStatus", "journalEntryId", "accountingPostedAt", "accountingError") ON "SchoolFeeWaiver" TO vane_reader;
ALTER TABLE "SchoolFeeRefund" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolFeeRefund" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolFeeRefund" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "refundNo", "studentId", "receiptId", "invoiceId", "refundDate", "method", "reference", "reason", "amount", "currency", "exchangeRate", "baseAmount", "status", "notes", "requestedById", "paidById", "paidAt", "cancelledById", "cancelledAt", "createdAt", "updatedAt", "accountingStatus", "journalEntryId", "accountingPostedAt", "accountingError") ON "SchoolFeeRefund" TO vane_reader;
ALTER TABLE "SchoolAttendanceSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolAttendanceSession" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolAttendanceSession" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "classId", "streamId", "attendanceDate", "status", "notes", "submittedAt", "lockedAt", "createdByUserId", "submittedByUserId", "lockedByUserId", "createdAt", "updatedAt") ON "SchoolAttendanceSession" TO vane_reader;
ALTER TABLE "SchoolAttendanceSessionLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolAttendanceSessionLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolAttendanceSessionLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "sessionId", "studentId", "status", "remarks", "createdAt", "updatedAt") ON "SchoolAttendanceSessionLine" TO vane_reader;
ALTER TABLE "SchoolPeriod" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolPeriod" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolPeriod" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "code", "name", "startMinute", "endMinute", "sequence", "isTeaching", "isActive", "createdAt", "updatedAt") ON "SchoolPeriod" TO vane_reader;
ALTER TABLE "SchoolRoom" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolRoom" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolRoom" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "capacity", "kind", "isActive", "createdAt", "updatedAt") ON "SchoolRoom" TO vane_reader;
ALTER TABLE "SchoolTimetableSlot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolTimetableSlot" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolTimetableSlot" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "classSubjectId", "periodId", "dayOfWeek", "roomId", "classId", "streamId", "teacherProfileId", "createdAt", "updatedAt") ON "SchoolTimetableSlot" TO vane_reader;
ALTER TABLE "SchoolCalendarEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolCalendarEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolCalendarEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "title", "kind", "startDate", "endDate", "isTeachingDay", "notes", "createdAt", "updatedAt") ON "SchoolCalendarEvent" TO vane_reader;
ALTER TABLE "SchoolGradingScheme" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolGradingScheme" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolGradingScheme" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "continuousWeight", "examWeight", "passMark", "isDefault", "isActive", "createdAt", "updatedAt") ON "SchoolGradingScheme" TO vane_reader;
ALTER TABLE "SchoolGradingBand" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolGradingBand" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolGradingBand" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "schemeId", "grade", "minScore", "maxScore", "points", "remark", "createdAt", "updatedAt") ON "SchoolGradingBand" TO vane_reader;
ALTER TABLE "SchoolAssessment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolAssessment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolAssessment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "classSubjectId", "kind", "title", "maxScore", "weight", "assessedOn", "status", "createdById", "createdAt", "updatedAt") ON "SchoolAssessment" TO vane_reader;
ALTER TABLE "SchoolAssessmentScore" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolAssessmentScore" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolAssessmentScore" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "assessmentId", "studentId", "score", "isAbsent", "comment", "markedById", "createdAt", "updatedAt") ON "SchoolAssessmentScore" TO vane_reader;
ALTER TABLE "SchoolApplication" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolApplication" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolApplication" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "applicationNo", "firstName", "lastName", "dateOfBirth", "gender", "guardianName", "guardianPhone", "guardianEmail", "previousSchool", "source", "appliedForClassId", "intendedTermId", "stage", "assessmentScore", "assessmentAt", "offeredAt", "offerExpiresAt", "decidedById", "notes", "studentId", "createdAt", "updatedAt") ON "SchoolApplication" TO vane_reader;
ALTER TABLE "SchoolApplicationEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolApplicationEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolApplicationEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "applicationId", "fromStage", "toStage", "actorUserId", "comment", "actedAt") ON "SchoolApplicationEvent" TO vane_reader;
ALTER TABLE "SchoolHealthRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolHealthRecord" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolHealthRecord" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentId", "bloodGroup", "allergies", "chronicConditions", "medications", "dietaryRequirements", "doctorName", "doctorPhone", "medicalAidProvider", "medicalAidNumber", "consentFirstAid", "consentEmergencyTreatment", "consentPhotography", "consentOutings", "consentGivenBy", "consentGivenAt", "notes", "updatedById", "createdAt", "updatedAt") ON "SchoolHealthRecord" TO vane_reader;
ALTER TABLE "SchoolHealthEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolHealthEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolHealthEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "healthRecordId", "studentId", "kind", "occurredAt", "summary", "treatment", "guardianNotified", "recordedById", "createdAt") ON "SchoolHealthEvent" TO vane_reader;
ALTER TABLE "SchoolAssignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolAssignment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolAssignment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "classSubjectId", "title", "instructions", "dueAt", "maxScore", "isPublished", "publishedAt", "createdById", "createdAt", "updatedAt") ON "SchoolAssignment" TO vane_reader;
ALTER TABLE "SchoolAssignmentSubmission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolAssignmentSubmission" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolAssignmentSubmission" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "assignmentId", "studentId", "status", "submittedAt", "content", "attachmentUrl", "score", "feedback", "markedById", "markedAt", "createdAt", "updatedAt") ON "SchoolAssignmentSubmission" TO vane_reader;
ALTER TABLE "SchoolBook" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolBook" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolBook" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "isbn", "title", "author", "publisher", "category", "shelfMark", "createdAt", "updatedAt") ON "SchoolBook" TO vane_reader;
ALTER TABLE "SchoolBookCopy" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolBookCopy" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolBookCopy" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "bookId", "copyCode", "condition", "isWithdrawn", "createdAt", "updatedAt") ON "SchoolBookCopy" TO vane_reader;
ALTER TABLE "SchoolBookLoan" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolBookLoan" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolBookLoan" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "copyId", "studentId", "borrowedAt", "dueAt", "returnedAt", "renewals", "fineAmount", "finePaidAt", "feeInvoiceId", "issuedById", "returnedById", "notes", "createdAt", "updatedAt") ON "SchoolBookLoan" TO vane_reader;
ALTER TABLE "SchoolBookReservation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolBookReservation" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolBookReservation" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "bookId", "studentId", "reservedAt", "readyAt", "closedAt", "createdAt") ON "SchoolBookReservation" TO vane_reader;
ALTER TABLE "SchoolLessonPlan" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolLessonPlan" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolLessonPlan" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "termId", "classSubjectId", "slotId", "lessonDate", "topic", "objectives", "activities", "resourcesNote", "homeworkNote", "reflection", "createdById", "createdAt", "updatedAt") ON "SchoolLessonPlan" TO vane_reader;
ALTER TABLE "SchoolCoverAssignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolCoverAssignment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolCoverAssignment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "lessonPlanId", "coveringTeacherProfileId", "reason", "arrangedById", "arrangedAt") ON "SchoolCoverAssignment" TO vane_reader;
ALTER TABLE "SchoolTeachingResource" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolTeachingResource" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolTeachingResource" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "subjectId", "classId", "title", "description", "fileUrl", "linkUrl", "fileSize", "mimeType", "isShared", "uploadedByProfileId", "createdAt", "updatedAt") ON "SchoolTeachingResource" TO vane_reader;
ALTER TABLE "SchoolStudentGoal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolStudentGoal" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolStudentGoal" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentId", "termId", "subjectId", "targetMark", "plan", "baselineMark", "achievedAt", "teacherNote", "createdAt", "updatedAt") ON "SchoolStudentGoal" TO vane_reader;
ALTER TABLE "SchoolParentMeeting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolParentMeeting" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolParentMeeting" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "teacherProfileId", "studentId", "guardianId", "startsAt", "endsAt", "location", "notes", "outcome", "bookedAt", "cancelledAt", "createdAt", "updatedAt") ON "SchoolParentMeeting" TO vane_reader;
ALTER TABLE "SchoolTransportRoute" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolTransportRoute" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolTransportRoute" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "termFee", "vehicleReg", "driverName", "driverPhone", "capacity", "isActive", "createdAt", "updatedAt") ON "SchoolTransportRoute" TO vane_reader;
ALTER TABLE "SchoolTransportStop" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolTransportStop" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolTransportStop" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "routeId", "name", "sequence", "pickupMinute", "dropMinute", "createdAt", "updatedAt") ON "SchoolTransportStop" TO vane_reader;
ALTER TABLE "SchoolTransportRider" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolTransportRider" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolTransportRider" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "routeId", "stopId", "studentId", "termId", "startedAt", "endedAt", "feeInvoiceId", "createdAt", "updatedAt") ON "SchoolTransportRider" TO vane_reader;
ALTER TABLE "SchoolTransportBoarding" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolTransportBoarding" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolTransportBoarding" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "riderId", "onDate", "direction", "boarded", "recordedById", "createdAt") ON "SchoolTransportBoarding" TO vane_reader;
ALTER TABLE "SchoolImportJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolImportJob" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolImportJob" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "entityType", "status", "fileName", "headers", "mapping", "onDuplicate", "rowsTotal", "rowsCreated", "rowsUpdated", "rowsSkipped", "rowsFailed", "notes", "uploadedById", "createdAt", "updatedAt", "committedAt", "rolledBackAt") ON "SchoolImportJob" TO vane_reader;
ALTER TABLE "SchoolImportRow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolImportRow" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolImportRow" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "jobId", "lineNo", "status", "rawJson", "valuesJson", "issuesJson", "matchId", "matchLabel", "parserWarning", "errorMessage", "createdAt", "updatedAt") ON "SchoolImportRow" TO vane_reader;
ALTER TABLE "SchoolImportArtifact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolImportArtifact" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolImportArtifact" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "rowId", "artifactType", "artifactId", "sequence", "createdAt") ON "SchoolImportArtifact" TO vane_reader;
ALTER TABLE "SchoolConductCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolConductCategory" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolConductCategory" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "code", "name", "tone", "demeritPoints", "sortOrder", "isActive", "createdAt", "updatedAt") ON "SchoolConductCategory" TO vane_reader;
ALTER TABLE "SchoolConductIncident" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolConductIncident" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolConductIncident" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "termId", "studentId", "categoryId", "reference", "occurredAt", "summary", "location", "period", "reportedByUserId", "reportedAt", "seenByUserId", "seenAt", "sanction", "sanctionTone", "sanctionDecidedByUserId", "sanctionDecidedAt", "homeToldNeeded", "homeToldAt", "homeToldChannel", "homeToldByUserId", "createdAt", "updatedAt") ON "SchoolConductIncident" TO vane_reader;
ALTER TABLE "SchoolConductParticipant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolConductParticipant" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolConductParticipant" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "incidentId", "studentId", "sanction", "sanctionTone", "createdAt") ON "SchoolConductParticipant" TO vane_reader;
ALTER TABLE "SchoolConductAccount" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolConductAccount" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolConductAccount" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "incidentId", "authorKind", "authorUserId", "authorStudentId", "takenAt", "body", "createdAt") ON "SchoolConductAccount" TO vane_reader;
ALTER TABLE "SchoolMeritReason" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolMeritReason" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolMeritReason" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "code", "name", "kind", "defaultPoints", "sortOrder", "isActive", "createdAt", "updatedAt") ON "SchoolMeritReason" TO vane_reader;
ALTER TABLE "SchoolMeritEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolMeritEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolMeritEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "studentId", "termId", "kind", "reasonId", "points", "note", "incidentId", "awardedByUserId", "awardedAt", "reversedAt", "reversedByUserId", "reversalReason", "createdAt") ON "SchoolMeritEntry" TO vane_reader;
ALTER TABLE "SchoolDetentionSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolDetentionSession" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolDetentionSession" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "termId", "startsAt", "endsAt", "roomId", "supervisorTeacherProfileId", "label", "notes", "createdAt", "updatedAt") ON "SchoolDetentionSession" TO vane_reader;
ALTER TABLE "SchoolDetentionAward" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolDetentionAward" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolDetentionAward" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "termId", "studentId", "incidentId", "reason", "sessionsOwed", "awardedByUserId", "awardedAt", "createdAt") ON "SchoolDetentionAward" TO vane_reader;
ALTER TABLE "SchoolDetentionAttendance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolDetentionAttendance" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolDetentionAttendance" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "sessionId", "awardId", "studentId", "state", "markedAt", "markedByUserId", "movedToSessionId", "createdAt", "updatedAt") ON "SchoolDetentionAttendance" TO vane_reader;
ALTER TABLE "SchoolPastoralNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolPastoralNote" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolPastoralNote" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "studentId", "authorUserId", "writtenAt", "body", "band", "reviewDueAt", "referredTo", "referredAt", "closedAt", "createdAt", "updatedAt") ON "SchoolPastoralNote" TO vane_reader;
ALTER TABLE "SchoolPastoralNoteReader" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolPastoralNoteReader" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolPastoralNoteReader" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "noteId", "userId", "grantedByUserId", "grantedAt", "revokedAt") ON "SchoolPastoralNoteReader" TO vane_reader;
ALTER TABLE "SchoolPastoralClearance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolPastoralClearance" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolPastoralClearance" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "userId", "bands", "scope", "scopeLevel", "scopeClassId", "grantedByUserId", "grantedAt", "revokedAt", "createdAt", "updatedAt") ON "SchoolPastoralClearance" TO vane_reader;
ALTER TABLE "SchoolPastoralAccessRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolPastoralAccessRequest" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolPastoralAccessRequest" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "noteId", "requestedByUserId", "requestedAt", "reason", "outcome", "decidedByUserId", "decidedAt") ON "SchoolPastoralAccessRequest" TO vane_reader;
ALTER TABLE "SchoolExamBoard" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamBoard" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamBoard" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "isActive", "createdAt", "updatedAt") ON "SchoolExamBoard" TO vane_reader;
ALTER TABLE "SchoolExamCentre" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamCentre" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamCentre" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "boardId", "number", "name", "isActive", "createdAt", "updatedAt") ON "SchoolExamCentre" TO vane_reader;
ALTER TABLE "SchoolExamSeries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamSeries" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamSeries" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "boardId", "centreId", "name", "year", "level", "status", "cohortLevel", "entriesOpenAt", "entriesCloseAt", "lateEntriesCloseAt", "startsOn", "endsOn", "resultsDueOn", "feePerSubject", "lateFeePerSubject", "currency", "createdAt", "updatedAt") ON "SchoolExamSeries" TO vane_reader;
ALTER TABLE "SchoolExamSubject" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamSubject" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamSubject" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "boardId", "subjectId", "code", "name", "level", "isActive", "createdAt", "updatedAt") ON "SchoolExamSubject" TO vane_reader;
ALTER TABLE "SchoolExamPaper" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamPaper" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamPaper" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "seriesId", "examSubjectId", "paperNumber", "code", "sitsAt", "durationMinutes", "createdAt", "updatedAt") ON "SchoolExamPaper" TO vane_reader;
ALTER TABLE "SchoolExamSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamSession" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamSession" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "seriesId", "paperId", "startsAt", "endsAt", "label", "createdAt", "updatedAt") ON "SchoolExamSession" TO vane_reader;
ALTER TABLE "SchoolCandidate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolCandidate" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolCandidate" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "seriesId", "studentId", "candidateNumber", "certifiedName", "status", "enteredAt", "notes", "createdAt", "updatedAt") ON "SchoolCandidate" TO vane_reader;
ALTER TABLE "SchoolExamEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "seriesId", "candidateId", "examSubjectId", "status", "isLate", "fee", "currency", "feeInvoiceId", "feeInvoiceLineId", "enteredAt", "withdrawnAt", "createdAt", "updatedAt") ON "SchoolExamEntry" TO vane_reader;
ALTER TABLE "SchoolExamRoomAllocation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamRoomAllocation" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamRoomAllocation" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "sessionId", "roomId", "purpose", "capacity", "invigilatorTeacherProfileId", "invigilatorName", "createdAt", "updatedAt") ON "SchoolExamRoomAllocation" TO vane_reader;
ALTER TABLE "SchoolExamSeat" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamSeat" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamSeat" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "sessionId", "allocationId", "candidateId", "seatNumber", "createdAt", "updatedAt") ON "SchoolExamSeat" TO vane_reader;
ALTER TABLE "SchoolExamAccessArrangement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamAccessArrangement" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamAccessArrangement" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "candidateId", "kind", "extraTimePercent", "detail", "approvedAt", "approvedByUserId", "createdAt", "updatedAt") ON "SchoolExamAccessArrangement" TO vane_reader;
ALTER TABLE "SchoolExamResult" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamResult" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamResult" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "seriesId", "candidateId", "examSubjectId", "grade", "points", "isRemark", "releasedAt", "capturedByUserId", "createdAt", "updatedAt") ON "SchoolExamResult" TO vane_reader;
ALTER TABLE "SchoolExamEntryFileRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolExamEntryFileRun" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolExamEntryFileRun" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "seriesId", "builtByUserId", "builtAt", "entryCount", "candidateCount", "artifactId", "notes") ON "SchoolExamEntryFileRun" TO vane_reader;
ALTER TABLE "SchoolLeaver" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolLeaver" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolLeaver" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "studentId", "lastDay", "reason", "reasonNote", "status", "openedByUserId", "openedAt", "closedByUserId", "closedAt", "createdAt", "updatedAt") ON "SchoolLeaver" TO vane_reader;
ALTER TABLE "SchoolLeaverClearance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolLeaverClearance" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolLeaverClearance" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "leaverId", "kind", "state", "detail", "overrideNote", "markedByUserId", "markedAt", "createdAt", "updatedAt") ON "SchoolLeaverClearance" TO vane_reader;
ALTER TABLE "SchoolAlumnus" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolAlumnus" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolAlumnus" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "campusId", "studentId", "leaverId", "firstName", "lastName", "classOf", "finalClassName", "house", "email", "phone", "addressLine", "contactConsent", "consentGivenByUserId", "consentGivenAt", "destinationKind", "destination", "destinationConfirmedAt", "notes", "createdAt", "updatedAt") ON "SchoolAlumnus" TO vane_reader;
ALTER TABLE "SchoolAlumniUpdate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolAlumniUpdate" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolAlumniUpdate" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "alumnusId", "happenedOn", "summary", "documentReference", "recordedByUserId", "createdAt") ON "SchoolAlumniUpdate" TO vane_reader;
ALTER TABLE "SchoolStudentHonour" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "SchoolStudentHonour" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "SchoolStudentHonour" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "studentId", "kind", "year", "title", "detail", "createdAt", "updatedAt") ON "SchoolStudentHonour" TO vane_reader;
ALTER TABLE "CrmClient" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmClient" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmClient" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "avatarUrl", "accent", "emoji", "companyId", "clientNo", "name", "tradingName", "companyType", "registrationNumber", "taxNumber", "website", "websiteDomain", "industry", "contactName", "email", "emailNormalized", "phone", "phoneE164", "addressLine", "city", "country", "billingAddress", "accountStatus", "parentClientId", "parentRelation", "notes", "tags", "customFields", "customerId", "assignedToId", "lastContactedAt", "archivedAt", "mergedIntoId", "createdAt", "updatedAt") ON "CrmClient" TO vane_reader;
ALTER TABLE "CrmLead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmLead" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmLead" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "emoji", "avatarUrl", "accent", "companyId", "leadNo", "title", "clientId", "contactName", "contactEmail", "contactPhone", "stage", "probability", "estimatedValue", "currency", "services", "details", "source", "sourceChannel", "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "referrer", "landingPage", "assignedToId", "createdById", "lostReason", "firstContactAt", "wonAt", "lostAt", "customFields", "score", "convertedAt", "convertedById", "convertedDealId", "convertedPersonId", "convertedClientId", "archivedAt", "archivedById", "createdAt", "updatedAt") ON "CrmLead" TO vane_reader;
ALTER TABLE "CrmLeadDocument" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmLeadDocument" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmLeadDocument" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "leadId", "dealId", "type", "quotationId", "invoiceId", "receiptId", "amount", "currency", "version", "supersedesId", "revisionNote", "isDeposit", "renderTemplateId", "createdById", "createdAt") ON "CrmLeadDocument" TO vane_reader;
ALTER TABLE "CrmResource" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmResource" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmResource" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "title", "description", "kind", "url", "pathname", "contentType", "isDefault", "archivedAt", "sortOrder", "createdAt", "updatedAt") ON "CrmResource" TO vane_reader;
ALTER TABLE "CrmDocumentResource" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmDocumentResource" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmDocumentResource" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "documentId", "resourceId", "createdAt") ON "CrmDocumentResource" TO vane_reader;
ALTER TABLE "CrmDocumentApproval" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmDocumentApproval" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmDocumentApproval" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "leadDocumentId", "status", "expiresAt", "firstViewedAt", "respondedAt", "responseNote", "responderName", "createdAt", "updatedAt") ON "CrmDocumentApproval" TO vane_reader;
ALTER TABLE "CrmActivity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmActivity" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmActivity" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "type", "leadId", "clientId", "dealId", "personId", "subject", "body", "metadata", "createdById", "occurredAt", "createdAt") ON "CrmActivity" TO vane_reader;
ALTER TABLE "CrmFollowUp" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmFollowUp" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmFollowUp" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "title", "notes", "dueAt", "status", "leadId", "clientId", "dealId", "appointmentId", "assignedToId", "createdById", "completedAt", "createdAt", "updatedAt") ON "CrmFollowUp" TO vane_reader;
ALTER TABLE "CrmAppointment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmAppointment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmAppointment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "appointmentNo", "title", "leadId", "clientId", "dealId", "siteId", "assignedToId", "scheduledStart", "scheduledEnd", "location", "status", "outcomeNotes", "completedAt", "createdById", "createdAt", "updatedAt", "checklist", "siteConditions", "reportNotes", "reportCompletedAt", "latitude", "longitude", "briefSharedAt", "briefExpiresAt", "clientVisitId") ON "CrmAppointment" TO vane_reader;
ALTER TABLE "CrmQuestionSet" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmQuestionSet" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmQuestionSet" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "key", "name", "kind", "productId", "position", "isActive", "sourceTemplateKey", "quoteLines", "archivedAt", "createdById", "createdAt", "updatedAt") ON "CrmQuestionSet" TO vane_reader;
ALTER TABLE "CrmQuestion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmQuestion" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmQuestion" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "questionSetId", "key", "label", "helpText", "type", "options", "unit", "settings", "isRequired", "requiresPhoto", "needsReview", "position", "archivedAt", "createdAt", "updatedAt") ON "CrmQuestion" TO vane_reader;
ALTER TABLE "CrmSiteVisitSection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmSiteVisitSection" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmSiteVisitSection" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "appointmentId", "productId", "questionSetId", "name", "kind", "position", "createdAt", "updatedAt") ON "CrmSiteVisitSection" TO vane_reader;
ALTER TABLE "CrmSiteVisitAnswer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmSiteVisitAnswer" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmSiteVisitAnswer" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "sectionId", "questionId", "questionKey", "questionLabel", "questionType", "position", "valueText", "valueNumber", "valueBool", "valueOptions", "valueDate", "valueJson", "notes", "notApplicable", "answeredAt", "answeredById") ON "CrmSiteVisitAnswer" TO vane_reader;
ALTER TABLE "CrmSiteVisitPhoto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmSiteVisitPhoto" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmSiteVisitPhoto" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "appointmentId", "sectionId", "answerId", "evidenceKey", "blobPathname", "url", "contentType", "size", "width", "height", "caption", "fileName", "capturedAt", "latitude", "longitude", "clientPhotoId", "uploadedById", "createdAt") ON "CrmSiteVisitPhoto" TO vane_reader;
ALTER TABLE "CrmSiteVisitItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmSiteVisitItem" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmSiteVisitItem" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "appointmentId", "position", "category", "description", "quantity", "unit", "widthMm", "heightMm", "depthMm", "specNotes", "unitPrice", "createdAt", "updatedAt") ON "CrmSiteVisitItem" TO vane_reader;
ALTER TABLE "CrmOverviewLayout" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmOverviewLayout" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmOverviewLayout" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "scope", "widgets", "createdAt", "updatedAt") ON "CrmOverviewLayout" TO vane_reader;
ALTER TABLE "CrmCustomWidget" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmCustomWidget" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmCustomWidget" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "description", "entity", "aggregate", "valueField", "groupField", "filters", "display", "isShared", "createdById", "createdAt", "updatedAt") ON "CrmCustomWidget" TO vane_reader;
ALTER TABLE "CrmSavedView" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmSavedView" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmSavedView" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "register", "name", "state", "isShared", "createdById", "createdAt", "updatedAt") ON "CrmSavedView" TO vane_reader;
ALTER TABLE "CrmFieldChange" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmFieldChange" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmFieldChange" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "entity", "recordId", "field", "oldValue", "newValue", "changedById", "createdAt") ON "CrmFieldChange" TO vane_reader;
ALTER TABLE "CrmTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmTemplate" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmTemplate" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "kind", "attributes", "blocks", "isShared", "isActive", "linkedEntity", "linkedRecordId", "viewCount", "submitCount", "lastViewedAt", "lastSubmitAt", "createdById", "createdAt", "updatedAt") ON "CrmTemplate" TO vane_reader;
ALTER TABLE "CrmTemplateEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmTemplateEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmTemplateEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "templateId", "type", "source", "payload", "createdAt") ON "CrmTemplateEvent" TO vane_reader;
ALTER TABLE "CrmIntakeForm" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmIntakeForm" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmIntakeForm" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "isActive", "headline", "description", "fields", "services", "allowPhotos", "maxPhotos", "successMessage", "defaultAssigneeId", "createdById", "createdAt", "updatedAt") ON "CrmIntakeForm" TO vane_reader;
ALTER TABLE "CrmIntakeSubmission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmIntakeSubmission" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmIntakeSubmission" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "formId", "status", "contactName", "email", "emailNormalized", "phone", "phoneE164", "selectedServices", "answers", "photoUrls", "message", "source", "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "referrer", "landingPage", "leadId", "clientId", "createdAt") ON "CrmIntakeSubmission" TO vane_reader;
ALTER TABLE "CrmFacebookConnection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmFacebookConnection" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmFacebookConnection" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "pageId", "pageName", "appId", "formIds", "defaultChannel", "defaultSourceLabel", "defaultAssigneeId", "isActive", "verifiedAt", "lastEventAt", "lastError", "lastErrorAt", "createdById", "createdAt", "updatedAt") ON "CrmFacebookConnection" TO vane_reader;
ALTER TABLE "CrmFacebookLeadEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmFacebookLeadEvent" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmFacebookLeadEvent" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "connectionId", "companyId", "leadgenId", "pageId", "formId", "adId", "adgroupId", "campaignId", "status", "signatureVerified", "payloadJson", "fieldsJson", "leadId", "error", "processedAt", "createdAt") ON "CrmFacebookLeadEvent" TO vane_reader;
ALTER TABLE "CrmLeadSource" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmLeadSource" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmLeadSource" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "channel", "isActive", "createdAt", "updatedAt") ON "CrmLeadSource" TO vane_reader;
ALTER TABLE "CrmCommissionRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmCommissionRule" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmCommissionRule" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "basis", "appliesToUserId", "isActive", "effectiveFrom", "effectiveTo", "createdAt", "updatedAt") ON "CrmCommissionRule" TO vane_reader;
ALTER TABLE "CrmCommissionTier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmCommissionTier" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmCommissionTier" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "CrmCommissionRule" p WHERE p."id" = "CrmCommissionTier"."ruleId"));
GRANT SELECT ("id", "ruleId", "thresholdFrom", "ratePercent", "sortOrder") ON "CrmCommissionTier" TO vane_reader;
ALTER TABLE "CrmCommissionEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmCommissionEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmCommissionEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "repId", "leadId", "leadDocumentId", "ruleId", "basis", "periodKey", "baseAmount", "ratePercent", "amount", "currency", "status", "approvedById", "paidAt", "notes", "calculatedAt", "createdAt", "updatedAt") ON "CrmCommissionEntry" TO vane_reader;
ALTER TABLE "CrmPerson" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmPerson" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmPerson" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "avatarUrl", "accent", "emoji", "companyId", "personNo", "firstName", "lastName", "fullName", "jobTitle", "email", "emailNormalized", "additionalEmails", "phone", "phoneE164", "additionalPhones", "contactType", "preferredChannel", "addressLine", "city", "country", "notes", "tags", "clientId", "assignedToId", "sourceType", "convertedFromLeadId", "customFields", "lastContactedAt", "archivedAt", "mergedIntoId", "createdById", "createdAt", "updatedAt") ON "CrmPerson" TO vane_reader;
ALTER TABLE "CrmPersonCompany" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmPersonCompany" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmPersonCompany" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "personId", "clientId", "jobTitle", "isPrimary", "createdAt") ON "CrmPersonCompany" TO vane_reader;
ALTER TABLE "CrmSite" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmSite" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmSite" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "avatarUrl", "accent", "emoji", "companyId", "siteNo", "name", "clientId", "addressLine", "city", "country", "latitude", "longitude", "primaryContactId", "accessInstructions", "siteConditions", "photos", "notes", "tags", "customFields", "archivedAt", "createdById", "createdAt", "updatedAt") ON "CrmSite" TO vane_reader;
ALTER TABLE "CrmDeal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmDeal" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmDeal" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "avatarUrl", "accent", "emoji", "companyId", "dealNo", "title", "clientId", "primaryContactId", "siteId", "pipelineId", "stageId", "status", "value", "currency", "probability", "forecastCategory", "expectedCloseDate", "assignedToId", "services", "source", "sourceChannel", "lostReason", "customFields", "stageEnteredAt", "wonAt", "lostAt", "convertedFromLeadId", "archivedAt", "createdById", "createdAt", "updatedAt") ON "CrmDeal" TO vane_reader;
ALTER TABLE "CrmDealContact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmDealContact" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmDealContact" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "dealId", "personId", "role", "notes", "createdAt") ON "CrmDealContact" TO vane_reader;
ALTER TABLE "CrmPipeline" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmPipeline" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmPipeline" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "description", "isDefault", "isActive", "position", "createdById", "createdAt", "updatedAt") ON "CrmPipeline" TO vane_reader;
ALTER TABLE "CrmPipelineStage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmPipelineStage" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmPipelineStage" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "pipelineId", "name", "position", "status", "probability", "inactivityDays", "requiredFields", "checklist", "requiresSiteVisit", "requiresQuotation", "archivedAt", "createdAt", "updatedAt") ON "CrmPipelineStage" TO vane_reader;
ALTER TABLE "CrmFieldDefinition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmFieldDefinition" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmFieldDefinition" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "entity", "key", "label", "description", "type", "isRequired", "defaultValue", "options", "section", "position", "showInTable", "archivedAt", "createdById", "createdAt", "updatedAt") ON "CrmFieldDefinition" TO vane_reader;
ALTER TABLE "CrmList" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmList" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmList" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "entity", "name", "description", "isShared", "createdById", "createdAt", "updatedAt") ON "CrmList" TO vane_reader;
ALTER TABLE "CrmListMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmListMember" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmListMember" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "listId", "recordId", "addedById", "createdAt") ON "CrmListMember" TO vane_reader;
ALTER TABLE "CrmTask" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmTask" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmTask" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "title", "description", "type", "priority", "status", "dueAt", "hasDueTime", "remindAt", "outcome", "outcomeNotes", "completedAt", "assignedToId", "createdById", "leadId", "dealId", "clientId", "personId", "siteId", "recurrence", "recurrenceInterval", "recurredFromId", "createdAt", "updatedAt", "subjectType", "subjectId") ON "CrmTask" TO vane_reader;
ALTER TABLE "CrmComment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmComment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmComment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "body", "parentId", "isPinned", "resolvedAt", "resolvedById", "editedAt", "leadId", "dealId", "clientId", "personId", "siteId", "createdById", "createdAt", "updatedAt", "subjectType", "subjectId") ON "CrmComment" TO vane_reader;
ALTER TABLE "CrmRecordFile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmRecordFile" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmRecordFile" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "url", "size", "contentType", "note", "leadId", "dealId", "clientId", "personId", "siteId", "userId", "uploadedById", "createdAt", "subjectType", "subjectId") ON "CrmRecordFile" TO vane_reader;
ALTER TABLE "CrmMention" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmMention" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmMention" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "commentId", "userId", "readAt", "createdAt") ON "CrmMention" TO vane_reader;
ALTER TABLE "CrmFollower" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmFollower" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmFollower" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "entity", "recordId", "createdAt") ON "CrmFollower" TO vane_reader;
ALTER TABLE "CrmAutomation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmAutomation" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmAutomation" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "description", "trigger", "triggerConfig", "conditions", "actions", "isEnabled", "runCount", "lastRunAt", "createdById", "createdAt", "updatedAt") ON "CrmAutomation" TO vane_reader;
ALTER TABLE "CrmAutomationRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmAutomationRun" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmAutomationRun" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "automationId", "entity", "recordId", "status", "result", "durationMs", "actionCount", "createdAt") ON "CrmAutomationRun" TO vane_reader;
ALTER TABLE "CrmDiscountApproval" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmDiscountApproval" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmDiscountApproval" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "documentId", "discountPercent", "discountAmount", "reason", "status", "requestedById", "decidedById", "decidedAt", "decisionNote", "createdAt", "updatedAt") ON "CrmDiscountApproval" TO vane_reader;
ALTER TABLE "CrmCollectionNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmCollectionNote" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmCollectionNote" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "documentId", "invoiceId", "clientId", "outcome", "promisedAt", "promisedAmount", "notes", "createdById", "createdAt") ON "CrmCollectionNote" TO vane_reader;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "Product" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "Product" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "description", "kind", "category", "categoryId", "unit", "unitLabel", "standardPrice", "costPrice", "defaultTaxRate", "currency", "maxDiscountPercent", "barcode", "ageRestricted", "returnable", "depositAmount", "packOfId", "packSize", "breakAtTill", "openPrice", "supplierId", "imageUrl", "notes", "isActive", "archivedAt", "attributes", "createdById", "createdAt", "updatedAt") ON "Product" TO vane_reader;
ALTER TABLE "PriceList" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PriceList" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PriceList" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "kind", "isDefault", "region", "currency", "taxInclusive", "state", "audience", "whenKind", "daysOfWeek", "fromTime", "toTime", "startsOn", "endsOn", "siteId", "minQuantity", "basis", "basisListId", "adjustPercent", "archivedAt", "updatedById", "createdAt", "updatedAt") ON "PriceList" TO vane_reader;
ALTER TABLE "PriceListCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "PriceListCategory" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "PriceListCategory" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "PriceList" p WHERE p."id" = "PriceListCategory"."priceListId") OR EXISTS (SELECT 1 FROM "RetailCategory" p WHERE p."id" = "PriceListCategory"."categoryId"));
GRANT SELECT ("priceListId", "categoryId") ON "PriceListCategory" TO vane_reader;
ALTER TABLE "ProductPrice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ProductPrice" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ProductPrice" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "priceListId", "productId", "minQuantity", "unitPrice", "followsBase", "createdAt", "updatedAt") ON "ProductPrice" TO vane_reader;
ALTER TABLE "ProductPriceChange" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "ProductPriceChange" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "ProductPriceChange" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "priceListId", "productId", "minQuantity", "fromPrice", "toPrice", "source", "batchId", "effectiveAt", "appliedAt", "cancelledAt", "createdById", "createdAt") ON "ProductPriceChange" TO vane_reader;
ALTER TABLE "CrmProject" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmProject" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmProject" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "projectNo", "name", "description", "status", "dealId", "clientId", "siteId", "managerId", "startDate", "targetEndDate", "actualEndDate", "budget", "currency", "costCenterId", "customFields", "createdById", "createdAt", "updatedAt") ON "CrmProject" TO vane_reader;
ALTER TABLE "CrmProjectMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmProjectMember" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmProjectMember" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "projectId", "userId", "role", "addedAt") ON "CrmProjectMember" TO vane_reader;
ALTER TABLE "CrmRequisition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmRequisition" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmRequisition" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "requisitionNo", "status", "category", "purpose", "notes", "projectId", "siteId", "amount", "currency", "requestedById", "neededBy", "submittedAt", "approvedById", "approvedAt", "approvedAmount", "decisionNote", "disbursedById", "disbursedAt", "bankAccountId", "acquittedAt", "acquittedAmount", "receiptsWaivedById", "receiptWaiverNote", "createdAt", "updatedAt") ON "CrmRequisition" TO vane_reader;
ALTER TABLE "CrmDailyLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmDailyLog" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmDailyLog" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "logDate", "notes", "submittedAt", "createdAt", "updatedAt") ON "CrmDailyLog" TO vane_reader;
ALTER TABLE "CrmDailyCostEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmDailyCostEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmDailyCostEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "logId", "direction", "category", "amount", "currency", "description", "projectId", "requisitionId", "invoiceDocumentId", "receiptUrl", "receiptPathname", "clientEntryId", "createdAt", "updatedAt") ON "CrmDailyCostEntry" TO vane_reader;
ALTER TABLE "CrmDailyReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmDailyReport" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmDailyReport" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "reportDate", "summary", "generatedAt", "sentAt") ON "CrmDailyReport" TO vane_reader;
ALTER TABLE "CrmWorkOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmWorkOrder" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmWorkOrder" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "workOrderNo", "title", "description", "status", "priority", "dealId", "clientId", "siteId", "documentId", "projectId", "scheduledStart", "scheduledEnd", "startedAt", "completedAt", "assignedToId", "crewIds", "signOffAskedAt", "signOffAt", "signOffName", "signOffRating", "signOffNotes", "addressLine", "accessNotes", "contactName", "contactPhone", "signedByName", "signatureUrl", "signedAt", "customerRating", "completionNotes", "photos", "blockedReason", "customFields", "createdById", "createdAt", "updatedAt") ON "CrmWorkOrder" TO vane_reader;
ALTER TABLE "CrmWorkOrderItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "CrmWorkOrderItem" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "CrmWorkOrderItem" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "workOrderId", "position", "description", "quantity", "completedQuantity", "unit", "productId", "notes", "createdAt", "updatedAt") ON "CrmWorkOrderItem" TO vane_reader;
ALTER TABLE "RetailStockTransfer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailStockTransfer" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailStockTransfer" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "transferNo", "fromSiteId", "toSiteId", "status", "sentAt", "sentById", "driver", "vehicle", "arrives", "note", "receivedAt", "receivedById", "cancelledAt", "cancelledById", "createdAt", "updatedAt") ON "RetailStockTransfer" TO vane_reader;
ALTER TABLE "RetailStockTransferLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailStockTransferLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailStockTransferLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "transferId", "productId", "fromItemId", "toItemId", "quantitySent", "quantityReceived", "quantityLost", "unitCost", "createdAt", "updatedAt") ON "RetailStockTransferLine" TO vane_reader;
ALTER TABLE "RetailStockCount" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailStockCount" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailStockCount" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "countNo", "siteId", "name", "scope", "categoryIds", "placeId", "blind", "keepSelling", "status", "counterId", "createdById", "firstCountedAt", "submittedAt", "approvedAt", "approvedById", "cancelledAt", "cancelledById", "differenceValue", "shortValue", "overValue", "createdAt", "updatedAt") ON "RetailStockCount" TO vane_reader;
ALTER TABLE "RetailStockCountLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailStockCountLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailStockCountLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "countId", "inventoryItemId", "productId", "expected", "counted", "countedAt", "countedById", "expectedAtCount", "difference", "unitCost", "why", "recount", "sortKey", "createdAt", "updatedAt") ON "RetailStockCountLine" TO vane_reader;
ALTER TABLE "RetailImport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailImport" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailImport" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "fileName", "rowCount", "status", "siteId", "createdById", "createdAt", "importedAt", "importedById", "createdCount", "updatedCount", "skippedCount") ON "RetailImport" TO vane_reader;
ALTER TABLE "RetailImportRow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailImportRow" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailImportRow" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "RetailImport" p WHERE p."id" = "RetailImportRow"."importId"));
GRANT SELECT ("id", "importId", "rowNo", "name", "category", "price", "barcode", "cost", "supplier", "packSize", "openingStock", "action", "matchedProductId", "problems", "problemArgs") ON "RetailImportRow" TO vane_reader;
ALTER TABLE "VaneItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VaneItem" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VaneItem" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "kind", "sourceModule", "subjectType", "subjectId", "headline", "body", "action", "readFrom", "sql", "status", "mutedReason", "audienceRole", "audienceUserId", "jobId", "createdAt", "resolvedAt", "resolvedById") ON "VaneItem" TO vane_reader;
ALTER TABLE "VanePlan" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VanePlan" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VanePlan" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "title", "dueOn", "status", "createdAt", "doneAt") ON "VanePlan" TO vane_reader;
ALTER TABLE "VanePlanStep" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VanePlanStep" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VanePlanStep" AS RESTRICTIVE FOR SELECT TO vane_reader USING (EXISTS (SELECT 1 FROM "VanePlan" p WHERE p."id" = "VanePlanStep"."planId"));
GRANT SELECT ("id", "planId", "position", "label", "owner", "status", "progressLabel", "doneAt") ON "VanePlanStep" TO vane_reader;
ALTER TABLE "VaneJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VaneJob" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VaneJob" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "key", "kind", "label", "trigger", "requestedById", "status", "attempts", "runAfter", "startedAt", "finishedAt", "progressDone", "progressTotal", "model", "tokensIn", "tokensOut", "cacheReadTokens", "cacheWriteTokens", "tools", "result", "error", "createdAt") ON "VaneJob" TO vane_reader;
ALTER TABLE "VaneSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VaneSettings" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VaneSettings" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "paused", "watches", "raiseIssues", "plans", "drafts", "readsPeoplePrivate", "quietFrom", "quietTo", "routing", "monthlyAllowance", "updatedAt") ON "VaneSettings" TO vane_reader;
