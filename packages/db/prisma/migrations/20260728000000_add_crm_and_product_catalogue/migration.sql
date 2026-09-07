-- The CRM and product-catalogue schema, which the migration history never had.
--
-- These forty tables and thirty-four enums were built with `prisma db push`
-- and no migration was ever written for them. Everything replays onto an empty
-- database up to this point; the seven migrations that follow all alter a CRM
-- table, so without this the history stops here and a new production database
-- cannot be built at all (S-3.2).
--
-- This is the schema as it stood on 2026-07-28: the tables in their current
-- form minus every column and index the migrations after it go on to add, so
-- those seven still do exactly what they say and were left untouched.
-- `CrmRecordFile` is absent for the same reason — 20260731100000 creates it.
--
-- A database that was built by `db push` already has all of this. Mark this
-- migration applied there rather than running it:
--   npx prisma migrate resolve --applied 20260728000000_add_crm_and_product_catalogue

-- CreateEnum
CREATE TYPE "CrmLeadChannel" AS ENUM ('MANUAL', 'WEB_FORM', 'WEBHOOK', 'SOCIAL', 'ADS', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmLeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT', 'QUOTED', 'INVOICED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'STAGE_CHANGE', 'INTAKE_SUBMISSION', 'DOCUMENT_CREATED', 'DOCUMENT_SENT', 'DOCUMENT_APPROVED', 'DOCUMENT_DECLINED', 'PAYMENT_RECORDED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CrmFollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmAppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CrmDocumentType" AS ENUM ('QUOTATION', 'INVOICE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "CrmApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CrmIntakeSubmissionStatus" AS ENUM ('NEW', 'CONVERTED', 'ARCHIVED', 'SPAM');

-- CreateEnum
CREATE TYPE "CrmCommissionBasis" AS ENUM ('INVOICED', 'PAID');

-- CreateEnum
CREATE TYPE "CrmCommissionEntryStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "CrmViewType" AS ENUM ('TABLE', 'BOARD', 'CALENDAR');

-- CreateEnum
CREATE TYPE "CrmCompanyType" AS ENUM ('CUSTOMER', 'PROSPECT', 'SUPPLIER', 'PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmCompanyRelation" AS ENUM ('HEAD_OFFICE', 'BRANCH', 'SUBSIDIARY', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "CrmAccountStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'INACTIVE', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "CrmContactType" AS ENUM ('CUSTOMER', 'DECISION_MAKER', 'SITE_CONTACT', 'FINANCE_CONTACT', 'SUPPLIER_CONTACT', 'REFERRAL_PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmPreferredChannel" AS ENUM ('PHONE', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "CrmDealContactRole" AS ENUM ('PRIMARY', 'DECISION_MAKER', 'FINANCE', 'SITE', 'TECHNICAL', 'INFLUENCER', 'REFERRER');

-- CreateEnum
CREATE TYPE "CrmDealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmForecastCategory" AS ENUM ('PIPELINE', 'BEST_CASE', 'COMMIT', 'CLOSED');

-- CreateEnum
CREATE TYPE "CrmFieldEntity" AS ENUM ('PERSON', 'COMPANY', 'LEAD', 'DEAL', 'SITE', 'WORK_ORDER');

-- CreateEnum
CREATE TYPE "CrmFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'PERCENT', 'DATE', 'DATETIME', 'CHECKBOX', 'SINGLE_SELECT', 'MULTI_SELECT', 'PHONE', 'EMAIL', 'URL', 'ADDRESS', 'USER', 'PERSON', 'COMPANY', 'SITE');

-- CreateEnum
CREATE TYPE "CrmTaskType" AS ENUM ('CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'VISIT_PREP', 'DOCUMENT_FOLLOW_UP', 'PAYMENT_FOLLOW_UP', 'GENERAL');

-- CreateEnum
CREATE TYPE "CrmTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CrmTaskStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrmTaskOutcome" AS ENUM ('ANSWERED', 'NO_ANSWER', 'CALL_BACK_LATER', 'QUALIFIED', 'NOT_INTERESTED', 'REPLIED', 'NO_REPLY', 'ATTENDED', 'NO_SHOW', 'DONE');

-- CreateEnum
CREATE TYPE "CrmRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "CrmAutomationTrigger" AS ENUM ('LEAD_CREATED', 'LEAD_STAGE_CHANGED', 'DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'TASK_OVERDUE', 'RECORD_IDLE', 'DOCUMENT_APPROVED', 'PAYMENT_RECEIVED');

-- CreateEnum
CREATE TYPE "CrmAutomationRunStatus" AS ENUM ('SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('GOODS', 'SERVICE', 'LABOUR', 'MATERIAL', 'BUNDLE');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('EACH', 'METRE', 'SQUARE_METRE', 'HOUR', 'DAY', 'PACKAGE', 'INSTALLATION', 'LITRE', 'KILOGRAM', 'OTHER');

-- CreateEnum
CREATE TYPE "PriceListKind" AS ENUM ('STANDARD', 'WHOLESALE', 'TRADE', 'VIP', 'REGIONAL');

-- CreateEnum
CREATE TYPE "CrmApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "CrmCollectionOutcome" AS ENUM ('PROMISED_TO_PAY', 'DISPUTED', 'NO_ANSWER', 'PARTIAL_PAYMENT', 'PAID', 'ESCALATED');

-- CreateEnum
CREATE TYPE "CrmWorkOrderStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- AlterEnum

-- This migration adds more than one value to an enum.

-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationEntityType" ADD VALUE 'CRM_LEAD';
ALTER TYPE "NotificationEntityType" ADD VALUE 'CRM_DOCUMENT';
ALTER TYPE "NotificationEntityType" ADD VALUE 'CRM_TASK';
ALTER TYPE "NotificationEntityType" ADD VALUE 'CRM_COMMENT';

-- AlterEnum

-- This migration adds more than one value to an enum.

-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CRM_LEAD_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'CRM_LEAD_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'CRM_DOCUMENT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'CRM_DOCUMENT_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'CRM_FOLLOW_UP_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'CRM_TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'CRM_TASK_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'CRM_MENTIONED';
ALTER TYPE "NotificationType" ADD VALUE 'CRM_COMMENT_ADDED';

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "RetailCatalogItem" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN     "quotationId" TEXT;

-- AlterTable
ALTER TABLE "UserNotificationPreference" ADD COLUMN     "crmEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CrmClient" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradingName" TEXT,
    "companyType" "CrmCompanyType" NOT NULL DEFAULT 'CUSTOMER',
    "registrationNumber" TEXT,
    "taxNumber" TEXT,
    "website" TEXT,
    "websiteDomain" TEXT,
    "industry" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "phoneE164" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "country" TEXT,
    "billingAddress" TEXT,
    "accountStatus" "CrmAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "parentClientId" TEXT,
    "parentRelation" "CrmCompanyRelation",
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB,
    "customerId" TEXT,
    "assignedToId" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadNo" TEXT NOT NULL,
    "title" TEXT,
    "clientId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "stage" "CrmLeadStage" NOT NULL DEFAULT 'NEW',
    "probability" INTEGER,
    "estimatedValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "details" JSONB,
    "source" TEXT,
    "sourceChannel" "CrmLeadChannel" NOT NULL DEFAULT 'MANUAL',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "referrer" TEXT,
    "landingPage" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "lostReason" TEXT,
    "firstContactAt" TIMESTAMP(3),
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "customFields" JSONB,
    "score" INTEGER,
    "convertedAt" TIMESTAMP(3),
    "convertedById" TEXT,
    "convertedDealId" TEXT,
    "convertedPersonId" TEXT,
    "convertedClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLeadDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadId" TEXT,
    "dealId" TEXT,
    "type" "CrmDocumentType" NOT NULL,
    "quotationId" TEXT,
    "invoiceId" TEXT,
    "receiptId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "revisionNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmLeadDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDocumentApproval" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadDocumentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "CrmApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "responderName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDocumentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CrmActivityType" NOT NULL,
    "leadId" TEXT,
    "clientId" TEXT,
    "dealId" TEXT,
    "personId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFollowUp" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "CrmFollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "leadId" TEXT,
    "clientId" TEXT,
    "dealId" TEXT,
    "appointmentId" TEXT,
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAppointment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "appointmentNo" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Site visit',
    "leadId" TEXT,
    "clientId" TEXT,
    "dealId" TEXT,
    "siteId" TEXT,
    "assignedToId" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3),
    "location" TEXT,
    "status" "CrmAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "outcomeNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "checklist" JSONB,
    "photos" JSONB,
    "siteConditions" TEXT,
    "reportNotes" TEXT,
    "reportCompletedAt" TIMESTAMP(3),

    CONSTRAINT "CrmAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSiteVisitItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT,
    "widthMm" DOUBLE PRECISION,
    "heightMm" DOUBLE PRECISION,
    "depthMm" DOUBLE PRECISION,
    "specNotes" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSiteVisitItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSavedView" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entity" TEXT NOT NULL DEFAULT 'LEAD',
    "name" TEXT NOT NULL,
    "viewType" "CrmViewType" NOT NULL DEFAULT 'TABLE',
    "filters" JSONB NOT NULL,
    "sort" JSONB,
    "columns" JSONB,
    "groupBy" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmIntakeForm" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "headline" TEXT,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "services" JSONB NOT NULL,
    "allowPhotos" BOOLEAN NOT NULL DEFAULT true,
    "maxPhotos" INTEGER NOT NULL DEFAULT 5,
    "successMessage" TEXT,
    "defaultAssigneeId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmIntakeForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmIntakeSubmission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "formId" TEXT,
    "apiKeyId" TEXT,
    "status" "CrmIntakeSubmissionStatus" NOT NULL DEFAULT 'NEW',
    "contactName" TEXT NOT NULL,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "phoneE164" TEXT,
    "selectedServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answers" JSONB,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message" TEXT,
    "source" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "referrer" TEXT,
    "landingPage" TEXT,
    "leadId" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmIntakeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmApiKey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "defaultChannel" "CrmLeadChannel",
    "defaultSourceLabel" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLeadSource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CrmLeadChannel" NOT NULL DEFAULT 'OTHER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCommissionRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basis" "CrmCommissionBasis" NOT NULL DEFAULT 'INVOICED',
    "appliesToUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCommissionTier" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "thresholdFrom" DOUBLE PRECISION NOT NULL,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CrmCommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCommissionEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "leadId" TEXT,
    "leadDocumentId" TEXT,
    "ruleId" TEXT,
    "basis" "CrmCommissionBasis" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "CrmCommissionEntryStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCommissionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmPerson" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "personNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "email" TEXT,
    "emailNormalized" TEXT,
    "additionalEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "phoneE164" TEXT,
    "additionalPhones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactType" "CrmContactType" NOT NULL DEFAULT 'CUSTOMER',
    "preferredChannel" "CrmPreferredChannel",
    "addressLine" TEXT,
    "city" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clientId" TEXT,
    "assignedToId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "convertedFromLeadId" TEXT,
    "customFields" JSONB,
    "lastContactedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "mergedIntoId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmPersonCompany" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobTitle" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmPersonCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "primaryContactId" TEXT,
    "accessInstructions" TEXT,
    "siteConditions" TEXT,
    "photos" JSONB,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDeal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" TEXT,
    "primaryContactId" TEXT,
    "siteId" TEXT,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "status" "CrmDealStatus" NOT NULL DEFAULT 'OPEN',
    "value" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "probability" INTEGER,
    "forecastCategory" "CrmForecastCategory" NOT NULL DEFAULT 'PIPELINE',
    "expectedCloseDate" TIMESTAMP(3),
    "assignedToId" TEXT,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "sourceChannel" "CrmLeadChannel" NOT NULL DEFAULT 'MANUAL',
    "lostReason" TEXT,
    "customFields" JSONB,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "convertedFromLeadId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDealContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "CrmDealContactRole" NOT NULL DEFAULT 'PRIMARY',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmDealContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmPipeline" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmPipelineStage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "CrmDealStatus" NOT NULL DEFAULT 'OPEN',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "colorToken" TEXT,
    "inactivityDays" INTEGER,
    "requiredFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checklist" JSONB,
    "requiresSiteVisit" BOOLEAN NOT NULL DEFAULT false,
    "requiresQuotation" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFieldDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entity" "CrmFieldEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" "CrmFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" JSONB,
    "options" JSONB,
    "section" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "showInTable" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmList" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entity" "CrmFieldEntity" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmListMember" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmListMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "CrmTaskType" NOT NULL DEFAULT 'GENERAL',
    "priority" "CrmTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "CrmTaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "hasDueTime" BOOLEAN NOT NULL DEFAULT false,
    "remindAt" TIMESTAMP(3),
    "outcome" "CrmTaskOutcome",
    "outcomeNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdById" TEXT,
    "leadId" TEXT,
    "dealId" TEXT,
    "clientId" TEXT,
    "personId" TEXT,
    "siteId" TEXT,
    "recurrence" "CrmRecurrence" NOT NULL DEFAULT 'NONE',
    "recurrenceInterval" INTEGER NOT NULL DEFAULT 1,
    "recurredFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmComment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "editedAt" TIMESTAMP(3),
    "leadId" TEXT,
    "dealId" TEXT,
    "clientId" TEXT,
    "personId" TEXT,
    "siteId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmMention" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmFollower" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" "CrmFieldEntity" NOT NULL,
    "recordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAutomation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "CrmAutomationTrigger" NOT NULL,
    "triggerConfig" JSONB,
    "conditions" JSONB,
    "actions" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAutomationRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "entity" "CrmFieldEntity" NOT NULL,
    "recordId" TEXT NOT NULL,
    "status" "CrmAutomationRunStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDiscountApproval" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" "CrmApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDiscountApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCollectionNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "clientId" TEXT,
    "outcome" "CrmCollectionOutcome" NOT NULL,
    "promisedAt" TIMESTAMP(3),
    "promisedAmount" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmCollectionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ProductKind" NOT NULL DEFAULT 'GOODS',
    "category" TEXT,
    "unit" "UnitOfMeasure" NOT NULL DEFAULT 'EACH',
    "unitLabel" TEXT,
    "standardPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPrice" DOUBLE PRECISION,
    "defaultTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "maxDiscountPercent" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "attributes" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PriceListKind" NOT NULL DEFAULT 'STANDARD',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "region" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minQuantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmWorkOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workOrderNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CrmWorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "CrmTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "dealId" TEXT,
    "clientId" TEXT,
    "siteId" TEXT,
    "documentId" TEXT,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "crewIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "addressLine" TEXT,
    "accessNotes" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "signedByName" TEXT,
    "signatureUrl" TEXT,
    "signedAt" TIMESTAMP(3),
    "customerRating" INTEGER,
    "completionNotes" TEXT,
    "photos" JSONB,
    "blockedReason" TEXT,
    "customFields" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmWorkOrderItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "completedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "productId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmWorkOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmClient_companyId_emailNormalized_idx" ON "CrmClient"("companyId", "emailNormalized");

-- CreateIndex
CREATE INDEX "CrmClient_companyId_phoneE164_idx" ON "CrmClient"("companyId", "phoneE164");

-- CreateIndex
CREATE INDEX "CrmClient_companyId_name_idx" ON "CrmClient"("companyId", "name");

-- CreateIndex
CREATE INDEX "CrmClient_companyId_websiteDomain_idx" ON "CrmClient"("companyId", "websiteDomain");

-- CreateIndex
CREATE INDEX "CrmClient_companyId_parentClientId_idx" ON "CrmClient"("companyId", "parentClientId");

-- CreateIndex
CREATE INDEX "CrmClient_companyId_archivedAt_idx" ON "CrmClient"("companyId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmClient_companyId_clientNo_key" ON "CrmClient"("companyId", "clientNo");

-- CreateIndex
CREATE INDEX "CrmLead_companyId_stage_updatedAt_idx" ON "CrmLead"("companyId", "stage", "updatedAt");

-- CreateIndex
CREATE INDEX "CrmLead_companyId_assignedToId_stage_idx" ON "CrmLead"("companyId", "assignedToId", "stage");

-- CreateIndex
CREATE INDEX "CrmLead_companyId_clientId_idx" ON "CrmLead"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "CrmLead_companyId_createdAt_idx" ON "CrmLead"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmLead_companyId_source_idx" ON "CrmLead"("companyId", "source");

-- CreateIndex
CREATE INDEX "CrmLead_companyId_sourceChannel_idx" ON "CrmLead"("companyId", "sourceChannel");

-- CreateIndex
CREATE INDEX "CrmLead_companyId_utmSource_utmCampaign_idx" ON "CrmLead"("companyId", "utmSource", "utmCampaign");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLead_companyId_leadNo_key" ON "CrmLead"("companyId", "leadNo");

-- CreateIndex
CREATE INDEX "CrmLeadDocument_companyId_leadId_type_idx" ON "CrmLeadDocument"("companyId", "leadId", "type");

-- CreateIndex
CREATE INDEX "CrmLeadDocument_companyId_dealId_type_idx" ON "CrmLeadDocument"("companyId", "dealId", "type");

-- CreateIndex
CREATE INDEX "CrmLeadDocument_companyId_supersedesId_idx" ON "CrmLeadDocument"("companyId", "supersedesId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLeadDocument_companyId_quotationId_key" ON "CrmLeadDocument"("companyId", "quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLeadDocument_companyId_invoiceId_key" ON "CrmLeadDocument"("companyId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLeadDocument_companyId_receiptId_key" ON "CrmLeadDocument"("companyId", "receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDocumentApproval_leadDocumentId_key" ON "CrmDocumentApproval"("leadDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDocumentApproval_token_key" ON "CrmDocumentApproval"("token");

-- CreateIndex
CREATE INDEX "CrmDocumentApproval_companyId_status_idx" ON "CrmDocumentApproval"("companyId", "status");

-- CreateIndex
CREATE INDEX "CrmActivity_companyId_leadId_occurredAt_idx" ON "CrmActivity"("companyId", "leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmActivity_companyId_clientId_occurredAt_idx" ON "CrmActivity"("companyId", "clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmFollowUp_companyId_assignedToId_status_dueAt_idx" ON "CrmFollowUp"("companyId", "assignedToId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmFollowUp_companyId_status_dueAt_idx" ON "CrmFollowUp"("companyId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmFollowUp_companyId_leadId_idx" ON "CrmFollowUp"("companyId", "leadId");

-- CreateIndex
CREATE INDEX "CrmAppointment_companyId_assignedToId_scheduledStart_idx" ON "CrmAppointment"("companyId", "assignedToId", "scheduledStart");

-- CreateIndex
CREATE INDEX "CrmAppointment_companyId_status_scheduledStart_idx" ON "CrmAppointment"("companyId", "status", "scheduledStart");

-- CreateIndex
CREATE UNIQUE INDEX "CrmAppointment_companyId_appointmentNo_key" ON "CrmAppointment"("companyId", "appointmentNo");

-- CreateIndex
CREATE INDEX "CrmSiteVisitItem_companyId_appointmentId_position_idx" ON "CrmSiteVisitItem"("companyId", "appointmentId", "position");

-- CreateIndex
CREATE INDEX "CrmSavedView_companyId_entity_isShared_idx" ON "CrmSavedView"("companyId", "entity", "isShared");

-- CreateIndex
CREATE INDEX "CrmSavedView_companyId_createdById_idx" ON "CrmSavedView"("companyId", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CrmIntakeForm_publicToken_key" ON "CrmIntakeForm"("publicToken");

-- CreateIndex
CREATE INDEX "CrmIntakeForm_companyId_isActive_idx" ON "CrmIntakeForm"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CrmIntakeForm_companyId_name_key" ON "CrmIntakeForm"("companyId", "name");

-- CreateIndex
CREATE INDEX "CrmIntakeSubmission_companyId_status_createdAt_idx" ON "CrmIntakeSubmission"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CrmIntakeSubmission_companyId_formId_createdAt_idx" ON "CrmIntakeSubmission"("companyId", "formId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmApiKey_keyHash_key" ON "CrmApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "CrmApiKey_companyId_revokedAt_idx" ON "CrmApiKey"("companyId", "revokedAt");

-- CreateIndex
CREATE INDEX "CrmLeadSource_companyId_isActive_idx" ON "CrmLeadSource"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLeadSource_companyId_name_key" ON "CrmLeadSource"("companyId", "name");

-- CreateIndex
CREATE INDEX "CrmCommissionRule_companyId_isActive_appliesToUserId_idx" ON "CrmCommissionRule"("companyId", "isActive", "appliesToUserId");

-- CreateIndex
CREATE INDEX "CrmCommissionTier_ruleId_sortOrder_idx" ON "CrmCommissionTier"("ruleId", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmCommissionEntry_companyId_repId_periodKey_idx" ON "CrmCommissionEntry"("companyId", "repId", "periodKey");

-- CreateIndex
CREATE INDEX "CrmCommissionEntry_companyId_status_periodKey_idx" ON "CrmCommissionEntry"("companyId", "status", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCommissionEntry_companyId_leadDocumentId_repId_basis_key" ON "CrmCommissionEntry"("companyId", "leadDocumentId", "repId", "basis");

-- CreateIndex
CREATE INDEX "CrmPerson_companyId_fullName_idx" ON "CrmPerson"("companyId", "fullName");

-- CreateIndex
CREATE INDEX "CrmPerson_companyId_emailNormalized_idx" ON "CrmPerson"("companyId", "emailNormalized");

-- CreateIndex
CREATE INDEX "CrmPerson_companyId_phoneE164_idx" ON "CrmPerson"("companyId", "phoneE164");

-- CreateIndex
CREATE INDEX "CrmPerson_companyId_clientId_idx" ON "CrmPerson"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "CrmPerson_companyId_assignedToId_idx" ON "CrmPerson"("companyId", "assignedToId");

-- CreateIndex
CREATE INDEX "CrmPerson_companyId_archivedAt_idx" ON "CrmPerson"("companyId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPerson_companyId_personNo_key" ON "CrmPerson"("companyId", "personNo");

-- CreateIndex
CREATE INDEX "CrmPersonCompany_companyId_clientId_idx" ON "CrmPersonCompany"("companyId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPersonCompany_personId_clientId_key" ON "CrmPersonCompany"("personId", "clientId");

-- CreateIndex
CREATE INDEX "CrmSite_companyId_name_idx" ON "CrmSite"("companyId", "name");

-- CreateIndex
CREATE INDEX "CrmSite_companyId_clientId_idx" ON "CrmSite"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "CrmSite_companyId_archivedAt_idx" ON "CrmSite"("companyId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSite_companyId_siteNo_key" ON "CrmSite"("companyId", "siteNo");

-- CreateIndex
CREATE INDEX "CrmDeal_companyId_stageId_idx" ON "CrmDeal"("companyId", "stageId");

-- CreateIndex
CREATE INDEX "CrmDeal_companyId_status_updatedAt_idx" ON "CrmDeal"("companyId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CrmDeal_companyId_assignedToId_status_idx" ON "CrmDeal"("companyId", "assignedToId", "status");

-- CreateIndex
CREATE INDEX "CrmDeal_companyId_clientId_idx" ON "CrmDeal"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "CrmDeal_companyId_expectedCloseDate_idx" ON "CrmDeal"("companyId", "expectedCloseDate");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDeal_companyId_dealNo_key" ON "CrmDeal"("companyId", "dealNo");

-- CreateIndex
CREATE INDEX "CrmDealContact_companyId_personId_idx" ON "CrmDealContact"("companyId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDealContact_dealId_personId_role_key" ON "CrmDealContact"("dealId", "personId", "role");

-- CreateIndex
CREATE INDEX "CrmPipeline_companyId_isActive_idx" ON "CrmPipeline"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPipeline_companyId_name_key" ON "CrmPipeline"("companyId", "name");

-- CreateIndex
CREATE INDEX "CrmPipelineStage_companyId_pipelineId_position_idx" ON "CrmPipelineStage"("companyId", "pipelineId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPipelineStage_pipelineId_name_key" ON "CrmPipelineStage"("pipelineId", "name");

-- CreateIndex
CREATE INDEX "CrmFieldDefinition_companyId_entity_archivedAt_idx" ON "CrmFieldDefinition"("companyId", "entity", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmFieldDefinition_companyId_entity_key_key" ON "CrmFieldDefinition"("companyId", "entity", "key");

-- CreateIndex
CREATE INDEX "CrmList_companyId_entity_idx" ON "CrmList"("companyId", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "CrmList_companyId_entity_name_key" ON "CrmList"("companyId", "entity", "name");

-- CreateIndex
CREATE INDEX "CrmListMember_companyId_recordId_idx" ON "CrmListMember"("companyId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmListMember_listId_recordId_key" ON "CrmListMember"("listId", "recordId");

-- CreateIndex
CREATE INDEX "CrmTask_companyId_assignedToId_status_dueAt_idx" ON "CrmTask"("companyId", "assignedToId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmTask_companyId_status_dueAt_idx" ON "CrmTask"("companyId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CrmTask_companyId_dealId_idx" ON "CrmTask"("companyId", "dealId");

-- CreateIndex
CREATE INDEX "CrmTask_companyId_leadId_idx" ON "CrmTask"("companyId", "leadId");

-- CreateIndex
CREATE INDEX "CrmComment_companyId_dealId_createdAt_idx" ON "CrmComment"("companyId", "dealId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmComment_companyId_leadId_createdAt_idx" ON "CrmComment"("companyId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmComment_companyId_parentId_idx" ON "CrmComment"("companyId", "parentId");

-- CreateIndex
CREATE INDEX "CrmMention_companyId_userId_readAt_idx" ON "CrmMention"("companyId", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmMention_commentId_userId_key" ON "CrmMention"("commentId", "userId");

-- CreateIndex
CREATE INDEX "CrmFollower_companyId_entity_recordId_idx" ON "CrmFollower"("companyId", "entity", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmFollower_userId_entity_recordId_key" ON "CrmFollower"("userId", "entity", "recordId");

-- CreateIndex
CREATE INDEX "CrmAutomation_companyId_trigger_isEnabled_idx" ON "CrmAutomation"("companyId", "trigger", "isEnabled");

-- CreateIndex
CREATE INDEX "CrmAutomationRun_companyId_automationId_createdAt_idx" ON "CrmAutomationRun"("companyId", "automationId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmAutomationRun_companyId_entity_recordId_idx" ON "CrmAutomationRun"("companyId", "entity", "recordId");

-- CreateIndex
CREATE INDEX "CrmDiscountApproval_companyId_status_createdAt_idx" ON "CrmDiscountApproval"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CrmDiscountApproval_companyId_documentId_idx" ON "CrmDiscountApproval"("companyId", "documentId");

-- CreateIndex
CREATE INDEX "CrmCollectionNote_companyId_documentId_createdAt_idx" ON "CrmCollectionNote"("companyId", "documentId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmCollectionNote_companyId_promisedAt_idx" ON "CrmCollectionNote"("companyId", "promisedAt");

-- CreateIndex
CREATE INDEX "Product_companyId_isActive_kind_idx" ON "Product"("companyId", "isActive", "kind");

-- CreateIndex
CREATE INDEX "Product_companyId_category_idx" ON "Product"("companyId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_code_key" ON "Product"("companyId", "code");

-- CreateIndex
CREATE INDEX "PriceList_companyId_isActive_kind_idx" ON "PriceList"("companyId", "isActive", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_companyId_name_key" ON "PriceList"("companyId", "name");

-- CreateIndex
CREATE INDEX "ProductPrice_companyId_productId_idx" ON "ProductPrice"("companyId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPrice_priceListId_productId_minQuantity_key" ON "ProductPrice"("priceListId", "productId", "minQuantity");

-- CreateIndex
CREATE INDEX "CrmWorkOrder_companyId_status_scheduledStart_idx" ON "CrmWorkOrder"("companyId", "status", "scheduledStart");

-- CreateIndex
CREATE INDEX "CrmWorkOrder_companyId_assignedToId_status_idx" ON "CrmWorkOrder"("companyId", "assignedToId", "status");

-- CreateIndex
CREATE INDEX "CrmWorkOrder_companyId_dealId_idx" ON "CrmWorkOrder"("companyId", "dealId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmWorkOrder_companyId_workOrderNo_key" ON "CrmWorkOrder"("companyId", "workOrderNo");

-- CreateIndex
CREATE INDEX "CrmWorkOrderItem_companyId_workOrderId_position_idx" ON "CrmWorkOrderItem"("companyId", "workOrderId", "position");

-- CreateIndex
CREATE INDEX "InventoryItem_productId_idx" ON "InventoryItem"("productId");

-- CreateIndex
CREATE INDEX "RetailCatalogItem_companyId_productId_idx" ON "RetailCatalogItem"("companyId", "productId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailCatalogItem" ADD CONSTRAINT "RetailCatalogItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SalesQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmClient" ADD CONSTRAINT "CrmClient_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmClient" ADD CONSTRAINT "CrmClient_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmClient" ADD CONSTRAINT "CrmClient_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmClient" ADD CONSTRAINT "CrmClient_parentClientId_fkey" FOREIGN KEY ("parentClientId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmClient" ADD CONSTRAINT "CrmClient_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_convertedDealId_fkey" FOREIGN KEY ("convertedDealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_convertedPersonId_fkey" FOREIGN KEY ("convertedPersonId") REFERENCES "CrmPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_convertedById_fkey" FOREIGN KEY ("convertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadDocument" ADD CONSTRAINT "CrmLeadDocument_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "CrmLeadDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadDocument" ADD CONSTRAINT "CrmLeadDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadDocument" ADD CONSTRAINT "CrmLeadDocument_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadDocument" ADD CONSTRAINT "CrmLeadDocument_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadDocument" ADD CONSTRAINT "CrmLeadDocument_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SalesQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadDocument" ADD CONSTRAINT "CrmLeadDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadDocument" ADD CONSTRAINT "CrmLeadDocument_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "SalesReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadDocument" ADD CONSTRAINT "CrmLeadDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDocumentApproval" ADD CONSTRAINT "CrmDocumentApproval_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDocumentApproval" ADD CONSTRAINT "CrmDocumentApproval_leadDocumentId_fkey" FOREIGN KEY ("leadDocumentId") REFERENCES "CrmLeadDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "CrmAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollowUp" ADD CONSTRAINT "CrmFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAppointment" ADD CONSTRAINT "CrmAppointment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAppointment" ADD CONSTRAINT "CrmAppointment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAppointment" ADD CONSTRAINT "CrmAppointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAppointment" ADD CONSTRAINT "CrmAppointment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAppointment" ADD CONSTRAINT "CrmAppointment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CrmSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAppointment" ADD CONSTRAINT "CrmAppointment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAppointment" ADD CONSTRAINT "CrmAppointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSiteVisitItem" ADD CONSTRAINT "CrmSiteVisitItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSiteVisitItem" ADD CONSTRAINT "CrmSiteVisitItem_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "CrmAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSavedView" ADD CONSTRAINT "CrmSavedView_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSavedView" ADD CONSTRAINT "CrmSavedView_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmIntakeForm" ADD CONSTRAINT "CrmIntakeForm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmIntakeForm" ADD CONSTRAINT "CrmIntakeForm_defaultAssigneeId_fkey" FOREIGN KEY ("defaultAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmIntakeForm" ADD CONSTRAINT "CrmIntakeForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmIntakeSubmission" ADD CONSTRAINT "CrmIntakeSubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmIntakeSubmission" ADD CONSTRAINT "CrmIntakeSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CrmIntakeForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmIntakeSubmission" ADD CONSTRAINT "CrmIntakeSubmission_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "CrmApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmIntakeSubmission" ADD CONSTRAINT "CrmIntakeSubmission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmIntakeSubmission" ADD CONSTRAINT "CrmIntakeSubmission_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmApiKey" ADD CONSTRAINT "CrmApiKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmApiKey" ADD CONSTRAINT "CrmApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadSource" ADD CONSTRAINT "CrmLeadSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCommissionRule" ADD CONSTRAINT "CrmCommissionRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCommissionRule" ADD CONSTRAINT "CrmCommissionRule_appliesToUserId_fkey" FOREIGN KEY ("appliesToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCommissionTier" ADD CONSTRAINT "CrmCommissionTier_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CrmCommissionRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCommissionEntry" ADD CONSTRAINT "CrmCommissionEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCommissionEntry" ADD CONSTRAINT "CrmCommissionEntry_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCommissionEntry" ADD CONSTRAINT "CrmCommissionEntry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCommissionEntry" ADD CONSTRAINT "CrmCommissionEntry_leadDocumentId_fkey" FOREIGN KEY ("leadDocumentId") REFERENCES "CrmLeadDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCommissionEntry" ADD CONSTRAINT "CrmCommissionEntry_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CrmCommissionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCommissionEntry" ADD CONSTRAINT "CrmCommissionEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPerson" ADD CONSTRAINT "CrmPerson_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPerson" ADD CONSTRAINT "CrmPerson_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPerson" ADD CONSTRAINT "CrmPerson_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPerson" ADD CONSTRAINT "CrmPerson_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPerson" ADD CONSTRAINT "CrmPerson_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "CrmPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPersonCompany" ADD CONSTRAINT "CrmPersonCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPersonCompany" ADD CONSTRAINT "CrmPersonCompany_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPersonCompany" ADD CONSTRAINT "CrmPersonCompany_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSite" ADD CONSTRAINT "CrmSite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSite" ADD CONSTRAINT "CrmSite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSite" ADD CONSTRAINT "CrmSite_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "CrmPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmSite" ADD CONSTRAINT "CrmSite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "CrmPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CrmSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "CrmPipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealContact" ADD CONSTRAINT "CrmDealContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealContact" ADD CONSTRAINT "CrmDealContact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealContact" ADD CONSTRAINT "CrmDealContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPipeline" ADD CONSTRAINT "CrmPipeline_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPipeline" ADD CONSTRAINT "CrmPipeline_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPipelineStage" ADD CONSTRAINT "CrmPipelineStage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmPipelineStage" ADD CONSTRAINT "CrmPipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFieldDefinition" ADD CONSTRAINT "CrmFieldDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFieldDefinition" ADD CONSTRAINT "CrmFieldDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmList" ADD CONSTRAINT "CrmList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmList" ADD CONSTRAINT "CrmList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmListMember" ADD CONSTRAINT "CrmListMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmListMember" ADD CONSTRAINT "CrmListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CrmList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmListMember" ADD CONSTRAINT "CrmListMember_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CrmSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_recurredFromId_fkey" FOREIGN KEY ("recurredFromId") REFERENCES "CrmTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmComment" ADD CONSTRAINT "CrmComment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmComment" ADD CONSTRAINT "CrmComment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmComment" ADD CONSTRAINT "CrmComment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmComment" ADD CONSTRAINT "CrmComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CrmComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmComment" ADD CONSTRAINT "CrmComment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmComment" ADD CONSTRAINT "CrmComment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmComment" ADD CONSTRAINT "CrmComment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmComment" ADD CONSTRAINT "CrmComment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "CrmPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmComment" ADD CONSTRAINT "CrmComment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CrmSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmMention" ADD CONSTRAINT "CrmMention_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmMention" ADD CONSTRAINT "CrmMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CrmComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmMention" ADD CONSTRAINT "CrmMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollower" ADD CONSTRAINT "CrmFollower_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmFollower" ADD CONSTRAINT "CrmFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAutomation" ADD CONSTRAINT "CrmAutomation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAutomation" ADD CONSTRAINT "CrmAutomation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAutomationRun" ADD CONSTRAINT "CrmAutomationRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmAutomationRun" ADD CONSTRAINT "CrmAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "CrmAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDiscountApproval" ADD CONSTRAINT "CrmDiscountApproval_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDiscountApproval" ADD CONSTRAINT "CrmDiscountApproval_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CrmLeadDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDiscountApproval" ADD CONSTRAINT "CrmDiscountApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDiscountApproval" ADD CONSTRAINT "CrmDiscountApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCollectionNote" ADD CONSTRAINT "CrmCollectionNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCollectionNote" ADD CONSTRAINT "CrmCollectionNote_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CrmLeadDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCollectionNote" ADD CONSTRAINT "CrmCollectionNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCollectionNote" ADD CONSTRAINT "CrmCollectionNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWorkOrder" ADD CONSTRAINT "CrmWorkOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWorkOrder" ADD CONSTRAINT "CrmWorkOrder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWorkOrder" ADD CONSTRAINT "CrmWorkOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWorkOrder" ADD CONSTRAINT "CrmWorkOrder_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CrmSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWorkOrder" ADD CONSTRAINT "CrmWorkOrder_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CrmLeadDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWorkOrder" ADD CONSTRAINT "CrmWorkOrder_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWorkOrder" ADD CONSTRAINT "CrmWorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWorkOrderItem" ADD CONSTRAINT "CrmWorkOrderItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWorkOrderItem" ADD CONSTRAINT "CrmWorkOrderItem_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "CrmWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
