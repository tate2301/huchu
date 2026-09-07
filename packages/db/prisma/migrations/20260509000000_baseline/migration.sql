-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WorkspaceProfile" AS ENUM ('GOLD_MINE', 'SCRAP_METAL', 'SCHOOLS', 'AUTOS', 'THRIFT', 'GENERAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubdomainReservationStatus" AS ENUM ('RESERVED', 'ACTIVE', 'RELEASED');

-- CreateEnum
CREATE TYPE "CompanyDomainStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CompanyDomainVerificationType" AS ENUM ('TXT');

-- CreateEnum
CREATE TYPE "SupportAccessStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ACTIVE', 'EXPIRED', 'REVOKED', 'DENIED');

-- CreateEnum
CREATE TYPE "SupportAccessScope" AS ENUM ('READ_ONLY', 'READ_WRITE');

-- CreateEnum
CREATE TYPE "SupportSessionMode" AS ENUM ('IMPERSONATE', 'SHADOW');

-- CreateEnum
CREATE TYPE "RunbookRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RunbookExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "HealthIncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ContractAccessState" AS ENUM ('ACTIVE', 'WARNING', 'SUSPENDED', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'MANAGER', 'CLERK', 'OPERATOR', 'SCHOOL_ADMIN', 'REGISTRAR', 'BURSAR', 'TEACHER', 'PARENT', 'STUDENT', 'AUTO_MANAGER', 'SALES_EXEC', 'FINANCE_OFFICER', 'SHOP_MANAGER', 'CASHIER', 'STOCK_CLERK');

-- CreateEnum
CREATE TYPE "GoldShiftSplitMode" AS ENUM ('DEFAULT_50_50', 'OVERRIDE_WORKER_WEIGHT');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('EXTRACTION', 'HAULING', 'CRUSHING', 'PROCESSING');

-- CreateEnum
CREATE TYPE "EmployeePosition" AS ENUM ('MANAGER', 'SUPERVISOR', 'CLERK', 'SUPPORT_STAFF', 'ACCOUNTANT', 'ADMINISTRATOR', 'STOREKEEPER', 'BUYER', 'CASHIER', 'SALES_REP', 'DRIVER', 'TECHNICIAN', 'OPERATOR', 'ENGINEERS', 'CHEMIST', 'MINERS', 'TEACHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('GOLD', 'IRREGULAR', 'SALARY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('DUE', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'CASUAL');

-- CreateEnum
CREATE TYPE "EmployeeModule" AS ENUM ('HR', 'GOLD', 'SCRAP_METAL', 'CAR_SALES', 'THRIFT');

-- CreateEnum
CREATE TYPE "IrregularPayoutSource" AS ENUM ('GOLD', 'SCRAP', 'COMMISSION', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompensationProfileStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CompensationRuleType" AS ENUM ('ALLOWANCE', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "CompensationCalcMethod" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "PayrollCycle" AS ENUM ('MONTHLY', 'FORTNIGHTLY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "GoldSettlementMode" AS ENUM ('CURRENT_PERIOD', 'NEXT_PERIOD');

-- CreateEnum
CREATE TYPE "RunDomain" AS ENUM ('PAYROLL', 'GOLD_PAYOUT');

-- CreateEnum
CREATE TYPE "PeriodPurpose" AS ENUM ('STANDARD', 'CONTRACTOR', 'EDGE_CASE');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisbursementBatchStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('CASH', 'BANK', 'MOBILE');

-- CreateEnum
CREATE TYPE "ApprovalTargetType" AS ENUM ('PAYROLL_RUN', 'DISBURSEMENT_BATCH', 'ADJUSTMENT_ENTRY', 'COMPENSATION_PROFILE', 'COMPENSATION_RULE', 'GOLD_SHIFT_ALLOCATION', 'IRREGULAR_PAYOUT_BATCH', 'DISCIPLINARY_ACTION');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('CREATE', 'SUBMIT', 'APPROVE', 'REJECT', 'ADJUST');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('HR_PAYROLL_SUBMITTED', 'HR_PAYROLL_APPROVED', 'HR_PAYROLL_REJECTED', 'HR_DISBURSEMENT_SUBMITTED', 'HR_DISBURSEMENT_APPROVED', 'HR_DISBURSEMENT_REJECTED', 'HR_ADJUSTMENT_SUBMITTED', 'HR_ADJUSTMENT_APPROVED', 'HR_ADJUSTMENT_REJECTED', 'HR_COMP_PROFILE_SUBMITTED', 'HR_COMP_PROFILE_APPROVED', 'HR_COMP_PROFILE_REJECTED', 'HR_COMP_RULE_SUBMITTED', 'HR_COMP_RULE_APPROVED', 'HR_COMP_RULE_REJECTED', 'HR_GOLD_PAYOUT_SUBMITTED', 'HR_GOLD_PAYOUT_APPROVED', 'HR_GOLD_PAYOUT_REJECTED', 'HR_DISCIPLINARY_SUBMITTED', 'HR_DISCIPLINARY_APPROVED', 'HR_DISCIPLINARY_REJECTED', 'HR_INCIDENT_CREATED', 'HR_INCIDENT_STATUS_CHANGED', 'OPS_INCIDENT_CREATED', 'OPS_INCIDENT_STATUS_CHANGED', 'OPS_PERMIT_EXPIRING', 'OPS_PERMIT_EXPIRED', 'OPS_WORK_ORDER_OPENED', 'OPS_WORK_ORDER_IN_PROGRESS');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('PAYROLL_RUN', 'DISBURSEMENT_BATCH', 'ADJUSTMENT_ENTRY', 'COMPENSATION_PROFILE', 'COMPENSATION_RULE', 'GOLD_SHIFT_ALLOCATION', 'IRREGULAR_PAYOUT_BATCH', 'DISCIPLINARY_ACTION', 'HR_INCIDENT', 'INCIDENT', 'PERMIT', 'WORK_ORDER');

-- CreateEnum
CREATE TYPE "HrIncidentCategory" AS ENUM ('MISCONDUCT', 'ATTENDANCE', 'SAFETY_POLICY', 'PERFORMANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "HrIncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "HrIncidentStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "DisciplinaryActionType" AS ENUM ('WARNING', 'PENALTY', 'SUSPENSION', 'TERMINATION', 'OTHER');

-- CreateEnum
CREATE TYPE "DisciplinaryActionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "PenaltyStatus" AS ENUM ('NONE', 'PENDING', 'DEDUCTED', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "NotificationSourceAction" AS ENUM ('CREATE', 'SUBMIT', 'APPROVE', 'REJECT', 'STATUS_CHANGE', 'EXPIRY_ALERT');

-- CreateEnum
CREATE TYPE "AdjustmentTargetType" AS ENUM ('PAYROLL_RUN', 'DISBURSEMENT_BATCH', 'DISBURSEMENT_ITEM', 'PAYROLL_LINE_ITEM');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GoldLotSource" AS ENUM ('PRODUCTION', 'PURCHASE_PUBLIC');

-- CreateEnum
CREATE TYPE "GoldSellerType" AS ENUM ('EMPLOYEE', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "GoldInventoryDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "GoldInventorySourceType" AS ENUM ('POUR', 'RECEIPT', 'ADJUSTMENT', 'SHIFT_ALLOCATION');

-- CreateEnum
CREATE TYPE "GoldExceptionCategory" AS ENUM ('INVENTORY_DEFICIT', 'NAME_UNMAPPED', 'EXPENSE_MISMATCH', 'BALANCE_DRIFT', 'WITNESS_MISSING', 'IMPORT_FAILURE');

-- CreateEnum
CREATE TYPE "GoldExceptionSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "GoldExceptionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "GoldLedgerImportStatus" AS ENUM ('DRAFT', 'MAPPING', 'PREVIEW', 'COMMITTED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "GoldLedgerEntryStatus" AS ENUM ('PENDING', 'CREATED', 'SKIPPED', 'ANOMALY', 'FAILED');

-- CreateEnum
CREATE TYPE "ScrapMetalCategory" AS ENUM ('BATTERIES', 'COPPER', 'ALUMINUM', 'STEEL', 'BRASS', 'MIXED', 'OTHER');

-- CreateEnum
CREATE TYPE "ScrapMetalSaleStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScrapMetalPurchaseStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ScrapMetalBalanceEntryType" AS ENUM ('PURCHASE', 'SETTLEMENT', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountingPeriodLockPolicy" AS ENUM ('STRICT', 'MANAGER_OVERRIDE', 'SOFT_WARN');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PostingDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "PostingBasis" AS ENUM ('AMOUNT', 'NET', 'TAX', 'GROSS', 'DEDUCTIONS', 'ALLOWANCES');

-- CreateEnum
CREATE TYPE "AllocationType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "AccountingSourceType" AS ENUM ('MANUAL', 'STOCK_RECEIPT', 'STOCK_ISSUE', 'STOCK_ADJUSTMENT', 'STOCK_TRANSFER', 'PAYROLL_RUN', 'PAYROLL_DISBURSEMENT', 'GOLD_PURCHASE', 'GOLD_RECEIPT', 'GOLD_DISPATCH', 'SALES_INVOICE', 'SALES_RECEIPT', 'SALES_CREDIT_NOTE', 'SALES_WRITE_OFF', 'PURCHASE_BILL', 'PURCHASE_PAYMENT', 'PURCHASE_DEBIT_NOTE', 'PURCHASE_WRITE_OFF', 'BANK_TRANSACTION', 'MAINTENANCE_COMPLETION', 'IRREGULAR_PAYOUT_DISBURSEMENT', 'SCRAP_METAL_PURCHASE', 'SCRAP_METAL_BATCH', 'SCRAP_METAL_SALE', 'RETAIL_SHIFT_OPEN', 'RETAIL_GOODS_RECEIPT', 'RETAIL_SALE', 'RETAIL_REFUND', 'RETAIL_VOID', 'RETAIL_STOCK_ADJUSTMENT', 'RETAIL_STOCK_TRANSFER', 'RETAIL_SHIFT_VARIANCE', 'GOLD_SHIFT_ALLOCATION_COMPANY', 'GOLD_SHIFT_ALLOCATION_WORKER', 'GOLD_SHIFT_EXPENSE', 'GOLD_PAYOUT', 'GOLD_INVENTORY_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PostingRuleScopeType" AS ENUM ('COMPANY', 'SITE');

-- CreateEnum
CREATE TYPE "PostingRuleMode" AS ENUM ('GUIDED', 'ADVANCED');

-- CreateEnum
CREATE TYPE "PostingRuleConditionField" AS ENUM ('SITE_ID', 'REGISTER_CODE', 'TENDER_TYPE', 'CURRENCY', 'CUSTOMER_TAX_CATEGORY_ID', 'VENDOR_TAX_CATEGORY_ID', 'SALE_TYPE', 'MOVEMENT_TYPE');

-- CreateEnum
CREATE TYPE "PostingRuleOperator" AS ENUM ('EQ', 'NEQ', 'IN', 'NOT_IN', 'EXISTS', 'NOT_EXISTS');

-- CreateEnum
CREATE TYPE "PostingRuleLineRepeatMode" AS ENUM ('NONE', 'TENDER');

-- CreateEnum
CREATE TYPE "PostingRuleLineAccountSource" AS ENUM ('FIXED_ACCOUNT', 'TENDER_MAPPING');

-- CreateEnum
CREATE TYPE "AccountingSeedExecutionMode" AS ENUM ('DRY_RUN', 'APPLY');

-- CreateEnum
CREATE TYPE "AccountingSeedExecutionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'VOIDED');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'RECEIVED', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "FiscalReceiptStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'VOIDED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOIDED');

-- CreateEnum
CREATE TYPE "WriteOffStatus" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'CLOSED', 'VOIDED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('REPORT_TABLE', 'DASHBOARD_PACK', 'SALES_INVOICE', 'SALES_QUOTATION', 'SALES_RECEIPT', 'GENERIC_RECORD');

-- CreateEnum
CREATE TYPE "ExportTargetType" AS ENUM ('LIST', 'RECORD', 'DASHBOARD');

-- CreateEnum
CREATE TYPE "TemplateScope" AS ENUM ('SYSTEM', 'COMPANY');

-- CreateEnum
CREATE TYPE "RenderMode" AS ENUM ('SYNC', 'ASYNC');

-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "VatReturnStatus" AS ENUM ('DRAFT', 'REVIEWED', 'FINALIZED', 'FILED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentLedgerAccountType" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "PaymentLedgerEntryStatus" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "AccountNodeType" AS ENUM ('GROUP', 'LEDGER');

-- CreateEnum
CREATE TYPE "AccountingIntegrationStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE');

-- CreateEnum
CREATE TYPE "SchoolStudentStatus" AS ENUM ('APPLICANT', 'ACTIVE', 'SUSPENDED', 'GRADUATED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SchoolEnrollmentStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SchoolResultSheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'HOD_APPROVED', 'HOD_REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SchoolPublishWindowStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SchoolResultModerationActionType" AS ENUM ('SUBMIT', 'REQUEST_CHANGES', 'HOD_APPROVE', 'PUBLISH', 'UNPUBLISH');

-- CreateEnum
CREATE TYPE "SchoolBoardingAllocationStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'ENDED');

-- CreateEnum
CREATE TYPE "SchoolLeaveRequestType" AS ENUM ('LEAVE', 'OUTING');

-- CreateEnum
CREATE TYPE "SchoolLeaveRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'CHECKED_OUT', 'CHECKED_IN', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SchoolBoardingMovementType" AS ENUM ('CHECK_OUT', 'CHECK_IN', 'TRANSFER', 'BED_RELEASE');

-- CreateEnum
CREATE TYPE "SchoolFeeStructureStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SchoolFeeInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PART_PAID', 'PAID', 'VOIDED', 'WRITEOFF');

-- CreateEnum
CREATE TYPE "SchoolFeeReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "SchoolFeePaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "SchoolFeeWaiverType" AS ENUM ('SCHOLARSHIP', 'DISCOUNT', 'HARDSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "SchoolFeeWaiverStatus" AS ENUM ('DRAFT', 'APPROVED', 'APPLIED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SchoolAttendanceSessionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'LOCKED');

-- CreateEnum
CREATE TYPE "SchoolAttendanceEntryStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "CarSalesLeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'NEGOTIATION', 'WON', 'LOST', 'CANCELED');

-- CreateEnum
CREATE TYPE "CarSalesVehicleStatus" AS ENUM ('IN_STOCK', 'RESERVED', 'SOLD', 'DELIVERED');

-- CreateEnum
CREATE TYPE "CarSalesDealStatus" AS ENUM ('DRAFT', 'QUOTED', 'RESERVED', 'CONTRACTED', 'DELIVERY_READY', 'DELIVERED', 'CANCELED', 'VOIDED');

-- CreateEnum
CREATE TYPE "CarSalesPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "CarSalesPaymentStatus" AS ENUM ('POSTED', 'VOIDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CCTVEventType" AS ENUM ('MOTION_DETECTION', 'LINE_CROSSING', 'INTRUSION', 'VIDEO_LOSS', 'DISK_FULL', 'DISK_ERROR', 'NETWORK_DISCONNECTED', 'ILLEGAL_ACCESS', 'ALARM_INPUT', 'TAMPERING');

-- CreateEnum
CREATE TYPE "EventSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "StreamProtocol" AS ENUM ('WEBRTC', 'HLS');

-- CreateEnum
CREATE TYPE "StreamSessionStatus" AS ENUM ('ACTIVE', 'STOPPED', 'FAILED');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tenantStatus" "TenantStatus" NOT NULL DEFAULT 'PROVISIONING',
    "workspaceProfile" "WorkspaceProfile" NOT NULL DEFAULT 'GENERAL',
    "isProvisioned" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "payrollCycle" "PayrollCycle" NOT NULL DEFAULT 'MONTHLY',
    "goldPayoutCycle" "PayrollCycle" NOT NULL DEFAULT 'MONTHLY',
    "goldSettlementMode" "GoldSettlementMode" NOT NULL DEFAULT 'CURRENT_PERIOD',
    "cashDisbursementOnly" BOOLEAN NOT NULL DEFAULT true,
    "autoGeneratePayrollPeriods" BOOLEAN NOT NULL DEFAULT true,
    "autoGenerateGoldPayoutPeriods" BOOLEAN NOT NULL DEFAULT true,
    "periodGenerationHorizon" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdSequence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL',
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalIdSequence" (
    "id" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL',
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalIdSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPrice" DOUBLE PRECISION NOT NULL,
    "annualPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "maxSites" INTEGER,
    "maxUsers" INTEGER,
    "warningDays" INTEGER NOT NULL DEFAULT 14,
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySubscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "externalSubscriptionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "effectiveMonthlyAmount" DOUBLE PRECISION,
    "priceSnapshotJson" TEXT,
    "lastPriceComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeature" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "domain" TEXT,
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isBillable" BOOLEAN NOT NULL DEFAULT false,
    "monthlyPrice" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyFeatureFlag" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFeatureFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureBundle" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "additionalSiteMonthlyPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureBundleItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySubscriptionAddon" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySubscriptionAddon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisioningEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "payloadJson" TEXT,
    "errorJson" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubdomainReservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "status" "SubdomainReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "provider" TEXT NOT NULL DEFAULT 'registry-stub',
    "providerRef" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubdomainReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyBranding" (
    "companyId" TEXT NOT NULL,
    "displayName" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "fontFamilyKey" TEXT,
    "logoUrl" TEXT,
    "secondaryLogoUrl" TEXT,
    "signatureUrl" TEXT,
    "stampUrl" TEXT,
    "legalName" TEXT,
    "tradingName" TEXT,
    "registrationNumber" TEXT,
    "vatNumber" TEXT,
    "taxNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "physicalAddress" TEXT,
    "postalAddress" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankSwiftCode" TEXT,
    "bankIban" TEXT,
    "defaultFooterText" TEXT,
    "legalDisclaimer" TEXT,
    "paymentTerms" TEXT,
    "documentLocale" TEXT,
    "dateFormat" TEXT,
    "timeFormat" TEXT,
    "numberFormat" TEXT,
    "currencyDisplayMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBranding_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "CompanyDomain" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "status" "CompanyDomainStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationType" "CompanyDomainVerificationType" NOT NULL DEFAULT 'TXT',
    "verificationHost" TEXT NOT NULL,
    "verificationValue" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAccessRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "reason" TEXT NOT NULL,
    "scope" "SupportAccessScope" NOT NULL DEFAULT 'READ_ONLY',
    "status" "SupportAccessStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportSession" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "companyId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "mode" "SupportSessionMode" NOT NULL DEFAULT 'IMPERSONATE',
    "scope" "SupportAccessScope" NOT NULL DEFAULT 'READ_ONLY',
    "status" "SupportAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunbookDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "schedule" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "riskLevel" "RunbookRiskLevel" NOT NULL DEFAULT 'LOW',
    "inputJson" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunbookDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunbookExecution" (
    "id" TEXT NOT NULL,
    "runbookId" TEXT NOT NULL,
    "companyId" TEXT,
    "status" "RunbookExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "resultJson" TEXT,
    "errorJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunbookExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSloMetricSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantSloMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthIncident" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "riskLevel" "RunbookRiskLevel" NOT NULL DEFAULT 'LOW',
    "actionType" TEXT NOT NULL,
    "status" "HealthIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "actualValue" DOUBLE PRECISION,
    "thresholdValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractEnforcementEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromState" "ContractAccessState" NOT NULL,
    "toState" "ContractAccessState" NOT NULL,
    "reason" TEXT NOT NULL,
    "overrideBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractEnforcementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "actor" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "reason" TEXT,
    "payloadJson" TEXT,
    "eventHash" TEXT NOT NULL,
    "prevEventHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT,
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "measurementUnit" TEXT NOT NULL DEFAULT 'tonnes',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT,
    "role" "UserRole" NOT NULL,
    "companyId" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "nextOfKinName" TEXT NOT NULL,
    "nextOfKinPhone" TEXT NOT NULL,
    "passportPhotoUrl" TEXT NOT NULL,
    "nationalIdNumber" TEXT,
    "nationalIdDocumentUrl" TEXT,
    "villageOfOrigin" TEXT NOT NULL,
    "jobTitle" TEXT,
    "position" "EmployeePosition" NOT NULL DEFAULT 'SUPPORT_STAFF',
    "departmentId" TEXT,
    "gradeId" TEXT,
    "supervisorId" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "hireDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeModuleAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "module" "EmployeeModule" NOT NULL,
    "accessRole" "UserRole",
    "requiresUserAccess" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeModuleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedSalary" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "monthlyAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePayment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "payoutSource" "IrregularPayoutSource",
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "paidAmount" DOUBLE PRECISION,
    "paidAt" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL DEFAULT 'DUE',
    "notes" TEXT,
    "goldWeightGrams" DOUBLE PRECISION,
    "goldPriceUsdPerGram" DOUBLE PRECISION,
    "valuationDate" TIMESTAMP(3),
    "amountUsd" DOUBLE PRECISION,
    "paidAmountUsd" DOUBLE PRECISION,
    "payrollRunId" TEXT,
    "payrollLineItemId" TEXT,
    "disbursementBatchId" TEXT,
    "disbursementItemId" TEXT,
    "goldShiftAllocationId" TEXT,
    "irregularPayoutBatchId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobGrade" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationProfile" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "CompensationProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "workflowStatus" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CompensationRuleType" NOT NULL,
    "calcMethod" "CompensationCalcMethod" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "cap" DOUBLE PRECISION,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "workflowStatus" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "employeeId" TEXT,
    "departmentId" TEXT,
    "gradeId" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "employmentType" "EmploymentType",
    "position" "EmployeePosition",
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationTemplateRule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "compensationRuleId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompensationTemplateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "domain" "RunDomain" NOT NULL DEFAULT 'PAYROLL',
    "payoutSource" "IrregularPayoutSource",
    "scopeKey" TEXT NOT NULL DEFAULT 'DEFAULT',
    "periodKey" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "cycle" "PayrollCycle" NOT NULL DEFAULT 'MONTHLY',
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "isAutoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "periodPurpose" "PeriodPurpose" NOT NULL DEFAULT 'STANDARD',
    "appliesToContractorsOnly" BOOLEAN NOT NULL DEFAULT false,
    "employeeScopeJson" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "domain" "RunDomain" NOT NULL DEFAULT 'PAYROLL',
    "payoutSource" "IrregularPayoutSource",
    "runNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "grossTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowancesTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductionsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "goldRatePerUnit" DOUBLE PRECISION,
    "goldRateUnit" TEXT NOT NULL DEFAULT 'g',
    "goldSettlementMode" "GoldSettlementMode" NOT NULL DEFAULT 'CURRENT_PERIOD',
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLineItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "compensationProfileId" TEXT,
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowancesTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductionsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLineComponent" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "ruleId" TEXT,
    "name" TEXT NOT NULL,
    "type" "CompensationRuleType" NOT NULL,
    "calcMethod" "CompensationCalcMethod" NOT NULL,
    "rateOrAmount" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollLineComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisbursementBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "DisbursementBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "PayoutMethod" NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "cashCustodian" TEXT,
    "cashIssuedAt" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisbursementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisbursementItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION,
    "status" "PaymentStatus" NOT NULL DEFAULT 'DUE',
    "paidAt" TIMESTAMP(3),
    "receiptReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisbursementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" "ApprovalTargetType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "ApprovalActionType" NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "actedById" TEXT NOT NULL,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "payloadJson" TEXT,
    "entityType" "NotificationEntityType",
    "entityId" TEXT,
    "sourceAction" "NotificationSourceAction",
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "actionTaken" TEXT,
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "webPushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "hrEnabled" BOOLEAN NOT NULL DEFAULT true,
    "opsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjustmentEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "targetType" "AdjustmentTargetType" NOT NULL,
    "payrollRunId" TEXT,
    "disbursementBatchId" TEXT,
    "lineItemId" TEXT,
    "disbursementItemId" TEXT,
    "employeeId" TEXT,
    "amountDelta" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdjustmentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IrregularPayoutBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" "IrregularPayoutSource" NOT NULL,
    "label" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "workflowStatus" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IrregularPayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IrregularPayoutBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IrregularPayoutBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftReport" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shift" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sectionId" TEXT,
    "shiftGroupId" TEXT,
    "groupLeaderId" TEXT NOT NULL,
    "crewCount" INTEGER NOT NULL,
    "workType" "WorkType" NOT NULL,
    "outputTonnes" DOUBLE PRECISION,
    "outputTrips" INTEGER,
    "outputWheelbarrows" INTEGER,
    "metresAdvanced" DOUBLE PRECISION,
    "hasIncident" BOOLEAN NOT NULL DEFAULT false,
    "incidentNotes" TEXT,
    "handoverNotes" TEXT,
    "photos" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "verifiedById" TEXT,
    "approvedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowntimeCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "siteId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DowntimeCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowntimeEvent" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT,
    "plantReportId" TEXT,
    "downtimeCodeId" TEXT NOT NULL,
    "durationHours" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DowntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "shiftGroupId" TEXT,
    "shiftLeaderId" TEXT,
    "shiftLeaderName" TEXT,
    "employeeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "overtime" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "leaderEmployeeId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftGroupMember" (
    "id" TEXT NOT NULL,
    "shiftGroupId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftGroupSchedule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shift" TEXT NOT NULL,
    "shiftGroupId" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftGroupSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantReport" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT NOT NULL,
    "tonnesFed" DOUBLE PRECISION,
    "tonnesProcessed" DOUBLE PRECISION,
    "runHours" DOUBLE PRECISION,
    "dieselUsed" DOUBLE PRECISION,
    "grindingMedia" DOUBLE PRECISION,
    "reagentsUsed" DOUBLE PRECISION,
    "waterUsed" DOUBLE PRECISION,
    "goldRecovered" DOUBLE PRECISION,
    "notes" TEXT,
    "reportedById" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldPrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "priceUsdPerGram" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldExpenseType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldExpenseType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldPour" (
    "id" TEXT NOT NULL,
    "pourBarId" TEXT NOT NULL,
    "pourDate" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT NOT NULL,
    "sourceType" "GoldLotSource" NOT NULL DEFAULT 'PRODUCTION',
    "createdById" TEXT,
    "goldShiftAllocationId" TEXT,
    "grossWeight" DOUBLE PRECISION NOT NULL,
    "estimatedPurity" DOUBLE PRECISION,
    "witness1Id" TEXT NOT NULL,
    "witness2Id" TEXT NOT NULL,
    "storageLocation" TEXT NOT NULL,
    "additionalExpensesWeight" DOUBLE PRECISION,
    "additionalExpensesNote" TEXT,
    "notes" TEXT,
    "goldPriceUsdPerGram" DOUBLE PRECISION,
    "valuationDate" TIMESTAMP(3),
    "valueUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "corrections" TEXT,

    CONSTRAINT "GoldPour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldPurchase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "goldPourId" TEXT NOT NULL,
    "purchaseNumber" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "sellerType" "GoldSellerType" NOT NULL DEFAULT 'EXTERNAL',
    "sellerEmployeeId" TEXT,
    "sellerName" TEXT NOT NULL,
    "sellerPhone" TEXT NOT NULL,
    "grossWeight" DOUBLE PRECISION NOT NULL,
    "estimatedPurity" DOUBLE PRECISION,
    "storageLocation" TEXT NOT NULL,
    "receiver1Id" TEXT NOT NULL,
    "receiver2Id" TEXT NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT NOT NULL,
    "paymentChannel" TEXT,
    "paymentReference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldDispatch" (
    "id" TEXT NOT NULL,
    "goldPourId" TEXT NOT NULL,
    "dispatchDate" TIMESTAMP(3) NOT NULL,
    "courier" TEXT NOT NULL,
    "vehicle" TEXT,
    "destination" TEXT NOT NULL,
    "sealNumbers" TEXT NOT NULL,
    "handedOverById" TEXT NOT NULL,
    "receivedBy" TEXT,
    "notes" TEXT,
    "goldPriceUsdPerGram" DOUBLE PRECISION,
    "valuationDate" TIMESTAMP(3),
    "valueUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldDispatchBatch" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "goldPourId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoldDispatchBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerReceipt" (
    "id" TEXT NOT NULL,
    "goldDispatchId" TEXT,
    "goldPourId" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "assayResult" DOUBLE PRECISION,
    "paidAmount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentChannel" TEXT,
    "paymentReference" TEXT,
    "notes" TEXT,
    "goldPriceUsdPerGram" DOUBLE PRECISION,
    "valuationDate" TIMESTAMP(3),
    "paidValueUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerReceiptBatch" (
    "id" TEXT NOT NULL,
    "buyerReceiptId" TEXT NOT NULL,
    "goldPourId" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "valueUsd" DOUBLE PRECISION,
    "goldPriceUsdPerGram" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerReceiptBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerReceiptDispatch" (
    "id" TEXT NOT NULL,
    "buyerReceiptId" TEXT NOT NULL,
    "goldDispatchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerReceiptDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldShiftAllocation" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shift" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "totalWeight" DOUBLE PRECISION NOT NULL,
    "netWeight" DOUBLE PRECISION NOT NULL,
    "splitMode" "GoldShiftSplitMode" NOT NULL DEFAULT 'DEFAULT_50_50',
    "workerShareOverrideWeight" DOUBLE PRECISION,
    "splitOverrideReason" TEXT,
    "workerShareWeight" DOUBLE PRECISION NOT NULL,
    "companyShareWeight" DOUBLE PRECISION NOT NULL,
    "perWorkerWeight" DOUBLE PRECISION NOT NULL,
    "goldPriceUsdPerGram" DOUBLE PRECISION,
    "valuationDate" TIMESTAMP(3),
    "totalWeightValueUsd" DOUBLE PRECISION,
    "netWeightValueUsd" DOUBLE PRECISION,
    "workerShareValueUsd" DOUBLE PRECISION,
    "companyShareValueUsd" DOUBLE PRECISION,
    "perWorkerValueUsd" DOUBLE PRECISION,
    "payCycleWeeks" INTEGER NOT NULL DEFAULT 2,
    "workflowStatus" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldShiftAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldShiftExpense" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GoldShiftExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldShiftWorkerShare" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shareWeight" DOUBLE PRECISION NOT NULL,
    "shareValueUsd" DOUBLE PRECISION,

    CONSTRAINT "GoldShiftWorkerShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldInventoryEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "direction" "GoldInventoryDirection" NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "goldPriceUsdPerGram" DOUBLE PRECISION,
    "valueUsd" DOUBLE PRECISION,
    "sourceType" "GoldInventorySourceType" NOT NULL,
    "sourceId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoldInventoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldException" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT,
    "category" "GoldExceptionCategory" NOT NULL,
    "severity" "GoldExceptionSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "GoldExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "entityType" TEXT,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldLedgerImport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsAnomaly" INTEGER NOT NULL DEFAULT 0,
    "rowsFailed" INTEGER NOT NULL DEFAULT 0,
    "status" "GoldLedgerImportStatus" NOT NULL DEFAULT 'DRAFT',
    "mappingsJson" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "GoldLedgerImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldLedgerEntry" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "rawJson" TEXT NOT NULL,
    "parsedDate" TIMESTAMP(3),
    "parsedName" TEXT,
    "mappedShiftGroupId" TEXT,
    "gramsTotal" DOUBLE PRECISION,
    "expensesJson" TEXT,
    "boysGrams" DOUBLE PRECISION,
    "mdaraGrams" DOUBLE PRECISION,
    "balGrams" DOUBLE PRECISION,
    "status" "GoldLedgerEntryStatus" NOT NULL DEFAULT 'PENDING',
    "goldShiftAllocationId" TEXT,
    "goldPourId" TEXT,
    "buyerReceiptId" TEXT,
    "errorMessage" TEXT,
    "parserWarning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapMaterial" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ScrapMetalCategory" NOT NULL,
    "defaultPricePerKg" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapSellerProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapSellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapMetalPrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT,
    "category" "ScrapMetalCategory" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "pricePerKg" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapMetalPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapMetalEmployeeBalance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapMetalEmployeeBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapMetalBalanceEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "entryType" "ScrapMetalBalanceEntryType" NOT NULL,
    "amountDelta" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "sourceId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapMetalBalanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapMetalPurchase" (
    "id" TEXT NOT NULL,
    "purchaseNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "materialId" TEXT,
    "sellerProfileId" TEXT,
    "vendorId" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "category" "ScrapMetalCategory" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "pricePerKg" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "attachmentsJson" TEXT,
    "lastPrintedAt" TIMESTAMP(3),
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "printedById" TEXT,
    "sellerName" TEXT,
    "sellerPhone" TEXT,
    "notes" TEXT,
    "status" "ScrapMetalPurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "purchaseBillId" TEXT,
    "purchasePaymentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapMetalPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapMetalBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "materialId" TEXT,
    "category" "ScrapMetalCategory" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COLLECTING',
    "totalWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "collectionStartDate" TIMESTAMP(3) NOT NULL,
    "collectionEndDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapMetalBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapMetalBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapMetalBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapMetalSale" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "materialId" TEXT,
    "customerId" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerContact" TEXT,
    "recordedWeight" DOUBLE PRECISION NOT NULL,
    "soldWeight" DOUBLE PRECISION NOT NULL,
    "weightDiscrepancy" DOUBLE PRECISION NOT NULL,
    "pricePerKg" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "attachmentsJson" TEXT,
    "lastPrintedAt" TIMESTAMP(3),
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "printedById" TEXT,
    "status" "ScrapMetalSaleStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "salesInvoiceId" TEXT,
    "salesReceiptId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapMetalSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapTicketComplianceRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'BOTH',
    "materialId" TEXT,
    "category" "ScrapMetalCategory",
    "requirePhotos" BOOLEAN NOT NULL DEFAULT false,
    "requirePaymentMethod" BOOLEAN NOT NULL DEFAULT false,
    "requirePaymentReference" BOOLEAN NOT NULL DEFAULT false,
    "requireNotes" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapTicketComplianceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION,
    "maxStock" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "toLocationId" TEXT,
    "movementType" "MovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "issuedTo" TEXT,
    "requestedBy" TEXT,
    "issuedById" TEXT,
    "approvedBy" TEXT,
    "notes" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailRegister" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailCatalogItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "catalogCode" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "description" TEXT,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "compareAtPrice" DOUBLE PRECISION,
    "taxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acquisitionMode" TEXT NOT NULL DEFAULT 'PURCHASE',
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailPromotion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "promoCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailPurchaseOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "poNo" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expectedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailPurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailPurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailGoodsReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "siteId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailGoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailGoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailGoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailShift" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shiftNo" TEXT NOT NULL,
    "registerCode" TEXT NOT NULL,
    "registerName" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "cashierName" TEXT NOT NULL,
    "openingFloat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "expectedCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "countedCash" DOUBLE PRECISION,
    "variance" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailHeldCart" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "holdNo" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "label" TEXT,
    "cartSnapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailHeldCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailSale" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleNo" TEXT NOT NULL,
    "shiftId" TEXT,
    "sourceSaleId" TEXT,
    "siteId" TEXT NOT NULL,
    "cashierId" TEXT,
    "cashierName" TEXT,
    "customerName" TEXT,
    "saleType" TEXT NOT NULL DEFAULT 'SALE',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tenderedAmount" DOUBLE PRECISION,
    "changeAmount" DOUBLE PRECISION,
    "tenderSummary" JSONB,
    "promotionCode" TEXT,
    "overrideReason" TEXT,
    "voidReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailSaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "sourceLineId" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailSalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "tenderType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailSalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "equipmentCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "numberOfItems" INTEGER NOT NULL DEFAULT 1,
    "qrCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "serviceHours" DOUBLE PRECISION,
    "serviceDays" INTEGER,
    "lastServiceDate" TIMESTAMP(3),
    "nextServiceDue" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "downtimeStart" TIMESTAMP(3) NOT NULL,
    "downtimeEnd" TIMESTAMP(3),
    "workDone" TEXT,
    "partsUsed" TEXT,
    "partsCost" DOUBLE PRECISION DEFAULT 0,
    "laborCost" DOUBLE PRECISION DEFAULT 0,
    "technicianId" TEXT,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "periodLockPolicy" "AccountingPeriodLockPolicy" NOT NULL DEFAULT 'MANAGER_OVERRIDE',
    "legalName" TEXT,
    "tradingName" TEXT,
    "vatNumber" TEXT,
    "taxNumber" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "defaultTaxCodeId" TEXT,
    "defaultBankAccountId" TEXT,
    "freezeBeforeDate" TIMESTAMP(3),
    "retainedEarningsAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "nodeType" "AccountNodeType" NOT NULL DEFAULT 'LEDGER',
    "parentAccountId" TEXT,
    "hierarchyPath" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "systemManaged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entryNumber" INTEGER NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "periodId" TEXT,
    "sourceType" "AccountingSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "createdById" TEXT NOT NULL,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "periodOverrideReason" TEXT,
    "periodOverrideById" TEXT,
    "periodOverrideAt" TIMESTAMP(3),
    "reversalOfEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingIntegrationEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "sourceAction" TEXT NOT NULL,
    "sourceType" "AccountingSourceType",
    "sourceId" TEXT,
    "sourceSubtype" TEXT,
    "siteId" TEXT,
    "registerCode" TEXT,
    "causationKey" TEXT,
    "eventKey" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3),
    "description" TEXT,
    "amount" DOUBLE PRECISION,
    "netAmount" DOUBLE PRECISION,
    "taxAmount" DOUBLE PRECISION,
    "grossAmount" DOUBLE PRECISION,
    "deductionsAmount" DOUBLE PRECISION,
    "allowancesAmount" DOUBLE PRECISION,
    "currency" TEXT,
    "payloadJson" TEXT,
    "status" "AccountingIntegrationStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingIntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memo" TEXT,
    "costCenterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" "AccountingSourceType" NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "scopeType" "PostingRuleScopeType" NOT NULL DEFAULT 'COMPANY',
    "siteId" TEXT,
    "ruleMode" "PostingRuleMode" NOT NULL DEFAULT 'GUIDED',
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingRuleLine" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "accountId" TEXT,
    "direction" "PostingDirection" NOT NULL,
    "basis" "PostingBasis" NOT NULL DEFAULT 'AMOUNT',
    "allocationType" "AllocationType" NOT NULL DEFAULT 'PERCENT',
    "allocationValue" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "taxCodeId" TEXT,
    "repeatMode" "PostingRuleLineRepeatMode" NOT NULL DEFAULT 'NONE',
    "accountSource" "PostingRuleLineAccountSource" NOT NULL DEFAULT 'FIXED_ACCOUNT',
    "valuePath" TEXT,
    "memoTemplate" TEXT,
    "costCenterId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostingRuleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingRuleCondition" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "field" "PostingRuleConditionField" NOT NULL,
    "operator" "PostingRuleOperator" NOT NULL DEFAULT 'EQ',
    "valueString" TEXT,
    "valueListJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostingRuleCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'VAT',
    "appliesTo" TEXT NOT NULL DEFAULT 'BOTH',
    "vat7OutputBox" TEXT,
    "vat7InputBox" TEXT,
    "scheduleType" TEXT NOT NULL DEFAULT 'NONE',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'BOTH',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxTemplateLine" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "taxCodeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "appliesTo" TEXT NOT NULL DEFAULT 'BOTH',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxTemplateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL DEFAULT 'BOTH',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "taxCategoryId" TEXT,
    "templateId" TEXT NOT NULL,
    "currency" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrencyDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxCategoryId" TEXT,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "vatNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxCategoryId" TEXT,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "vatNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "writeOffTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "fiscalStatus" "FiscalReceiptStatus" DEFAULT 'PENDING',
    "createdById" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debit" DOUBLE PRECISION,
    "credit" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesQuotation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "quotationDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesQuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesQuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "bankAccountId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "noteDate" TIMESTAMP(3) NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdById" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNoteLine" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesWriteOff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" "WriteOffStatus" NOT NULL DEFAULT 'POSTED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesWriteOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBill" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debitNoteTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "writeOffTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debit" DOUBLE PRECISION,
    "credit" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchasePayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "billId" TEXT,
    "paymentNumber" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "bankAccountId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "noteDate" TIMESTAMP(3) NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdById" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitNoteLine" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebitNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseWriteOff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" "WriteOffStatus" NOT NULL DEFAULT 'POSTED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseWriteOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLedgerEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceType" "AccountingSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "accountType" "PaymentLedgerAccountType" NOT NULL,
    "partyType" TEXT NOT NULL,
    "partyId" TEXT,
    "invoiceId" TEXT,
    "billId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "journalEntryId" TEXT,
    "status" "PaymentLedgerEntryStatus" NOT NULL DEFAULT 'POSTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderAccountMapping" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT,
    "registerCode" TEXT,
    "tenderType" TEXT NOT NULL,
    "currency" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "clearingAccountId" TEXT NOT NULL,
    "offsetAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderAccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "direction" "PostingDirection" NOT NULL,
    "sourceType" "AccountingSourceType",
    "sourceId" TEXT,
    "reconciliationId" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "statementBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "direction" "PostingDirection" NOT NULL,
    "matchedTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatReturnSummary" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "outputTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VatReturnSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatReturn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "VatReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "filingCategory" TEXT,
    "returnDueDate" TIMESTAMP(3),
    "paymentDueDate" TIMESTAMP(3),
    "outputTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustmentsTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat7BoxesJson" TEXT,
    "schedulesJson" TEXT,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "preparedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "filedById" TEXT,
    "filedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatReturnLine" (
    "id" TEXT NOT NULL,
    "vatReturnId" TEXT NOT NULL,
    "taxCodeId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalanceImport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "sourceReference" TEXT,
    "notes" TEXT,
    "totalDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpeningBalanceImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodCloseVoucher" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "closingDate" TIMESTAMP(3) NOT NULL,
    "retainedEarningsAccountId" TEXT NOT NULL,
    "netResult" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversedReason" TEXT,
    "reversedJournalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodCloseVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "salvageValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 36,
    "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingSeedExecution" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "packCode" TEXT NOT NULL,
    "mode" "AccountingSeedExecutionMode" NOT NULL,
    "status" "AccountingSeedExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "actorId" TEXT,
    "actorEmail" TEXT,
    "inputJson" TEXT,
    "summaryJson" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AccountingSeedExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalisationProviderConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "apiBaseUrl" TEXT,
    "username" TEXT,
    "password" TEXT,
    "apiToken" TEXT,
    "authType" TEXT,
    "deviceId" TEXT,
    "timeoutMs" INTEGER,
    "retryPolicyJson" TEXT,
    "certificateRef" TEXT,
    "webhookSecretRef" TEXT,
    "metadataJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalisationProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "receiptNumber" TEXT,
    "fiscalNumber" TEXT,
    "status" "FiscalReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3),
    "qrCodeData" TEXT,
    "signature" TEXT,
    "providerKey" TEXT,
    "providerReference" TEXT,
    "requestIdempotencyKey" TEXT,
    "rawResponseJson" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "scope" "TemplateScope" NOT NULL DEFAULT 'SYSTEM',
    "documentType" "DocumentType" NOT NULL,
    "targetType" "ExportTargetType" NOT NULL DEFAULT 'RECORD',
    "sourceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "schemaJson" TEXT NOT NULL,
    "checksum" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRenderJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVersionId" TEXT,
    "documentType" "DocumentType" NOT NULL,
    "targetType" "ExportTargetType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceEntityId" TEXT,
    "renderMode" "RenderMode" NOT NULL DEFAULT 'SYNC',
    "status" "RenderStatus" NOT NULL DEFAULT 'QUEUED',
    "payloadJson" TEXT NOT NULL,
    "filtersJson" TEXT,
    "idempotencyKey" TEXT,
    "requestedById" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentArtifact" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permit" (
    "id" TEXT NOT NULL,
    "permitType" TEXT NOT NULL,
    "permitNumber" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "responsiblePerson" TEXT NOT NULL,
    "documentUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "inspectorName" TEXT NOT NULL,
    "inspectorOrg" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "actions" TEXT,
    "actionsDue" TIMESTAMP(3),
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "incidentType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actionsTaken" TEXT,
    "reportedBy" TEXT NOT NULL,
    "photoUrls" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrIncident" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "siteId" TEXT,
    "sourceIncidentId" TEXT,
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "category" "HrIncidentCategory" NOT NULL,
    "severity" "HrIncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "HrIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "investigationNotes" TEXT,
    "reportedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplinaryAction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "incidentId" TEXT,
    "employeeId" TEXT NOT NULL,
    "actionType" "DisciplinaryActionType" NOT NULL,
    "status" "DisciplinaryActionStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT NOT NULL,
    "notes" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "penaltyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penaltyCurrency" TEXT NOT NULL DEFAULT 'USD',
    "penaltyStatus" "PenaltyStatus" NOT NULL DEFAULT 'NONE',
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "appliedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplinaryAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trainingType" TEXT NOT NULL,
    "trainingDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "certificateUrl" TEXT,
    "trainedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAcademicYear" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolTerm" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER,
    "capacity" INTEGER,
    "academicYearId" TEXT,
    "termId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolStream" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "termId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolTeacherProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "department" TEXT,
    "isClassTeacher" BOOLEAN NOT NULL DEFAULT false,
    "isHod" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolTeacherProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolSubject" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCore" BOOLEAN NOT NULL DEFAULT true,
    "passMark" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClassSubject" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "streamId" TEXT,
    "subjectId" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolClassSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolStudent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentNo" TEXT NOT NULL,
    "admissionNo" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "status" "SchoolStudentStatus" NOT NULL DEFAULT 'APPLICANT',
    "currentClassId" TEXT,
    "currentStreamId" TEXT,
    "isBoarding" BOOLEAN NOT NULL DEFAULT false,
    "admissionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolGuardian" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "guardianNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "nationalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolStudentGuardian" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "canReceiveFinancials" BOOLEAN NOT NULL DEFAULT true,
    "canReceiveAcademicResults" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolStudentGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolEnrollment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "streamId" TEXT,
    "status" "SchoolEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolHostel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genderPolicy" TEXT NOT NULL DEFAULT 'MIXED',
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolHostel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolHostelRoom" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "floor" TEXT,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolHostelRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolHostelBed" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolHostelBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolBoardingAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "roomId" TEXT,
    "bedId" TEXT,
    "status" "SchoolBoardingAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolBoardingAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolLeaveRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "termId" TEXT,
    "requestType" "SchoolLeaveRequestType" NOT NULL,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "guardianContact" TEXT NOT NULL,
    "status" "SchoolLeaveRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "checkedOutById" TEXT,
    "checkedOutAt" TIMESTAMP(3),
    "checkedInById" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolBoardingMovementLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "movementType" "SchoolBoardingMovementType" NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolBoardingMovementLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolResultSheet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "streamId" TEXT,
    "title" TEXT NOT NULL,
    "status" "SchoolResultSheetStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT,
    "hodApprovedById" TEXT,
    "publishedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "hodApprovedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolResultSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolResultModerationAction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "actionType" "SchoolResultModerationActionType" NOT NULL,
    "fromStatus" "SchoolResultSheetStatus" NOT NULL,
    "toStatus" "SchoolResultSheetStatus" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "comment" TEXT,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolResultModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolPublishWindow" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT,
    "streamId" TEXT,
    "openAt" TIMESTAMP(3) NOT NULL,
    "closeAt" TIMESTAMP(3) NOT NULL,
    "status" "SchoolPublishWindowStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolPublishWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolResultLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "grade" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolResultLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFeeStructure" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "SchoolFeeStructureStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFeeStructureLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "feeCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFeeStructureLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFeeInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "feeStructureId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "SchoolFeeInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "waivedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "writeOffAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFeeInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFeeInvoiceLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "feeCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitAmount" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFeeInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFeeReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "SchoolFeePaymentMethod" NOT NULL,
    "reference" TEXT,
    "amountReceived" DOUBLE PRECISION NOT NULL,
    "amountAllocated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountUnallocated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SchoolFeeReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFeeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFeeReceiptAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "allocatedAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFeeReceiptAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFeeWaiver" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "waiverType" "SchoolFeeWaiverType" NOT NULL,
    "reason" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "SchoolFeeWaiverStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFeeWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAttendanceSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "streamId" TEXT,
    "attendanceDate" DATE NOT NULL,
    "status" "SchoolAttendanceSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "lockedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAttendanceSessionLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SchoolAttendanceEntryStatus" NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAttendanceSessionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarSalesLead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leadNo" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WALK_IN',
    "vehicleInterest" TEXT,
    "budgetMin" DOUBLE PRECISION,
    "budgetMax" DOUBLE PRECISION,
    "status" "CarSalesLeadStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarSalesLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarSalesVehicle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stockNo" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT,
    "mileageKm" INTEGER,
    "acquisitionDate" TIMESTAMP(3),
    "acquisitionCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "listingPrice" DOUBLE PRECISION NOT NULL,
    "minApprovalPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "CarSalesVehicleStatus" NOT NULL DEFAULT 'IN_STOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarSalesVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarSalesDeal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dealNo" TEXT NOT NULL,
    "leadId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "salespersonId" TEXT NOT NULL,
    "status" "CarSalesDealStatus" NOT NULL DEFAULT 'DRAFT',
    "quoteAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAmount" DOUBLE PRECISION NOT NULL,
    "reservedUntil" TIMESTAMP(3),
    "contractedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarSalesDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarSalesPayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "CarSalesPaymentMethod" NOT NULL,
    "status" "CarSalesPaymentStatus" NOT NULL DEFAULT 'POSTED',
    "amount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarSalesPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "NVR" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 554,
    "httpPort" INTEGER NOT NULL DEFAULT 80,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL DEFAULT 'Hikvision',
    "model" TEXT,
    "firmware" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastHeartbeat" TIMESTAMP(3),
    "rtspPort" INTEGER NOT NULL DEFAULT 554,
    "isapiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onvifEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NVR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelNumber" INTEGER NOT NULL,
    "nvrId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "description" TEXT,
    "mainStreamId" TEXT,
    "subStreamId" TEXT,
    "hasPTZ" BOOLEAN NOT NULL DEFAULT false,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "hasMotionDetect" BOOLEAN NOT NULL DEFAULT true,
    "hasLineDetect" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "isRecording" BOOLEAN NOT NULL DEFAULT true,
    "lastSeen" TIMESTAMP(3),
    "isHighSecurity" BOOLEAN NOT NULL DEFAULT false,
    "requiredUptime" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CCTVEvent" (
    "id" TEXT NOT NULL,
    "nvrId" TEXT,
    "cameraId" TEXT,
    "eventType" "CCTVEventType" NOT NULL,
    "severity" "EventSeverity" NOT NULL DEFAULT 'MEDIUM',
    "eventTime" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "snapshotUrl" TEXT,
    "linkedIncidentId" TEXT,
    "isAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CCTVEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamSession" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "streamType" TEXT NOT NULL DEFAULT 'sub',
    "protocol" "StreamProtocol" NOT NULL,
    "status" "StreamSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "playUrl" TEXT,
    "purpose" TEXT,
    "clientMeta" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybackRecord" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "fileSize" INTEGER,
    "playbackUri" TEXT,
    "recordingType" TEXT NOT NULL DEFAULT 'CONTINUOUS',
    "duration" INTEGER,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT,
    "requestedBy" TEXT,
    "purpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybackRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraAccessLog" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "userId" TEXT,
    "accessType" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "ipAddress" TEXT,
    "purpose" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CameraAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_tenantStatus_idx" ON "Company"("tenantStatus");

-- CreateIndex
CREATE INDEX "Company_isProvisioned_idx" ON "Company"("isProvisioned");

-- CreateIndex
CREATE INDEX "IdSequence_companyId_idx" ON "IdSequence"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "IdSequence_companyId_entityKey_scopeKey_key" ON "IdSequence"("companyId", "entityKey", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalIdSequence_entityKey_scopeKey_key" ON "GlobalIdSequence"("entityKey", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_isActive_idx" ON "SubscriptionPlan"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySubscription_externalSubscriptionId_key" ON "CompanySubscription"("externalSubscriptionId");

-- CreateIndex
CREATE INDEX "CompanySubscription_companyId_status_idx" ON "CompanySubscription"("companyId", "status");

-- CreateIndex
CREATE INDEX "CompanySubscription_planId_idx" ON "CompanySubscription"("planId");

-- CreateIndex
CREATE INDEX "CompanySubscription_currentPeriodEnd_idx" ON "CompanySubscription"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFeature_key_key" ON "PlatformFeature"("key");

-- CreateIndex
CREATE INDEX "PlatformFeature_isActive_idx" ON "PlatformFeature"("isActive");

-- CreateIndex
CREATE INDEX "CompanyFeatureFlag_featureId_idx" ON "CompanyFeatureFlag"("featureId");

-- CreateIndex
CREATE INDEX "CompanyFeatureFlag_companyId_isEnabled_idx" ON "CompanyFeatureFlag"("companyId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFeatureFlag_companyId_featureId_key" ON "CompanyFeatureFlag"("companyId", "featureId");

-- CreateIndex
CREATE INDEX "UserFeatureFlag_featureId_idx" ON "UserFeatureFlag"("featureId");

-- CreateIndex
CREATE INDEX "UserFeatureFlag_userId_isEnabled_idx" ON "UserFeatureFlag"("userId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "UserFeatureFlag_userId_featureId_key" ON "UserFeatureFlag"("userId", "featureId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureBundle_code_key" ON "FeatureBundle"("code");

-- CreateIndex
CREATE INDEX "FeatureBundle_isActive_idx" ON "FeatureBundle"("isActive");

-- CreateIndex
CREATE INDEX "FeatureBundleItem_featureId_idx" ON "FeatureBundleItem"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureBundleItem_bundleId_featureId_key" ON "FeatureBundleItem"("bundleId", "featureId");

-- CreateIndex
CREATE INDEX "CompanySubscriptionAddon_bundleId_isEnabled_idx" ON "CompanySubscriptionAddon"("bundleId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySubscriptionAddon_companyId_bundleId_key" ON "CompanySubscriptionAddon"("companyId", "bundleId");

-- CreateIndex
CREATE INDEX "ProvisioningEvent_companyId_createdAt_idx" ON "ProvisioningEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ProvisioningEvent_status_idx" ON "ProvisioningEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SubdomainReservation_subdomain_key" ON "SubdomainReservation"("subdomain");

-- CreateIndex
CREATE INDEX "SubdomainReservation_companyId_status_idx" ON "SubdomainReservation"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDomain_hostname_key" ON "CompanyDomain"("hostname");

-- CreateIndex
CREATE INDEX "CompanyDomain_companyId_status_idx" ON "CompanyDomain"("companyId", "status");

-- CreateIndex
CREATE INDEX "CompanyDomain_status_idx" ON "CompanyDomain"("status");

-- CreateIndex
CREATE INDEX "SupportAccessRequest_companyId_status_idx" ON "SupportAccessRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "SupportAccessRequest_requestedBy_idx" ON "SupportAccessRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "SupportSession_companyId_status_idx" ON "SupportSession"("companyId", "status");

-- CreateIndex
CREATE INDEX "SupportSession_requestId_idx" ON "SupportSession"("requestId");

-- CreateIndex
CREATE INDEX "SupportSession_actor_idx" ON "SupportSession"("actor");

-- CreateIndex
CREATE INDEX "RunbookDefinition_companyId_enabled_idx" ON "RunbookDefinition"("companyId", "enabled");

-- CreateIndex
CREATE INDEX "RunbookDefinition_actionType_idx" ON "RunbookDefinition"("actionType");

-- CreateIndex
CREATE INDEX "RunbookExecution_runbookId_createdAt_idx" ON "RunbookExecution"("runbookId", "createdAt");

-- CreateIndex
CREATE INDEX "RunbookExecution_companyId_createdAt_idx" ON "RunbookExecution"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "RunbookExecution_status_idx" ON "RunbookExecution"("status");

-- CreateIndex
CREATE INDEX "TenantSloMetricSnapshot_companyId_metricKey_createdAt_idx" ON "TenantSloMetricSnapshot"("companyId", "metricKey", "createdAt");

-- CreateIndex
CREATE INDEX "HealthIncident_companyId_status_createdAt_idx" ON "HealthIncident"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "HealthIncident_riskLevel_status_idx" ON "HealthIncident"("riskLevel", "status");

-- CreateIndex
CREATE INDEX "ContractEnforcementEvent_companyId_createdAt_idx" ON "ContractEnforcementEvent"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAuditEvent_eventHash_key" ON "PlatformAuditEvent"("eventHash");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_companyId_createdAt_idx" ON "PlatformAuditEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_eventType_createdAt_idx" ON "PlatformAuditEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "Site_companyId_idx" ON "Site"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_companyId_code_key" ON "Site"("companyId", "code");

-- CreateIndex
CREATE INDEX "Section_siteId_idx" ON "Section"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");

-- CreateIndex
CREATE INDEX "Employee_userId_idx" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_gradeId_idx" ON "Employee"("gradeId");

-- CreateIndex
CREATE INDEX "Employee_supervisorId_idx" ON "Employee"("supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_employeeId_key" ON "Employee"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_nationalIdNumber_key" ON "Employee"("companyId", "nationalIdNumber");

-- CreateIndex
CREATE INDEX "EmployeeModuleAssignment_companyId_module_isActive_idx" ON "EmployeeModuleAssignment"("companyId", "module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeModuleAssignment_employeeId_module_key" ON "EmployeeModuleAssignment"("employeeId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "FixedSalary_employeeId_key" ON "FixedSalary"("employeeId");

-- CreateIndex
CREATE INDEX "FixedSalary_employeeId_idx" ON "FixedSalary"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeePayment_employeeId_type_idx" ON "EmployeePayment"("employeeId", "type");

-- CreateIndex
CREATE INDEX "EmployeePayment_employeeId_payoutSource_idx" ON "EmployeePayment"("employeeId", "payoutSource");

-- CreateIndex
CREATE INDEX "EmployeePayment_payrollRunId_idx" ON "EmployeePayment"("payrollRunId");

-- CreateIndex
CREATE INDEX "EmployeePayment_payrollLineItemId_idx" ON "EmployeePayment"("payrollLineItemId");

-- CreateIndex
CREATE INDEX "EmployeePayment_disbursementBatchId_idx" ON "EmployeePayment"("disbursementBatchId");

-- CreateIndex
CREATE INDEX "EmployeePayment_disbursementItemId_idx" ON "EmployeePayment"("disbursementItemId");

-- CreateIndex
CREATE INDEX "EmployeePayment_goldShiftAllocationId_idx" ON "EmployeePayment"("goldShiftAllocationId");

-- CreateIndex
CREATE INDEX "EmployeePayment_irregularPayoutBatchId_idx" ON "EmployeePayment"("irregularPayoutBatchId");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_code_key" ON "Department"("companyId", "code");

-- CreateIndex
CREATE INDEX "JobGrade_companyId_idx" ON "JobGrade"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "JobGrade_companyId_code_key" ON "JobGrade"("companyId", "code");

-- CreateIndex
CREATE INDEX "CompensationProfile_employeeId_status_idx" ON "CompensationProfile"("employeeId", "status");

-- CreateIndex
CREATE INDEX "CompensationProfile_workflowStatus_idx" ON "CompensationProfile"("workflowStatus");

-- CreateIndex
CREATE INDEX "CompensationProfile_effectiveFrom_idx" ON "CompensationProfile"("effectiveFrom");

-- CreateIndex
CREATE INDEX "CompensationRule_companyId_isActive_idx" ON "CompensationRule"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "CompensationRule_workflowStatus_idx" ON "CompensationRule"("workflowStatus");

-- CreateIndex
CREATE INDEX "CompensationRule_employeeId_idx" ON "CompensationRule"("employeeId");

-- CreateIndex
CREATE INDEX "CompensationRule_departmentId_idx" ON "CompensationRule"("departmentId");

-- CreateIndex
CREATE INDEX "CompensationRule_gradeId_idx" ON "CompensationRule"("gradeId");

-- CreateIndex
CREATE INDEX "CompensationTemplate_companyId_isActive_idx" ON "CompensationTemplate"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "CompensationTemplate_employmentType_position_idx" ON "CompensationTemplate"("employmentType", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CompensationTemplate_companyId_name_key" ON "CompensationTemplate"("companyId", "name");

-- CreateIndex
CREATE INDEX "CompensationTemplateRule_compensationRuleId_idx" ON "CompensationTemplateRule"("compensationRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "CompensationTemplateRule_templateId_compensationRuleId_key" ON "CompensationTemplateRule"("templateId", "compensationRuleId");

-- CreateIndex
CREATE INDEX "PayrollPeriod_companyId_domain_payoutSource_scopeKey_startD_idx" ON "PayrollPeriod"("companyId", "domain", "payoutSource", "scopeKey", "startDate");

-- CreateIndex
CREATE INDEX "PayrollPeriod_status_idx" ON "PayrollPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_companyId_domain_periodKey_scopeKey_key" ON "PayrollPeriod"("companyId", "domain", "periodKey", "scopeKey");

-- CreateIndex
CREATE INDEX "PayrollRun_companyId_status_domain_payoutSource_idx" ON "PayrollRun"("companyId", "status", "domain", "payoutSource");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_periodId_runNumber_key" ON "PayrollRun"("periodId", "runNumber");

-- CreateIndex
CREATE INDEX "PayrollLineItem_employeeId_idx" ON "PayrollLineItem"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollLineItem_compensationProfileId_idx" ON "PayrollLineItem"("compensationProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLineItem_runId_employeeId_key" ON "PayrollLineItem"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollLineComponent_lineItemId_idx" ON "PayrollLineComponent"("lineItemId");

-- CreateIndex
CREATE INDEX "PayrollLineComponent_ruleId_idx" ON "PayrollLineComponent"("ruleId");

-- CreateIndex
CREATE INDEX "DisbursementBatch_companyId_status_idx" ON "DisbursementBatch"("companyId", "status");

-- CreateIndex
CREATE INDEX "DisbursementBatch_payrollRunId_idx" ON "DisbursementBatch"("payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "DisbursementBatch_companyId_code_key" ON "DisbursementBatch"("companyId", "code");

-- CreateIndex
CREATE INDEX "DisbursementItem_lineItemId_idx" ON "DisbursementItem"("lineItemId");

-- CreateIndex
CREATE INDEX "DisbursementItem_employeeId_idx" ON "DisbursementItem"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "DisbursementItem_batchId_employeeId_key" ON "DisbursementItem"("batchId", "employeeId");

-- CreateIndex
CREATE INDEX "ApprovalAction_companyId_entityType_entityId_idx" ON "ApprovalAction"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApprovalAction_actedById_actedAt_idx" ON "ApprovalAction"("actedById", "actedAt");

-- CreateIndex
CREATE INDEX "Notification_companyId_createdAt_idx" ON "Notification"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_companyId_type_createdAt_idx" ON "Notification"("companyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_companyId_severity_createdAt_idx" ON "Notification"("companyId", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_createdAt_idx" ON "NotificationRecipient"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_isRead_isArchived_createdAt_idx" ON "NotificationRecipient"("userId", "isRead", "isArchived", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_key" ON "NotificationRecipient"("notificationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreference_userId_key" ON "UserNotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "WebPushSubscription_userId_isActive_idx" ON "WebPushSubscription"("userId", "isActive");

-- CreateIndex
CREATE INDEX "AdjustmentEntry_companyId_targetType_status_idx" ON "AdjustmentEntry"("companyId", "targetType", "status");

-- CreateIndex
CREATE INDEX "AdjustmentEntry_employeeId_idx" ON "AdjustmentEntry"("employeeId");

-- CreateIndex
CREATE INDEX "IrregularPayoutBatch_companyId_source_workflowStatus_dueDat_idx" ON "IrregularPayoutBatch"("companyId", "source", "workflowStatus", "dueDate");

-- CreateIndex
CREATE INDEX "IrregularPayoutBatchItem_employeeId_idx" ON "IrregularPayoutBatchItem"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "IrregularPayoutBatchItem_batchId_employeeId_key" ON "IrregularPayoutBatchItem"("batchId", "employeeId");

-- CreateIndex
CREATE INDEX "ShiftReport_siteId_date_idx" ON "ShiftReport"("siteId", "date");

-- CreateIndex
CREATE INDEX "ShiftReport_date_idx" ON "ShiftReport"("date");

-- CreateIndex
CREATE INDEX "ShiftReport_shiftGroupId_idx" ON "ShiftReport"("shiftGroupId");

-- CreateIndex
CREATE INDEX "DowntimeCode_siteId_idx" ON "DowntimeCode"("siteId");

-- CreateIndex
CREATE INDEX "DowntimeEvent_shiftReportId_idx" ON "DowntimeEvent"("shiftReportId");

-- CreateIndex
CREATE INDEX "DowntimeEvent_plantReportId_idx" ON "DowntimeEvent"("plantReportId");

-- CreateIndex
CREATE INDEX "Attendance_siteId_date_idx" ON "Attendance"("siteId", "date");

-- CreateIndex
CREATE INDEX "Attendance_shiftGroupId_idx" ON "Attendance"("shiftGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_date_siteId_shift_employeeId_key" ON "Attendance"("date", "siteId", "shift", "employeeId");

-- CreateIndex
CREATE INDEX "ShiftGroup_companyId_siteId_isActive_idx" ON "ShiftGroup"("companyId", "siteId", "isActive");

-- CreateIndex
CREATE INDEX "ShiftGroup_leaderEmployeeId_idx" ON "ShiftGroup"("leaderEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftGroup_companyId_name_key" ON "ShiftGroup"("companyId", "name");

-- CreateIndex
CREATE INDEX "ShiftGroupMember_employeeId_isActive_idx" ON "ShiftGroupMember"("employeeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftGroupMember_shiftGroupId_employeeId_key" ON "ShiftGroupMember"("shiftGroupId", "employeeId");

-- CreateIndex
CREATE INDEX "ShiftGroupSchedule_companyId_date_shift_idx" ON "ShiftGroupSchedule"("companyId", "date", "shift");

-- CreateIndex
CREATE INDEX "ShiftGroupSchedule_siteId_date_shift_idx" ON "ShiftGroupSchedule"("siteId", "date", "shift");

-- CreateIndex
CREATE INDEX "ShiftGroupSchedule_shiftGroupId_idx" ON "ShiftGroupSchedule"("shiftGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftGroupSchedule_shiftGroupId_date_key" ON "ShiftGroupSchedule"("shiftGroupId", "date");

-- CreateIndex
CREATE INDEX "PlantReport_siteId_date_idx" ON "PlantReport"("siteId", "date");

-- CreateIndex
CREATE INDEX "GoldPrice_companyId_effectiveDate_idx" ON "GoldPrice"("companyId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "GoldPrice_companyId_effectiveDate_key" ON "GoldPrice"("companyId", "effectiveDate");

-- CreateIndex
CREATE INDEX "GoldExpenseType_companyId_isActive_idx" ON "GoldExpenseType"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GoldExpenseType_companyId_name_key" ON "GoldExpenseType"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GoldPour_pourBarId_key" ON "GoldPour"("pourBarId");

-- CreateIndex
CREATE INDEX "GoldPour_siteId_idx" ON "GoldPour"("siteId");

-- CreateIndex
CREATE INDEX "GoldPour_pourDate_idx" ON "GoldPour"("pourDate");

-- CreateIndex
CREATE INDEX "GoldPour_createdById_idx" ON "GoldPour"("createdById");

-- CreateIndex
CREATE INDEX "GoldPour_goldShiftAllocationId_idx" ON "GoldPour"("goldShiftAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "GoldPurchase_goldPourId_key" ON "GoldPurchase"("goldPourId");

-- CreateIndex
CREATE INDEX "GoldPurchase_companyId_purchaseDate_idx" ON "GoldPurchase"("companyId", "purchaseDate");

-- CreateIndex
CREATE INDEX "GoldPurchase_siteId_purchaseDate_idx" ON "GoldPurchase"("siteId", "purchaseDate");

-- CreateIndex
CREATE INDEX "GoldPurchase_sellerEmployeeId_idx" ON "GoldPurchase"("sellerEmployeeId");

-- CreateIndex
CREATE INDEX "GoldPurchase_receiver1Id_idx" ON "GoldPurchase"("receiver1Id");

-- CreateIndex
CREATE INDEX "GoldPurchase_receiver2Id_idx" ON "GoldPurchase"("receiver2Id");

-- CreateIndex
CREATE UNIQUE INDEX "GoldPurchase_companyId_purchaseNumber_key" ON "GoldPurchase"("companyId", "purchaseNumber");

-- CreateIndex
CREATE INDEX "GoldDispatch_goldPourId_idx" ON "GoldDispatch"("goldPourId");

-- CreateIndex
CREATE INDEX "GoldDispatchBatch_dispatchId_idx" ON "GoldDispatchBatch"("dispatchId");

-- CreateIndex
CREATE INDEX "GoldDispatchBatch_goldPourId_idx" ON "GoldDispatchBatch"("goldPourId");

-- CreateIndex
CREATE UNIQUE INDEX "GoldDispatchBatch_dispatchId_goldPourId_key" ON "GoldDispatchBatch"("dispatchId", "goldPourId");

-- CreateIndex
CREATE INDEX "BuyerReceipt_goldPourId_idx" ON "BuyerReceipt"("goldPourId");

-- CreateIndex
CREATE INDEX "BuyerReceipt_goldDispatchId_idx" ON "BuyerReceipt"("goldDispatchId");

-- CreateIndex
CREATE INDEX "BuyerReceipt_receiptDate_idx" ON "BuyerReceipt"("receiptDate");

-- CreateIndex
CREATE INDEX "BuyerReceiptBatch_buyerReceiptId_idx" ON "BuyerReceiptBatch"("buyerReceiptId");

-- CreateIndex
CREATE INDEX "BuyerReceiptBatch_goldPourId_idx" ON "BuyerReceiptBatch"("goldPourId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerReceiptBatch_buyerReceiptId_goldPourId_key" ON "BuyerReceiptBatch"("buyerReceiptId", "goldPourId");

-- CreateIndex
CREATE INDEX "BuyerReceiptDispatch_buyerReceiptId_idx" ON "BuyerReceiptDispatch"("buyerReceiptId");

-- CreateIndex
CREATE INDEX "BuyerReceiptDispatch_goldDispatchId_idx" ON "BuyerReceiptDispatch"("goldDispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerReceiptDispatch_buyerReceiptId_goldDispatchId_key" ON "BuyerReceiptDispatch"("buyerReceiptId", "goldDispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "GoldShiftAllocation_shiftReportId_key" ON "GoldShiftAllocation"("shiftReportId");

-- CreateIndex
CREATE INDEX "GoldShiftAllocation_siteId_date_idx" ON "GoldShiftAllocation"("siteId", "date");

-- CreateIndex
CREATE INDEX "GoldShiftAllocation_workflowStatus_idx" ON "GoldShiftAllocation"("workflowStatus");

-- CreateIndex
CREATE UNIQUE INDEX "GoldShiftAllocation_siteId_date_shift_key" ON "GoldShiftAllocation"("siteId", "date", "shift");

-- CreateIndex
CREATE INDEX "GoldShiftExpense_allocationId_idx" ON "GoldShiftExpense"("allocationId");

-- CreateIndex
CREATE INDEX "GoldShiftWorkerShare_allocationId_idx" ON "GoldShiftWorkerShare"("allocationId");

-- CreateIndex
CREATE INDEX "GoldShiftWorkerShare_employeeId_idx" ON "GoldShiftWorkerShare"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "GoldShiftWorkerShare_allocationId_employeeId_key" ON "GoldShiftWorkerShare"("allocationId", "employeeId");

-- CreateIndex
CREATE INDEX "GoldInventoryEvent_companyId_siteId_eventDate_idx" ON "GoldInventoryEvent"("companyId", "siteId", "eventDate");

-- CreateIndex
CREATE INDEX "GoldInventoryEvent_sourceType_sourceId_idx" ON "GoldInventoryEvent"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "GoldException_companyId_status_idx" ON "GoldException"("companyId", "status");

-- CreateIndex
CREATE INDEX "GoldException_category_idx" ON "GoldException"("category");

-- CreateIndex
CREATE INDEX "GoldException_entityType_entityId_idx" ON "GoldException"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "GoldLedgerImport_companyId_createdAt_idx" ON "GoldLedgerImport"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "GoldLedgerEntry_importId_status_idx" ON "GoldLedgerEntry"("importId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GoldLedgerEntry_importId_lineNo_key" ON "GoldLedgerEntry"("importId", "lineNo");

-- CreateIndex
CREATE INDEX "ScrapMaterial_companyId_isActive_idx" ON "ScrapMaterial"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "ScrapMaterial_companyId_category_idx" ON "ScrapMaterial"("companyId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapMaterial_companyId_code_key" ON "ScrapMaterial"("companyId", "code");

-- CreateIndex
CREATE INDEX "ScrapSellerProfile_companyId_isActive_idx" ON "ScrapSellerProfile"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "ScrapSellerProfile_companyId_fullName_idx" ON "ScrapSellerProfile"("companyId", "fullName");

-- CreateIndex
CREATE INDEX "ScrapSellerProfile_companyId_nationalId_idx" ON "ScrapSellerProfile"("companyId", "nationalId");

-- CreateIndex
CREATE INDEX "ScrapMetalPrice_companyId_category_effectiveDate_idx" ON "ScrapMetalPrice"("companyId", "category", "effectiveDate");

-- CreateIndex
CREATE INDEX "ScrapMetalPrice_companyId_materialId_effectiveDate_idx" ON "ScrapMetalPrice"("companyId", "materialId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapMetalPrice_companyId_materialId_category_effectiveDate_key" ON "ScrapMetalPrice"("companyId", "materialId", "category", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapMetalEmployeeBalance_employeeId_key" ON "ScrapMetalEmployeeBalance"("employeeId");

-- CreateIndex
CREATE INDEX "ScrapMetalEmployeeBalance_companyId_employeeId_idx" ON "ScrapMetalEmployeeBalance"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapMetalEmployeeBalance_companyId_employeeId_key" ON "ScrapMetalEmployeeBalance"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "ScrapMetalBalanceEntry_companyId_employeeId_createdAt_idx" ON "ScrapMetalBalanceEntry"("companyId", "employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "ScrapMetalBalanceEntry_balanceId_createdAt_idx" ON "ScrapMetalBalanceEntry"("balanceId", "createdAt");

-- CreateIndex
CREATE INDEX "ScrapMetalPurchase_companyId_purchaseDate_idx" ON "ScrapMetalPurchase"("companyId", "purchaseDate");

-- CreateIndex
CREATE INDEX "ScrapMetalPurchase_siteId_purchaseDate_idx" ON "ScrapMetalPurchase"("siteId", "purchaseDate");

-- CreateIndex
CREATE INDEX "ScrapMetalPurchase_employeeId_idx" ON "ScrapMetalPurchase"("employeeId");

-- CreateIndex
CREATE INDEX "ScrapMetalPurchase_materialId_idx" ON "ScrapMetalPurchase"("materialId");

-- CreateIndex
CREATE INDEX "ScrapMetalPurchase_sellerProfileId_idx" ON "ScrapMetalPurchase"("sellerProfileId");

-- CreateIndex
CREATE INDEX "ScrapMetalPurchase_vendorId_idx" ON "ScrapMetalPurchase"("vendorId");

-- CreateIndex
CREATE INDEX "ScrapMetalPurchase_status_idx" ON "ScrapMetalPurchase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapMetalPurchase_companyId_purchaseNumber_key" ON "ScrapMetalPurchase"("companyId", "purchaseNumber");

-- CreateIndex
CREATE INDEX "ScrapMetalBatch_companyId_siteId_idx" ON "ScrapMetalBatch"("companyId", "siteId");

-- CreateIndex
CREATE INDEX "ScrapMetalBatch_status_idx" ON "ScrapMetalBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapMetalBatch_companyId_batchNumber_key" ON "ScrapMetalBatch"("companyId", "batchNumber");

-- CreateIndex
CREATE INDEX "ScrapMetalBatchItem_batchId_idx" ON "ScrapMetalBatchItem"("batchId");

-- CreateIndex
CREATE INDEX "ScrapMetalBatchItem_purchaseId_idx" ON "ScrapMetalBatchItem"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapMetalBatchItem_batchId_purchaseId_key" ON "ScrapMetalBatchItem"("batchId", "purchaseId");

-- CreateIndex
CREATE INDEX "ScrapMetalSale_companyId_saleDate_idx" ON "ScrapMetalSale"("companyId", "saleDate");

-- CreateIndex
CREATE INDEX "ScrapMetalSale_siteId_saleDate_idx" ON "ScrapMetalSale"("siteId", "saleDate");

-- CreateIndex
CREATE INDEX "ScrapMetalSale_batchId_idx" ON "ScrapMetalSale"("batchId");

-- CreateIndex
CREATE INDEX "ScrapMetalSale_status_idx" ON "ScrapMetalSale"("status");

-- CreateIndex
CREATE INDEX "ScrapMetalSale_materialId_idx" ON "ScrapMetalSale"("materialId");

-- CreateIndex
CREATE INDEX "ScrapMetalSale_customerId_idx" ON "ScrapMetalSale"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapMetalSale_companyId_saleNumber_key" ON "ScrapMetalSale"("companyId", "saleNumber");

-- CreateIndex
CREATE INDEX "ScrapTicketComplianceRule_companyId_scope_isActive_idx" ON "ScrapTicketComplianceRule"("companyId", "scope", "isActive");

-- CreateIndex
CREATE INDEX "ScrapTicketComplianceRule_companyId_category_isActive_idx" ON "ScrapTicketComplianceRule"("companyId", "category", "isActive");

-- CreateIndex
CREATE INDEX "ScrapTicketComplianceRule_companyId_materialId_isActive_idx" ON "ScrapTicketComplianceRule"("companyId", "materialId", "isActive");

-- CreateIndex
CREATE INDEX "StockLocation_siteId_idx" ON "StockLocation"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_siteId_code_key" ON "StockLocation"("siteId", "code");

-- CreateIndex
CREATE INDEX "InventoryItem_siteId_idx" ON "InventoryItem"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_siteId_itemCode_key" ON "InventoryItem"("siteId", "itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_referenceId_key" ON "StockMovement"("referenceId");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_idx" ON "StockMovement"("itemId");

-- CreateIndex
CREATE INDEX "StockMovement_toLocationId_idx" ON "StockMovement"("toLocationId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "RetailRegister_companyId_siteId_isActive_idx" ON "RetailRegister"("companyId", "siteId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RetailRegister_companyId_code_key" ON "RetailRegister"("companyId", "code");

-- CreateIndex
CREATE INDEX "RetailCatalogItem_companyId_siteId_status_idx" ON "RetailCatalogItem"("companyId", "siteId", "status");

-- CreateIndex
CREATE INDEX "RetailCatalogItem_inventoryItemId_idx" ON "RetailCatalogItem"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailCatalogItem_companyId_catalogCode_key" ON "RetailCatalogItem"("companyId", "catalogCode");

-- CreateIndex
CREATE UNIQUE INDEX "RetailCatalogItem_companyId_sku_key" ON "RetailCatalogItem"("companyId", "sku");

-- CreateIndex
CREATE INDEX "RetailPromotion_companyId_status_idx" ON "RetailPromotion"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailPromotion_companyId_promoCode_key" ON "RetailPromotion"("companyId", "promoCode");

-- CreateIndex
CREATE INDEX "RetailPurchaseOrder_companyId_siteId_status_idx" ON "RetailPurchaseOrder"("companyId", "siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailPurchaseOrder_companyId_poNo_key" ON "RetailPurchaseOrder"("companyId", "poNo");

-- CreateIndex
CREATE INDEX "RetailPurchaseOrderLine_purchaseOrderId_idx" ON "RetailPurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "RetailGoodsReceipt_companyId_siteId_status_idx" ON "RetailGoodsReceipt"("companyId", "siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailGoodsReceipt_companyId_receiptNo_key" ON "RetailGoodsReceipt"("companyId", "receiptNo");

-- CreateIndex
CREATE INDEX "RetailGoodsReceiptLine_receiptId_idx" ON "RetailGoodsReceiptLine"("receiptId");

-- CreateIndex
CREATE INDEX "RetailShift_companyId_siteId_status_idx" ON "RetailShift"("companyId", "siteId", "status");

-- CreateIndex
CREATE INDEX "RetailShift_cashierId_status_idx" ON "RetailShift"("cashierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailShift_companyId_shiftNo_key" ON "RetailShift"("companyId", "shiftNo");

-- CreateIndex
CREATE INDEX "RetailHeldCart_companyId_shiftId_status_idx" ON "RetailHeldCart"("companyId", "shiftId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailHeldCart_companyId_holdNo_key" ON "RetailHeldCart"("companyId", "holdNo");

-- CreateIndex
CREATE INDEX "RetailSale_companyId_siteId_status_postedAt_idx" ON "RetailSale"("companyId", "siteId", "status", "postedAt");

-- CreateIndex
CREATE INDEX "RetailSale_shiftId_idx" ON "RetailSale"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailSale_companyId_saleNo_key" ON "RetailSale"("companyId", "saleNo");

-- CreateIndex
CREATE INDEX "RetailSaleLine_saleId_idx" ON "RetailSaleLine"("saleId");

-- CreateIndex
CREATE INDEX "RetailSaleLine_sourceLineId_idx" ON "RetailSaleLine"("sourceLineId");

-- CreateIndex
CREATE INDEX "RetailSalePayment_saleId_idx" ON "RetailSalePayment"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_qrCode_key" ON "Equipment"("qrCode");

-- CreateIndex
CREATE INDEX "Equipment_siteId_idx" ON "Equipment"("siteId");

-- CreateIndex
CREATE INDEX "Equipment_locationId_idx" ON "Equipment"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_siteId_equipmentCode_key" ON "Equipment"("siteId", "equipmentCode");

-- CreateIndex
CREATE INDEX "WorkOrder_equipmentId_idx" ON "WorkOrder"("equipmentId");

-- CreateIndex
CREATE INDEX "WorkOrder_status_idx" ON "WorkOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSettings_companyId_key" ON "AccountingSettings"("companyId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_companyId_type_idx" ON "ChartOfAccount"("companyId", "type");

-- CreateIndex
CREATE INDEX "ChartOfAccount_companyId_nodeType_idx" ON "ChartOfAccount"("companyId", "nodeType");

-- CreateIndex
CREATE INDEX "ChartOfAccount_companyId_parentAccountId_idx" ON "ChartOfAccount"("companyId", "parentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_companyId_code_key" ON "ChartOfAccount"("companyId", "code");

-- CreateIndex
CREATE INDEX "AccountingPeriod_companyId_startDate_endDate_idx" ON "AccountingPeriod"("companyId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfEntryId_key" ON "JournalEntry"("reversalOfEntryId");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_entryDate_idx" ON "JournalEntry"("companyId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_companyId_entryNumber_key" ON "JournalEntry"("companyId", "entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_companyId_sourceType_sourceId_key" ON "JournalEntry"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingIntegrationEvent_eventKey_key" ON "AccountingIntegrationEvent"("eventKey");

-- CreateIndex
CREATE INDEX "AccountingIntegrationEvent_companyId_status_nextRetryAt_idx" ON "AccountingIntegrationEvent"("companyId", "status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "AccountingIntegrationEvent_companyId_sourceType_sourceId_idx" ON "AccountingIntegrationEvent"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "AccountingIntegrationEvent_companyId_sourceType_siteId_idx" ON "AccountingIntegrationEvent"("companyId", "sourceType", "siteId");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "PostingRule_companyId_sourceType_isActive_priority_idx" ON "PostingRule"("companyId", "sourceType", "isActive", "priority");

-- CreateIndex
CREATE INDEX "PostingRule_companyId_sourceType_siteId_isActive_priority_idx" ON "PostingRule"("companyId", "sourceType", "siteId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "PostingRuleLine_ruleId_idx" ON "PostingRuleLine"("ruleId");

-- CreateIndex
CREATE INDEX "PostingRuleLine_accountId_idx" ON "PostingRuleLine"("accountId");

-- CreateIndex
CREATE INDEX "PostingRuleLine_costCenterId_idx" ON "PostingRuleLine"("costCenterId");

-- CreateIndex
CREATE INDEX "PostingRuleCondition_ruleId_field_idx" ON "PostingRuleCondition"("ruleId", "field");

-- CreateIndex
CREATE INDEX "TaxCode_companyId_isActive_idx" ON "TaxCode"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "TaxCode_companyId_code_effectiveFrom_effectiveTo_idx" ON "TaxCode"("companyId", "code", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCode_companyId_code_key" ON "TaxCode"("companyId", "code");

-- CreateIndex
CREATE INDEX "TaxCategory_companyId_isActive_idx" ON "TaxCategory"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCategory_companyId_code_key" ON "TaxCategory"("companyId", "code");

-- CreateIndex
CREATE INDEX "TaxTemplate_companyId_isActive_idx" ON "TaxTemplate"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TaxTemplate_companyId_code_key" ON "TaxTemplate"("companyId", "code");

-- CreateIndex
CREATE INDEX "TaxTemplateLine_templateId_sortOrder_idx" ON "TaxTemplateLine"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "TaxTemplateLine_taxCodeId_idx" ON "TaxTemplateLine"("taxCodeId");

-- CreateIndex
CREATE INDEX "TaxRule_companyId_isActive_priority_idx" ON "TaxRule"("companyId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "TaxRule_companyId_appliesTo_currency_idx" ON "TaxRule"("companyId", "appliesTo", "currency");

-- CreateIndex
CREATE INDEX "CurrencyDefinition_companyId_isActive_sortOrder_idx" ON "CurrencyDefinition"("companyId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyDefinition_companyId_code_key" ON "CurrencyDefinition"("companyId", "code");

-- CreateIndex
CREATE INDEX "Customer_companyId_isActive_idx" ON "Customer"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "Vendor_companyId_isActive_idx" ON "Vendor"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "SalesInvoice_companyId_status_idx" ON "SalesInvoice"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_companyId_invoiceNumber_key" ON "SalesInvoice"("companyId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_invoiceId_idx" ON "SalesInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "SalesQuotation_companyId_status_idx" ON "SalesQuotation"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesQuotation_companyId_quotationNumber_key" ON "SalesQuotation"("companyId", "quotationNumber");

-- CreateIndex
CREATE INDEX "SalesQuotationLine_quotationId_idx" ON "SalesQuotationLine"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReceipt_companyId_receiptNumber_key" ON "SalesReceipt"("companyId", "receiptNumber");

-- CreateIndex
CREATE INDEX "CreditNote_companyId_status_idx" ON "CreditNote"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_companyId_noteNumber_key" ON "CreditNote"("companyId", "noteNumber");

-- CreateIndex
CREATE INDEX "CreditNoteLine_noteId_idx" ON "CreditNoteLine"("noteId");

-- CreateIndex
CREATE INDEX "SalesWriteOff_companyId_invoiceId_idx" ON "SalesWriteOff"("companyId", "invoiceId");

-- CreateIndex
CREATE INDEX "PurchaseBill_companyId_status_idx" ON "PurchaseBill"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseBill_companyId_billNumber_key" ON "PurchaseBill"("companyId", "billNumber");

-- CreateIndex
CREATE INDEX "PurchaseBillLine_billId_idx" ON "PurchaseBillLine"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchasePayment_companyId_paymentNumber_key" ON "PurchasePayment"("companyId", "paymentNumber");

-- CreateIndex
CREATE INDEX "DebitNote_companyId_status_idx" ON "DebitNote"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DebitNote_companyId_noteNumber_key" ON "DebitNote"("companyId", "noteNumber");

-- CreateIndex
CREATE INDEX "DebitNoteLine_noteId_idx" ON "DebitNoteLine"("noteId");

-- CreateIndex
CREATE INDEX "PurchaseWriteOff_companyId_billId_idx" ON "PurchaseWriteOff"("companyId", "billId");

-- CreateIndex
CREATE INDEX "PaymentLedgerEntry_companyId_accountType_entryDate_idx" ON "PaymentLedgerEntry"("companyId", "accountType", "entryDate");

-- CreateIndex
CREATE INDEX "PaymentLedgerEntry_companyId_partyType_partyId_entryDate_idx" ON "PaymentLedgerEntry"("companyId", "partyType", "partyId", "entryDate");

-- CreateIndex
CREATE INDEX "PaymentLedgerEntry_companyId_invoiceId_billId_idx" ON "PaymentLedgerEntry"("companyId", "invoiceId", "billId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLedgerEntry_companyId_sourceType_sourceId_key" ON "PaymentLedgerEntry"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "BankAccount_companyId_isActive_idx" ON "BankAccount"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "TenderAccountMapping_companyId_tenderType_isActive_priority_idx" ON "TenderAccountMapping"("companyId", "tenderType", "isActive", "priority");

-- CreateIndex
CREATE INDEX "TenderAccountMapping_companyId_siteId_tenderType_isActive_p_idx" ON "TenderAccountMapping"("companyId", "siteId", "tenderType", "isActive", "priority");

-- CreateIndex
CREATE INDEX "BankTransaction_companyId_txnDate_idx" ON "BankTransaction"("companyId", "txnDate");

-- CreateIndex
CREATE INDEX "BankReconciliation_companyId_bankAccountId_status_idx" ON "BankReconciliation"("companyId", "bankAccountId", "status");

-- CreateIndex
CREATE INDEX "BankStatementLine_reconciliationId_idx" ON "BankStatementLine"("reconciliationId");

-- CreateIndex
CREATE INDEX "VatReturnSummary_companyId_periodStart_periodEnd_idx" ON "VatReturnSummary"("companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "VatReturn_companyId_status_periodStart_periodEnd_idx" ON "VatReturn"("companyId", "status", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "VatReturn_companyId_periodStart_periodEnd_key" ON "VatReturn"("companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "VatReturnLine_vatReturnId_idx" ON "VatReturnLine"("vatReturnId");

-- CreateIndex
CREATE INDEX "OpeningBalanceImport_companyId_effectiveDate_idx" ON "OpeningBalanceImport"("companyId", "effectiveDate");

-- CreateIndex
CREATE INDEX "PeriodCloseVoucher_companyId_closingDate_idx" ON "PeriodCloseVoucher"("companyId", "closingDate");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodCloseVoucher_companyId_periodId_key" ON "PeriodCloseVoucher"("companyId", "periodId");

-- CreateIndex
CREATE INDEX "FixedAsset_companyId_isActive_idx" ON "FixedAsset"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_companyId_assetCode_key" ON "FixedAsset"("companyId", "assetCode");

-- CreateIndex
CREATE INDEX "Budget_companyId_status_idx" ON "Budget"("companyId", "status");

-- CreateIndex
CREATE INDEX "BudgetLine_companyId_idx" ON "BudgetLine"("companyId");

-- CreateIndex
CREATE INDEX "BudgetLine_budgetId_idx" ON "BudgetLine"("budgetId");

-- CreateIndex
CREATE INDEX "CostCenter_companyId_isActive_idx" ON "CostCenter"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_companyId_code_key" ON "CostCenter"("companyId", "code");

-- CreateIndex
CREATE INDEX "AccountingSeedExecution_companyId_packCode_createdAt_idx" ON "AccountingSeedExecution"("companyId", "packCode", "createdAt");

-- CreateIndex
CREATE INDEX "AccountingSeedExecution_companyId_status_createdAt_idx" ON "AccountingSeedExecution"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CurrencyRate_companyId_effectiveDate_idx" ON "CurrencyRate"("companyId", "effectiveDate");

-- CreateIndex
CREATE INDEX "FiscalisationProviderConfig_companyId_isActive_idx" ON "FiscalisationProviderConfig"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalisationProviderConfig_companyId_providerKey_key" ON "FiscalisationProviderConfig"("companyId", "providerKey");

-- CreateIndex
CREATE INDEX "FiscalReceipt_companyId_status_idx" ON "FiscalReceipt"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalReceipt_invoiceId_key" ON "FiscalReceipt"("invoiceId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_companyId_documentType_targetType_sourceKe_idx" ON "DocumentTemplate"("companyId", "documentType", "targetType", "sourceKey", "isActive");

-- CreateIndex
CREATE INDEX "DocumentTemplate_scope_documentType_targetType_sourceKey_is_idx" ON "DocumentTemplate"("scope", "documentType", "targetType", "sourceKey", "isDefault");

-- CreateIndex
CREATE INDEX "DocumentTemplateVersion_templateId_isPublished_createdAt_idx" ON "DocumentTemplateVersion"("templateId", "isPublished", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplateVersion_templateId_version_key" ON "DocumentTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "DocumentRenderJob_companyId_status_queuedAt_idx" ON "DocumentRenderJob"("companyId", "status", "queuedAt");

-- CreateIndex
CREATE INDEX "DocumentRenderJob_status_nextRetryAt_idx" ON "DocumentRenderJob"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "DocumentRenderJob_companyId_idempotencyKey_idx" ON "DocumentRenderJob"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentArtifact_jobId_key" ON "DocumentArtifact"("jobId");

-- CreateIndex
CREATE INDEX "DocumentArtifact_companyId_createdAt_idx" ON "DocumentArtifact"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Permit_siteId_idx" ON "Permit"("siteId");

-- CreateIndex
CREATE INDEX "Permit_expiryDate_idx" ON "Permit"("expiryDate");

-- CreateIndex
CREATE INDEX "Inspection_siteId_idx" ON "Inspection"("siteId");

-- CreateIndex
CREATE INDEX "Incident_siteId_idx" ON "Incident"("siteId");

-- CreateIndex
CREATE INDEX "Incident_incidentDate_idx" ON "Incident"("incidentDate");

-- CreateIndex
CREATE INDEX "HrIncident_companyId_status_incidentDate_idx" ON "HrIncident"("companyId", "status", "incidentDate");

-- CreateIndex
CREATE INDEX "HrIncident_employeeId_incidentDate_idx" ON "HrIncident"("employeeId", "incidentDate");

-- CreateIndex
CREATE INDEX "HrIncident_siteId_idx" ON "HrIncident"("siteId");

-- CreateIndex
CREATE INDEX "HrIncident_sourceIncidentId_idx" ON "HrIncident"("sourceIncidentId");

-- CreateIndex
CREATE INDEX "HrIncident_reportedById_idx" ON "HrIncident"("reportedById");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_companyId_status_createdAt_idx" ON "DisciplinaryAction"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_employeeId_createdAt_idx" ON "DisciplinaryAction"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_incidentId_idx" ON "DisciplinaryAction"("incidentId");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_actionType_penaltyStatus_idx" ON "DisciplinaryAction"("actionType", "penaltyStatus");

-- CreateIndex
CREATE INDEX "TrainingRecord_userId_idx" ON "TrainingRecord"("userId");

-- CreateIndex
CREATE INDEX "TrainingRecord_expiryDate_idx" ON "TrainingRecord"("expiryDate");

-- CreateIndex
CREATE INDEX "SchoolAcademicYear_companyId_isActive_idx" ON "SchoolAcademicYear"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAcademicYear_companyId_code_key" ON "SchoolAcademicYear"("companyId", "code");

-- CreateIndex
CREATE INDEX "SchoolTerm_companyId_isActive_idx" ON "SchoolTerm"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolTerm_companyId_academicYearId_code_key" ON "SchoolTerm"("companyId", "academicYearId", "code");

-- CreateIndex
CREATE INDEX "SchoolClass_companyId_idx" ON "SchoolClass"("companyId");

-- CreateIndex
CREATE INDEX "SchoolClass_termId_idx" ON "SchoolClass"("termId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_companyId_code_key" ON "SchoolClass"("companyId", "code");

-- CreateIndex
CREATE INDEX "SchoolStream_companyId_idx" ON "SchoolStream"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStream_companyId_classId_code_key" ON "SchoolStream"("companyId", "classId", "code");

-- CreateIndex
CREATE INDEX "SchoolTeacherProfile_companyId_isActive_idx" ON "SchoolTeacherProfile"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolTeacherProfile_companyId_userId_key" ON "SchoolTeacherProfile"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolTeacherProfile_companyId_employeeCode_key" ON "SchoolTeacherProfile"("companyId", "employeeCode");

-- CreateIndex
CREATE INDEX "SchoolSubject_companyId_isActive_idx" ON "SchoolSubject"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSubject_companyId_code_key" ON "SchoolSubject"("companyId", "code");

-- CreateIndex
CREATE INDEX "SchoolClassSubject_companyId_teacherProfileId_isActive_idx" ON "SchoolClassSubject"("companyId", "teacherProfileId", "isActive");

-- CreateIndex
CREATE INDEX "SchoolClassSubject_companyId_termId_classId_streamId_idx" ON "SchoolClassSubject"("companyId", "termId", "classId", "streamId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClassSubject_companyId_termId_classId_streamId_subjec_key" ON "SchoolClassSubject"("companyId", "termId", "classId", "streamId", "subjectId");

-- CreateIndex
CREATE INDEX "SchoolStudent_companyId_status_idx" ON "SchoolStudent"("companyId", "status");

-- CreateIndex
CREATE INDEX "SchoolStudent_currentClassId_idx" ON "SchoolStudent"("currentClassId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStudent_companyId_studentNo_key" ON "SchoolStudent"("companyId", "studentNo");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStudent_companyId_admissionNo_key" ON "SchoolStudent"("companyId", "admissionNo");

-- CreateIndex
CREATE INDEX "SchoolGuardian_companyId_phone_idx" ON "SchoolGuardian"("companyId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolGuardian_companyId_guardianNo_key" ON "SchoolGuardian"("companyId", "guardianNo");

-- CreateIndex
CREATE INDEX "SchoolStudentGuardian_companyId_guardianId_idx" ON "SchoolStudentGuardian"("companyId", "guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStudentGuardian_companyId_studentId_guardianId_key" ON "SchoolStudentGuardian"("companyId", "studentId", "guardianId");

-- CreateIndex
CREATE INDEX "SchoolEnrollment_companyId_status_idx" ON "SchoolEnrollment"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolEnrollment_companyId_studentId_termId_key" ON "SchoolEnrollment"("companyId", "studentId", "termId");

-- CreateIndex
CREATE INDEX "SchoolHostel_companyId_isActive_idx" ON "SchoolHostel"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolHostel_companyId_code_key" ON "SchoolHostel"("companyId", "code");

-- CreateIndex
CREATE INDEX "SchoolHostelRoom_companyId_isActive_idx" ON "SchoolHostelRoom"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolHostelRoom_companyId_hostelId_code_key" ON "SchoolHostelRoom"("companyId", "hostelId", "code");

-- CreateIndex
CREATE INDEX "SchoolHostelBed_companyId_isActive_idx" ON "SchoolHostelBed"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolHostelBed_companyId_roomId_code_key" ON "SchoolHostelBed"("companyId", "roomId", "code");

-- CreateIndex
CREATE INDEX "SchoolBoardingAllocation_companyId_status_idx" ON "SchoolBoardingAllocation"("companyId", "status");

-- CreateIndex
CREATE INDEX "SchoolBoardingAllocation_studentId_termId_idx" ON "SchoolBoardingAllocation"("studentId", "termId");

-- CreateIndex
CREATE INDEX "SchoolLeaveRequest_companyId_status_startDateTime_idx" ON "SchoolLeaveRequest"("companyId", "status", "startDateTime");

-- CreateIndex
CREATE INDEX "SchoolLeaveRequest_companyId_studentId_createdAt_idx" ON "SchoolLeaveRequest"("companyId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolLeaveRequest_companyId_allocationId_status_idx" ON "SchoolLeaveRequest"("companyId", "allocationId", "status");

-- CreateIndex
CREATE INDEX "SchoolBoardingMovementLog_companyId_leaveRequestId_recorded_idx" ON "SchoolBoardingMovementLog"("companyId", "leaveRequestId", "recordedAt");

-- CreateIndex
CREATE INDEX "SchoolBoardingMovementLog_companyId_studentId_recordedAt_idx" ON "SchoolBoardingMovementLog"("companyId", "studentId", "recordedAt");

-- CreateIndex
CREATE INDEX "SchoolResultSheet_companyId_status_idx" ON "SchoolResultSheet"("companyId", "status");

-- CreateIndex
CREATE INDEX "SchoolResultSheet_termId_classId_idx" ON "SchoolResultSheet"("termId", "classId");

-- CreateIndex
CREATE INDEX "SchoolResultModerationAction_companyId_sheetId_actedAt_idx" ON "SchoolResultModerationAction"("companyId", "sheetId", "actedAt");

-- CreateIndex
CREATE INDEX "SchoolResultModerationAction_companyId_actorUserId_idx" ON "SchoolResultModerationAction"("companyId", "actorUserId");

-- CreateIndex
CREATE INDEX "SchoolPublishWindow_companyId_termId_status_openAt_closeAt_idx" ON "SchoolPublishWindow"("companyId", "termId", "status", "openAt", "closeAt");

-- CreateIndex
CREATE INDEX "SchoolPublishWindow_companyId_classId_streamId_idx" ON "SchoolPublishWindow"("companyId", "classId", "streamId");

-- CreateIndex
CREATE INDEX "SchoolResultLine_companyId_studentId_idx" ON "SchoolResultLine"("companyId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolResultLine_companyId_sheetId_studentId_subjectCode_key" ON "SchoolResultLine"("companyId", "sheetId", "studentId", "subjectCode");

-- CreateIndex
CREATE INDEX "SchoolFeeStructure_companyId_status_idx" ON "SchoolFeeStructure"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolFeeStructure_companyId_termId_classId_name_key" ON "SchoolFeeStructure"("companyId", "termId", "classId", "name");

-- CreateIndex
CREATE INDEX "SchoolFeeStructureLine_companyId_feeCode_idx" ON "SchoolFeeStructureLine"("companyId", "feeCode");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolFeeStructureLine_companyId_feeStructureId_feeCode_key" ON "SchoolFeeStructureLine"("companyId", "feeStructureId", "feeCode");

-- CreateIndex
CREATE INDEX "SchoolFeeInvoice_companyId_status_idx" ON "SchoolFeeInvoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "SchoolFeeInvoice_studentId_termId_idx" ON "SchoolFeeInvoice"("studentId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolFeeInvoice_companyId_invoiceNo_key" ON "SchoolFeeInvoice"("companyId", "invoiceNo");

-- CreateIndex
CREATE INDEX "SchoolFeeInvoiceLine_companyId_feeCode_idx" ON "SchoolFeeInvoiceLine"("companyId", "feeCode");

-- CreateIndex
CREATE INDEX "SchoolFeeInvoiceLine_invoiceId_idx" ON "SchoolFeeInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "SchoolFeeReceipt_companyId_status_idx" ON "SchoolFeeReceipt"("companyId", "status");

-- CreateIndex
CREATE INDEX "SchoolFeeReceipt_studentId_receiptDate_idx" ON "SchoolFeeReceipt"("studentId", "receiptDate");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolFeeReceipt_companyId_receiptNo_key" ON "SchoolFeeReceipt"("companyId", "receiptNo");

-- CreateIndex
CREATE INDEX "SchoolFeeReceiptAllocation_invoiceId_idx" ON "SchoolFeeReceiptAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolFeeReceiptAllocation_companyId_receiptId_invoiceId_key" ON "SchoolFeeReceiptAllocation"("companyId", "receiptId", "invoiceId");

-- CreateIndex
CREATE INDEX "SchoolFeeWaiver_companyId_status_idx" ON "SchoolFeeWaiver"("companyId", "status");

-- CreateIndex
CREATE INDEX "SchoolFeeWaiver_studentId_termId_idx" ON "SchoolFeeWaiver"("studentId", "termId");

-- CreateIndex
CREATE INDEX "SchoolAttendanceSession_companyId_attendanceDate_idx" ON "SchoolAttendanceSession"("companyId", "attendanceDate");

-- CreateIndex
CREATE INDEX "SchoolAttendanceSession_companyId_termId_classId_streamId_idx" ON "SchoolAttendanceSession"("companyId", "termId", "classId", "streamId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAttendanceSession_companyId_termId_classId_streamId_a_key" ON "SchoolAttendanceSession"("companyId", "termId", "classId", "streamId", "attendanceDate");

-- CreateIndex
CREATE INDEX "SchoolAttendanceSessionLine_companyId_studentId_idx" ON "SchoolAttendanceSessionLine"("companyId", "studentId");

-- CreateIndex
CREATE INDEX "SchoolAttendanceSessionLine_companyId_sessionId_idx" ON "SchoolAttendanceSessionLine"("companyId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAttendanceSessionLine_sessionId_studentId_key" ON "SchoolAttendanceSessionLine"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "CarSalesLead_companyId_status_createdAt_idx" ON "CarSalesLead"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CarSalesLead_companyId_assignedToId_idx" ON "CarSalesLead"("companyId", "assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "CarSalesLead_companyId_leadNo_key" ON "CarSalesLead"("companyId", "leadNo");

-- CreateIndex
CREATE INDEX "CarSalesVehicle_companyId_status_updatedAt_idx" ON "CarSalesVehicle"("companyId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CarSalesVehicle_companyId_stockNo_key" ON "CarSalesVehicle"("companyId", "stockNo");

-- CreateIndex
CREATE UNIQUE INDEX "CarSalesVehicle_companyId_vin_key" ON "CarSalesVehicle"("companyId", "vin");

-- CreateIndex
CREATE INDEX "CarSalesDeal_companyId_status_updatedAt_idx" ON "CarSalesDeal"("companyId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CarSalesDeal_companyId_vehicleId_status_idx" ON "CarSalesDeal"("companyId", "vehicleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CarSalesDeal_companyId_dealNo_key" ON "CarSalesDeal"("companyId", "dealNo");

-- CreateIndex
CREATE INDEX "CarSalesPayment_companyId_paymentDate_idx" ON "CarSalesPayment"("companyId", "paymentDate");

-- CreateIndex
CREATE INDEX "CarSalesPayment_companyId_dealId_status_idx" ON "CarSalesPayment"("companyId", "dealId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CarSalesPayment_companyId_paymentNo_key" ON "CarSalesPayment"("companyId", "paymentNo");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "NVR_siteId_idx" ON "NVR"("siteId");

-- CreateIndex
CREATE INDEX "NVR_ipAddress_idx" ON "NVR"("ipAddress");

-- CreateIndex
CREATE INDEX "Camera_siteId_idx" ON "Camera"("siteId");

-- CreateIndex
CREATE INDEX "Camera_nvrId_idx" ON "Camera"("nvrId");

-- CreateIndex
CREATE INDEX "Camera_area_idx" ON "Camera"("area");

-- CreateIndex
CREATE UNIQUE INDEX "Camera_nvrId_channelNumber_key" ON "Camera"("nvrId", "channelNumber");

-- CreateIndex
CREATE INDEX "CCTVEvent_eventTime_idx" ON "CCTVEvent"("eventTime");

-- CreateIndex
CREATE INDEX "CCTVEvent_cameraId_idx" ON "CCTVEvent"("cameraId");

-- CreateIndex
CREATE INDEX "CCTVEvent_eventType_idx" ON "CCTVEvent"("eventType");

-- CreateIndex
CREATE INDEX "CCTVEvent_isAcknowledged_idx" ON "CCTVEvent"("isAcknowledged");

-- CreateIndex
CREATE INDEX "StreamSession_cameraId_status_idx" ON "StreamSession"("cameraId", "status");

-- CreateIndex
CREATE INDEX "StreamSession_siteId_startedAt_idx" ON "StreamSession"("siteId", "startedAt");

-- CreateIndex
CREATE INDEX "StreamSession_userId_startedAt_idx" ON "StreamSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "PlaybackRecord_cameraId_idx" ON "PlaybackRecord"("cameraId");

-- CreateIndex
CREATE INDEX "PlaybackRecord_startTime_endTime_idx" ON "PlaybackRecord"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "CameraAccessLog_cameraId_idx" ON "CameraAccessLog"("cameraId");

-- CreateIndex
CREATE INDEX "CameraAccessLog_userId_idx" ON "CameraAccessLog"("userId");

-- CreateIndex
CREATE INDEX "CameraAccessLog_startTime_idx" ON "CameraAccessLog"("startTime");

-- AddForeignKey
ALTER TABLE "IdSequence" ADD CONSTRAINT "IdSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFeatureFlag" ADD CONSTRAINT "CompanyFeatureFlag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFeatureFlag" ADD CONSTRAINT "CompanyFeatureFlag_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "PlatformFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeatureFlag" ADD CONSTRAINT "UserFeatureFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeatureFlag" ADD CONSTRAINT "UserFeatureFlag_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "PlatformFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureBundleItem" ADD CONSTRAINT "FeatureBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "FeatureBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureBundleItem" ADD CONSTRAINT "FeatureBundleItem_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "PlatformFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySubscriptionAddon" ADD CONSTRAINT "CompanySubscriptionAddon_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySubscriptionAddon" ADD CONSTRAINT "CompanySubscriptionAddon_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "FeatureBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningEvent" ADD CONSTRAINT "ProvisioningEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubdomainReservation" ADD CONSTRAINT "SubdomainReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBranding" ADD CONSTRAINT "CompanyBranding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDomain" ADD CONSTRAINT "CompanyDomain_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAccessRequest" ADD CONSTRAINT "SupportAccessRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunbookDefinition" ADD CONSTRAINT "RunbookDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunbookExecution" ADD CONSTRAINT "RunbookExecution_runbookId_fkey" FOREIGN KEY ("runbookId") REFERENCES "RunbookDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunbookExecution" ADD CONSTRAINT "RunbookExecution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSloMetricSnapshot" ADD CONSTRAINT "TenantSloMetricSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthIncident" ADD CONSTRAINT "HealthIncident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractEnforcementEvent" ADD CONSTRAINT "ContractEnforcementEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAuditEvent" ADD CONSTRAINT "PlatformAuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "JobGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeModuleAssignment" ADD CONSTRAINT "EmployeeModuleAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeModuleAssignment" ADD CONSTRAINT "EmployeeModuleAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedSalary" ADD CONSTRAINT "FixedSalary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_payrollLineItemId_fkey" FOREIGN KEY ("payrollLineItemId") REFERENCES "PayrollLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_disbursementBatchId_fkey" FOREIGN KEY ("disbursementBatchId") REFERENCES "DisbursementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_disbursementItemId_fkey" FOREIGN KEY ("disbursementItemId") REFERENCES "DisbursementItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_goldShiftAllocationId_fkey" FOREIGN KEY ("goldShiftAllocationId") REFERENCES "GoldShiftAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePayment" ADD CONSTRAINT "EmployeePayment_irregularPayoutBatchId_fkey" FOREIGN KEY ("irregularPayoutBatchId") REFERENCES "IrregularPayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobGrade" ADD CONSTRAINT "JobGrade_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationProfile" ADD CONSTRAINT "CompensationProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationProfile" ADD CONSTRAINT "CompensationProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationProfile" ADD CONSTRAINT "CompensationProfile_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationProfile" ADD CONSTRAINT "CompensationProfile_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "JobGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationRule" ADD CONSTRAINT "CompensationRule_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationTemplate" ADD CONSTRAINT "CompensationTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationTemplate" ADD CONSTRAINT "CompensationTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationTemplateRule" ADD CONSTRAINT "CompensationTemplateRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CompensationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationTemplateRule" ADD CONSTRAINT "CompensationTemplateRule_compensationRuleId_fkey" FOREIGN KEY ("compensationRuleId") REFERENCES "CompensationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_compensationProfileId_fkey" FOREIGN KEY ("compensationProfileId") REFERENCES "CompensationProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineComponent" ADD CONSTRAINT "PayrollLineComponent_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "PayrollLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineComponent" ADD CONSTRAINT "PayrollLineComponent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CompensationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementBatch" ADD CONSTRAINT "DisbursementBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementBatch" ADD CONSTRAINT "DisbursementBatch_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementBatch" ADD CONSTRAINT "DisbursementBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementBatch" ADD CONSTRAINT "DisbursementBatch_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementBatch" ADD CONSTRAINT "DisbursementBatch_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementItem" ADD CONSTRAINT "DisbursementItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DisbursementBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementItem" ADD CONSTRAINT "DisbursementItem_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "PayrollLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementItem" ADD CONSTRAINT "DisbursementItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjustmentEntry" ADD CONSTRAINT "AdjustmentEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjustmentEntry" ADD CONSTRAINT "AdjustmentEntry_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjustmentEntry" ADD CONSTRAINT "AdjustmentEntry_disbursementBatchId_fkey" FOREIGN KEY ("disbursementBatchId") REFERENCES "DisbursementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjustmentEntry" ADD CONSTRAINT "AdjustmentEntry_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "PayrollLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjustmentEntry" ADD CONSTRAINT "AdjustmentEntry_disbursementItemId_fkey" FOREIGN KEY ("disbursementItemId") REFERENCES "DisbursementItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjustmentEntry" ADD CONSTRAINT "AdjustmentEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjustmentEntry" ADD CONSTRAINT "AdjustmentEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjustmentEntry" ADD CONSTRAINT "AdjustmentEntry_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjustmentEntry" ADD CONSTRAINT "AdjustmentEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IrregularPayoutBatch" ADD CONSTRAINT "IrregularPayoutBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IrregularPayoutBatch" ADD CONSTRAINT "IrregularPayoutBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IrregularPayoutBatch" ADD CONSTRAINT "IrregularPayoutBatch_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IrregularPayoutBatch" ADD CONSTRAINT "IrregularPayoutBatch_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IrregularPayoutBatchItem" ADD CONSTRAINT "IrregularPayoutBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IrregularPayoutBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IrregularPayoutBatchItem" ADD CONSTRAINT "IrregularPayoutBatchItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_shiftGroupId_fkey" FOREIGN KEY ("shiftGroupId") REFERENCES "ShiftGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_groupLeaderId_fkey" FOREIGN KEY ("groupLeaderId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeCode" ADD CONSTRAINT "DowntimeCode_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_plantReportId_fkey" FOREIGN KEY ("plantReportId") REFERENCES "PlantReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DowntimeEvent" ADD CONSTRAINT "DowntimeEvent_downtimeCodeId_fkey" FOREIGN KEY ("downtimeCodeId") REFERENCES "DowntimeCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_shiftGroupId_fkey" FOREIGN KEY ("shiftGroupId") REFERENCES "ShiftGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftGroup" ADD CONSTRAINT "ShiftGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftGroup" ADD CONSTRAINT "ShiftGroup_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftGroup" ADD CONSTRAINT "ShiftGroup_leaderEmployeeId_fkey" FOREIGN KEY ("leaderEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftGroupMember" ADD CONSTRAINT "ShiftGroupMember_shiftGroupId_fkey" FOREIGN KEY ("shiftGroupId") REFERENCES "ShiftGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftGroupMember" ADD CONSTRAINT "ShiftGroupMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftGroupSchedule" ADD CONSTRAINT "ShiftGroupSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftGroupSchedule" ADD CONSTRAINT "ShiftGroupSchedule_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftGroupSchedule" ADD CONSTRAINT "ShiftGroupSchedule_shiftGroupId_fkey" FOREIGN KEY ("shiftGroupId") REFERENCES "ShiftGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftGroupSchedule" ADD CONSTRAINT "ShiftGroupSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantReport" ADD CONSTRAINT "PlantReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantReport" ADD CONSTRAINT "PlantReport_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPrice" ADD CONSTRAINT "GoldPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldExpenseType" ADD CONSTRAINT "GoldExpenseType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPour" ADD CONSTRAINT "GoldPour_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPour" ADD CONSTRAINT "GoldPour_witness1Id_fkey" FOREIGN KEY ("witness1Id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPour" ADD CONSTRAINT "GoldPour_witness2Id_fkey" FOREIGN KEY ("witness2Id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPour" ADD CONSTRAINT "GoldPour_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPour" ADD CONSTRAINT "GoldPour_goldShiftAllocationId_fkey" FOREIGN KEY ("goldShiftAllocationId") REFERENCES "GoldShiftAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPurchase" ADD CONSTRAINT "GoldPurchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPurchase" ADD CONSTRAINT "GoldPurchase_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPurchase" ADD CONSTRAINT "GoldPurchase_goldPourId_fkey" FOREIGN KEY ("goldPourId") REFERENCES "GoldPour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPurchase" ADD CONSTRAINT "GoldPurchase_sellerEmployeeId_fkey" FOREIGN KEY ("sellerEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPurchase" ADD CONSTRAINT "GoldPurchase_receiver1Id_fkey" FOREIGN KEY ("receiver1Id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPurchase" ADD CONSTRAINT "GoldPurchase_receiver2Id_fkey" FOREIGN KEY ("receiver2Id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldPurchase" ADD CONSTRAINT "GoldPurchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldDispatch" ADD CONSTRAINT "GoldDispatch_goldPourId_fkey" FOREIGN KEY ("goldPourId") REFERENCES "GoldPour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldDispatch" ADD CONSTRAINT "GoldDispatch_handedOverById_fkey" FOREIGN KEY ("handedOverById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldDispatchBatch" ADD CONSTRAINT "GoldDispatchBatch_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "GoldDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldDispatchBatch" ADD CONSTRAINT "GoldDispatchBatch_goldPourId_fkey" FOREIGN KEY ("goldPourId") REFERENCES "GoldPour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerReceipt" ADD CONSTRAINT "BuyerReceipt_goldDispatchId_fkey" FOREIGN KEY ("goldDispatchId") REFERENCES "GoldDispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerReceipt" ADD CONSTRAINT "BuyerReceipt_goldPourId_fkey" FOREIGN KEY ("goldPourId") REFERENCES "GoldPour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerReceiptBatch" ADD CONSTRAINT "BuyerReceiptBatch_buyerReceiptId_fkey" FOREIGN KEY ("buyerReceiptId") REFERENCES "BuyerReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerReceiptBatch" ADD CONSTRAINT "BuyerReceiptBatch_goldPourId_fkey" FOREIGN KEY ("goldPourId") REFERENCES "GoldPour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerReceiptDispatch" ADD CONSTRAINT "BuyerReceiptDispatch_buyerReceiptId_fkey" FOREIGN KEY ("buyerReceiptId") REFERENCES "BuyerReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerReceiptDispatch" ADD CONSTRAINT "BuyerReceiptDispatch_goldDispatchId_fkey" FOREIGN KEY ("goldDispatchId") REFERENCES "GoldDispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldShiftAllocation" ADD CONSTRAINT "GoldShiftAllocation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldShiftAllocation" ADD CONSTRAINT "GoldShiftAllocation_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldShiftAllocation" ADD CONSTRAINT "GoldShiftAllocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldShiftAllocation" ADD CONSTRAINT "GoldShiftAllocation_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldShiftAllocation" ADD CONSTRAINT "GoldShiftAllocation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldShiftExpense" ADD CONSTRAINT "GoldShiftExpense_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "GoldShiftAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldShiftWorkerShare" ADD CONSTRAINT "GoldShiftWorkerShare_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "GoldShiftAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldShiftWorkerShare" ADD CONSTRAINT "GoldShiftWorkerShare_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldInventoryEvent" ADD CONSTRAINT "GoldInventoryEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldInventoryEvent" ADD CONSTRAINT "GoldInventoryEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldInventoryEvent" ADD CONSTRAINT "GoldInventoryEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldException" ADD CONSTRAINT "GoldException_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldException" ADD CONSTRAINT "GoldException_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldException" ADD CONSTRAINT "GoldException_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldException" ADD CONSTRAINT "GoldException_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldException" ADD CONSTRAINT "GoldException_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLedgerImport" ADD CONSTRAINT "GoldLedgerImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLedgerImport" ADD CONSTRAINT "GoldLedgerImport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLedgerImport" ADD CONSTRAINT "GoldLedgerImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLedgerEntry" ADD CONSTRAINT "GoldLedgerEntry_importId_fkey" FOREIGN KEY ("importId") REFERENCES "GoldLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldLedgerEntry" ADD CONSTRAINT "GoldLedgerEntry_mappedShiftGroupId_fkey" FOREIGN KEY ("mappedShiftGroupId") REFERENCES "ShiftGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMaterial" ADD CONSTRAINT "ScrapMaterial_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapSellerProfile" ADD CONSTRAINT "ScrapSellerProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPrice" ADD CONSTRAINT "ScrapMetalPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPrice" ADD CONSTRAINT "ScrapMetalPrice_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "ScrapMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalEmployeeBalance" ADD CONSTRAINT "ScrapMetalEmployeeBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalEmployeeBalance" ADD CONSTRAINT "ScrapMetalEmployeeBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalBalanceEntry" ADD CONSTRAINT "ScrapMetalBalanceEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalBalanceEntry" ADD CONSTRAINT "ScrapMetalBalanceEntry_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "ScrapMetalEmployeeBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalBalanceEntry" ADD CONSTRAINT "ScrapMetalBalanceEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalBalanceEntry" ADD CONSTRAINT "ScrapMetalBalanceEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPurchase" ADD CONSTRAINT "ScrapMetalPurchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPurchase" ADD CONSTRAINT "ScrapMetalPurchase_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPurchase" ADD CONSTRAINT "ScrapMetalPurchase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPurchase" ADD CONSTRAINT "ScrapMetalPurchase_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "ScrapMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPurchase" ADD CONSTRAINT "ScrapMetalPurchase_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "ScrapSellerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPurchase" ADD CONSTRAINT "ScrapMetalPurchase_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPurchase" ADD CONSTRAINT "ScrapMetalPurchase_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPurchase" ADD CONSTRAINT "ScrapMetalPurchase_purchasePaymentId_fkey" FOREIGN KEY ("purchasePaymentId") REFERENCES "PurchasePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalPurchase" ADD CONSTRAINT "ScrapMetalPurchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalBatch" ADD CONSTRAINT "ScrapMetalBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalBatch" ADD CONSTRAINT "ScrapMetalBatch_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalBatch" ADD CONSTRAINT "ScrapMetalBatch_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "ScrapMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalBatch" ADD CONSTRAINT "ScrapMetalBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalBatchItem" ADD CONSTRAINT "ScrapMetalBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScrapMetalBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalBatchItem" ADD CONSTRAINT "ScrapMetalBatchItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "ScrapMetalPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalSale" ADD CONSTRAINT "ScrapMetalSale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalSale" ADD CONSTRAINT "ScrapMetalSale_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalSale" ADD CONSTRAINT "ScrapMetalSale_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScrapMetalBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalSale" ADD CONSTRAINT "ScrapMetalSale_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "ScrapMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalSale" ADD CONSTRAINT "ScrapMetalSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalSale" ADD CONSTRAINT "ScrapMetalSale_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalSale" ADD CONSTRAINT "ScrapMetalSale_salesReceiptId_fkey" FOREIGN KEY ("salesReceiptId") REFERENCES "SalesReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalSale" ADD CONSTRAINT "ScrapMetalSale_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapMetalSale" ADD CONSTRAINT "ScrapMetalSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapTicketComplianceRule" ADD CONSTRAINT "ScrapTicketComplianceRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapTicketComplianceRule" ADD CONSTRAINT "ScrapTicketComplianceRule_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "ScrapMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapTicketComplianceRule" ADD CONSTRAINT "ScrapTicketComplianceRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPurchaseOrderLine" ADD CONSTRAINT "RetailPurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "RetailPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailGoodsReceiptLine" ADD CONSTRAINT "RetailGoodsReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "RetailGoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSaleLine" ADD CONSTRAINT "RetailSaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSalePayment" ADD CONSTRAINT "RetailSalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_defaultTaxCodeId_fkey" FOREIGN KEY ("defaultTaxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSettings" ADD CONSTRAINT "AccountingSettings_defaultBankAccountId_fkey" FOREIGN KEY ("defaultBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_periodOverrideById_fkey" FOREIGN KEY ("periodOverrideById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfEntryId_fkey" FOREIGN KEY ("reversalOfEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingIntegrationEvent" ADD CONSTRAINT "AccountingIntegrationEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingRule" ADD CONSTRAINT "PostingRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingRule" ADD CONSTRAINT "PostingRule_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingRuleLine" ADD CONSTRAINT "PostingRuleLine_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PostingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingRuleLine" ADD CONSTRAINT "PostingRuleLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingRuleLine" ADD CONSTRAINT "PostingRuleLine_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingRuleLine" ADD CONSTRAINT "PostingRuleLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingRuleCondition" ADD CONSTRAINT "PostingRuleCondition_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PostingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCode" ADD CONSTRAINT "TaxCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCategory" ADD CONSTRAINT "TaxCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxTemplate" ADD CONSTRAINT "TaxTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxTemplateLine" ADD CONSTRAINT "TaxTemplateLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaxTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxTemplateLine" ADD CONSTRAINT "TaxTemplateLine_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "TaxCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaxTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyDefinition" ADD CONSTRAINT "CurrencyDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "TaxCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "TaxCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SalesQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReceipt" ADD CONSTRAINT "SalesReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReceipt" ADD CONSTRAINT "SalesReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReceipt" ADD CONSTRAINT "SalesReceipt_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReceipt" ADD CONSTRAINT "SalesReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteLine" ADD CONSTRAINT "CreditNoteLine_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteLine" ADD CONSTRAINT "CreditNoteLine_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesWriteOff" ADD CONSTRAINT "SalesWriteOff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesWriteOff" ADD CONSTRAINT "SalesWriteOff_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesWriteOff" ADD CONSTRAINT "SalesWriteOff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNoteLine" ADD CONSTRAINT "DebitNoteLine_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "DebitNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNoteLine" ADD CONSTRAINT "DebitNoteLine_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseWriteOff" ADD CONSTRAINT "PurchaseWriteOff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseWriteOff" ADD CONSTRAINT "PurchaseWriteOff_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseWriteOff" ADD CONSTRAINT "PurchaseWriteOff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLedgerEntry" ADD CONSTRAINT "PaymentLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderAccountMapping" ADD CONSTRAINT "TenderAccountMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderAccountMapping" ADD CONSTRAINT "TenderAccountMapping_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderAccountMapping" ADD CONSTRAINT "TenderAccountMapping_clearingAccountId_fkey" FOREIGN KEY ("clearingAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderAccountMapping" ADD CONSTRAINT "TenderAccountMapping_offsetAccountId_fkey" FOREIGN KEY ("offsetAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_matchedTransactionId_fkey" FOREIGN KEY ("matchedTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatReturnSummary" ADD CONSTRAINT "VatReturnSummary_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatReturnSummary" ADD CONSTRAINT "VatReturnSummary_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatReturn" ADD CONSTRAINT "VatReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatReturnLine" ADD CONSTRAINT "VatReturnLine_vatReturnId_fkey" FOREIGN KEY ("vatReturnId") REFERENCES "VatReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceImport" ADD CONSTRAINT "OpeningBalanceImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodCloseVoucher" ADD CONSTRAINT "PeriodCloseVoucher_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodCloseVoucher" ADD CONSTRAINT "PeriodCloseVoucher_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodCloseVoucher" ADD CONSTRAINT "PeriodCloseVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodCloseVoucher" ADD CONSTRAINT "PeriodCloseVoucher_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSeedExecution" ADD CONSTRAINT "AccountingSeedExecution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyRate" ADD CONSTRAINT "CurrencyRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalisationProviderConfig" ADD CONSTRAINT "FiscalisationProviderConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplateVersion" ADD CONSTRAINT "DocumentTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRenderJob" ADD CONSTRAINT "DocumentRenderJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRenderJob" ADD CONSTRAINT "DocumentRenderJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRenderJob" ADD CONSTRAINT "DocumentRenderJob_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "DocumentTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DocumentRenderJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArtifact" ADD CONSTRAINT "DocumentArtifact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrIncident" ADD CONSTRAINT "HrIncident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrIncident" ADD CONSTRAINT "HrIncident_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrIncident" ADD CONSTRAINT "HrIncident_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrIncident" ADD CONSTRAINT "HrIncident_sourceIncidentId_fkey" FOREIGN KEY ("sourceIncidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrIncident" ADD CONSTRAINT "HrIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrIncident" ADD CONSTRAINT "HrIncident_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "HrIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicYear" ADD CONSTRAINT "SchoolAcademicYear_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTerm" ADD CONSTRAINT "SchoolTerm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTerm" ADD CONSTRAINT "SchoolTerm_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStream" ADD CONSTRAINT "SchoolStream_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStream" ADD CONSTRAINT "SchoolStream_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStream" ADD CONSTRAINT "SchoolStream_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTeacherProfile" ADD CONSTRAINT "SchoolTeacherProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTeacherProfile" ADD CONSTRAINT "SchoolTeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSubject" ADD CONSTRAINT "SchoolSubject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClassSubject" ADD CONSTRAINT "SchoolClassSubject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClassSubject" ADD CONSTRAINT "SchoolClassSubject_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClassSubject" ADD CONSTRAINT "SchoolClassSubject_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClassSubject" ADD CONSTRAINT "SchoolClassSubject_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "SchoolStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClassSubject" ADD CONSTRAINT "SchoolClassSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClassSubject" ADD CONSTRAINT "SchoolClassSubject_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "SchoolTeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudent" ADD CONSTRAINT "SchoolStudent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudent" ADD CONSTRAINT "SchoolStudent_currentClassId_fkey" FOREIGN KEY ("currentClassId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudent" ADD CONSTRAINT "SchoolStudent_currentStreamId_fkey" FOREIGN KEY ("currentStreamId") REFERENCES "SchoolStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolGuardian" ADD CONSTRAINT "SchoolGuardian_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudentGuardian" ADD CONSTRAINT "SchoolStudentGuardian_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudentGuardian" ADD CONSTRAINT "SchoolStudentGuardian_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudentGuardian" ADD CONSTRAINT "SchoolStudentGuardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "SchoolGuardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolEnrollment" ADD CONSTRAINT "SchoolEnrollment_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "SchoolStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolHostel" ADD CONSTRAINT "SchoolHostel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolHostelRoom" ADD CONSTRAINT "SchoolHostelRoom_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolHostelRoom" ADD CONSTRAINT "SchoolHostelRoom_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "SchoolHostel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolHostelBed" ADD CONSTRAINT "SchoolHostelBed_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolHostelBed" ADD CONSTRAINT "SchoolHostelBed_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "SchoolHostel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolHostelBed" ADD CONSTRAINT "SchoolHostelBed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "SchoolHostelRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBoardingAllocation" ADD CONSTRAINT "SchoolBoardingAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBoardingAllocation" ADD CONSTRAINT "SchoolBoardingAllocation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBoardingAllocation" ADD CONSTRAINT "SchoolBoardingAllocation_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBoardingAllocation" ADD CONSTRAINT "SchoolBoardingAllocation_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "SchoolHostel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBoardingAllocation" ADD CONSTRAINT "SchoolBoardingAllocation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "SchoolHostelRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBoardingAllocation" ADD CONSTRAINT "SchoolBoardingAllocation_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "SchoolHostelBed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaveRequest" ADD CONSTRAINT "SchoolLeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaveRequest" ADD CONSTRAINT "SchoolLeaveRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaveRequest" ADD CONSTRAINT "SchoolLeaveRequest_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "SchoolBoardingAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaveRequest" ADD CONSTRAINT "SchoolLeaveRequest_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaveRequest" ADD CONSTRAINT "SchoolLeaveRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaveRequest" ADD CONSTRAINT "SchoolLeaveRequest_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaveRequest" ADD CONSTRAINT "SchoolLeaveRequest_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaveRequest" ADD CONSTRAINT "SchoolLeaveRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBoardingMovementLog" ADD CONSTRAINT "SchoolBoardingMovementLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBoardingMovementLog" ADD CONSTRAINT "SchoolBoardingMovementLog_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "SchoolLeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBoardingMovementLog" ADD CONSTRAINT "SchoolBoardingMovementLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBoardingMovementLog" ADD CONSTRAINT "SchoolBoardingMovementLog_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResultSheet" ADD CONSTRAINT "SchoolResultSheet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResultSheet" ADD CONSTRAINT "SchoolResultSheet_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResultSheet" ADD CONSTRAINT "SchoolResultSheet_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResultSheet" ADD CONSTRAINT "SchoolResultSheet_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "SchoolStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResultModerationAction" ADD CONSTRAINT "SchoolResultModerationAction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResultModerationAction" ADD CONSTRAINT "SchoolResultModerationAction_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "SchoolResultSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResultModerationAction" ADD CONSTRAINT "SchoolResultModerationAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPublishWindow" ADD CONSTRAINT "SchoolPublishWindow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPublishWindow" ADD CONSTRAINT "SchoolPublishWindow_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPublishWindow" ADD CONSTRAINT "SchoolPublishWindow_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPublishWindow" ADD CONSTRAINT "SchoolPublishWindow_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "SchoolStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResultLine" ADD CONSTRAINT "SchoolResultLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResultLine" ADD CONSTRAINT "SchoolResultLine_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "SchoolResultSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolResultLine" ADD CONSTRAINT "SchoolResultLine_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeStructure" ADD CONSTRAINT "SchoolFeeStructure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeStructure" ADD CONSTRAINT "SchoolFeeStructure_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeStructure" ADD CONSTRAINT "SchoolFeeStructure_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeStructureLine" ADD CONSTRAINT "SchoolFeeStructureLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeStructureLine" ADD CONSTRAINT "SchoolFeeStructureLine_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "SchoolFeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeInvoice" ADD CONSTRAINT "SchoolFeeInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeInvoice" ADD CONSTRAINT "SchoolFeeInvoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeInvoice" ADD CONSTRAINT "SchoolFeeInvoice_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeInvoice" ADD CONSTRAINT "SchoolFeeInvoice_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "SchoolFeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeInvoiceLine" ADD CONSTRAINT "SchoolFeeInvoiceLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeInvoiceLine" ADD CONSTRAINT "SchoolFeeInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SchoolFeeInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeReceipt" ADD CONSTRAINT "SchoolFeeReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeReceipt" ADD CONSTRAINT "SchoolFeeReceipt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeReceiptAllocation" ADD CONSTRAINT "SchoolFeeReceiptAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeReceiptAllocation" ADD CONSTRAINT "SchoolFeeReceiptAllocation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "SchoolFeeReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeReceiptAllocation" ADD CONSTRAINT "SchoolFeeReceiptAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SchoolFeeInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeWaiver" ADD CONSTRAINT "SchoolFeeWaiver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeWaiver" ADD CONSTRAINT "SchoolFeeWaiver_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeWaiver" ADD CONSTRAINT "SchoolFeeWaiver_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFeeWaiver" ADD CONSTRAINT "SchoolFeeWaiver_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SchoolFeeInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAttendanceSession" ADD CONSTRAINT "SchoolAttendanceSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAttendanceSessionLine" ADD CONSTRAINT "SchoolAttendanceSessionLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAttendanceSessionLine" ADD CONSTRAINT "SchoolAttendanceSessionLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SchoolAttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAttendanceSessionLine" ADD CONSTRAINT "SchoolAttendanceSessionLine_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSalesLead" ADD CONSTRAINT "CarSalesLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSalesLead" ADD CONSTRAINT "CarSalesLead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSalesVehicle" ADD CONSTRAINT "CarSalesVehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSalesDeal" ADD CONSTRAINT "CarSalesDeal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSalesDeal" ADD CONSTRAINT "CarSalesDeal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CarSalesLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSalesDeal" ADD CONSTRAINT "CarSalesDeal_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "CarSalesVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSalesDeal" ADD CONSTRAINT "CarSalesDeal_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSalesPayment" ADD CONSTRAINT "CarSalesPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSalesPayment" ADD CONSTRAINT "CarSalesPayment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CarSalesDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarSalesPayment" ADD CONSTRAINT "CarSalesPayment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NVR" ADD CONSTRAINT "NVR_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_nvrId_fkey" FOREIGN KEY ("nvrId") REFERENCES "NVR"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CCTVEvent" ADD CONSTRAINT "CCTVEvent_nvrId_fkey" FOREIGN KEY ("nvrId") REFERENCES "NVR"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CCTVEvent" ADD CONSTRAINT "CCTVEvent_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamSession" ADD CONSTRAINT "StreamSession_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamSession" ADD CONSTRAINT "StreamSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamSession" ADD CONSTRAINT "StreamSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackRecord" ADD CONSTRAINT "PlaybackRecord_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraAccessLog" ADD CONSTRAINT "CameraAccessLog_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

