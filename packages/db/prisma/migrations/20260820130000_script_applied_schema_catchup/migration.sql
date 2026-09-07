-- The migration history catches up with the scripts.
--
-- Retail's schema changes shipped as idempotent scripts under `scripts/` —
-- R-1.1 money, R-1.2 enums, R-1.3 companyId, R-1.5 currency, S-1 quantities,
-- S-4's drop, R-3.3's enum label, `clientRef` — because `prisma db push`
-- cannot reach the development database (P1001, pooler-only host) and a
-- measure-then-cast script refuses on overflow where a push fails halfway.
-- HR's tax tables, leave, settlements and the schools messaging surface
-- accumulated the same way.
--
-- The cost was that `prisma/migrations/` stopped describing the schema: a
-- database built from `migrate deploy` alone was ~1,600 lines short and the
-- till would have failed on its first sale. This file is that difference,
-- generated with `prisma migrate diff --from-migrations --to-schema` against
-- a scratch shadow database, then verified by re-running the same diff with
-- this file in place — the result is empty.
--
-- ── On a database the scripts have already built: NEVER run this ──────────
--
-- This file assumes the state the first 61 migrations produce. On a database
-- the scripts have provisioned, the tables it creates already exist and —
-- worse — its DROP COLUMN / ADD COLUMN pairs would destroy data (for one:
-- `Attendance.status` is dropped as TEXT and re-added as an enum, which on a
-- live table wipes the column). Such a database is baselined instead:
--
--     npx prisma migrate resolve --applied 20260820130000_script_applied_schema_catchup
--
-- which records it as done without executing it. The shared development
-- database was baselined this way on 2026-08-20; every database created from
-- migrations afterwards executes it for real.
--
-- The only edit to the generated SQL is `ADD VALUE IF NOT EXISTS` on the enum
-- labels, several of which (`RETAIL_SHIFT`, the settlement targets) already
-- exist wherever their scripts ran.

-- CreateEnum
CREATE TYPE "LeaveUnit" AS ENUM ('DAY', 'HALF_DAY', 'HOUR');

-- CreateEnum
CREATE TYPE "LeaveAccrualMethod" AS ENUM ('ANNUAL_GRANT', 'MONTHLY_ACCRUAL', 'ANNIVERSARY_GRANT', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SettlementSource" AS ENUM ('GOLD', 'SCRAP', 'COMMISSION', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementMode" AS ENUM ('CURRENT_PERIOD', 'NEXT_PERIOD');

-- CreateEnum
CREATE TYPE "StatutoryRateKey" AS ENUM ('AIDS_LEVY', 'NSSA_POBS_EMPLOYEE', 'NSSA_POBS_EMPLOYER', 'NSSA_APWCS', 'ZIMDEF', 'STANDARDS_DEVELOPMENT_LEVY', 'BONUS_EXEMPTION');

-- CreateEnum
CREATE TYPE "TaxCreditKey" AS ENUM ('MEDICAL_AID', 'ELDERLY', 'DISABILITY');

-- CreateEnum
CREATE TYPE "EmployeeTaxStatus" AS ENUM ('STANDARD', 'EXEMPT', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE', 'REST_DAY', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "RetailSaleStatus" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "RetailSaleType" AS ENUM ('SALE', 'REFUND', 'VOID');

-- CreateEnum
CREATE TYPE "RetailShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "RetailCashMovementType" AS ENUM ('DROP_TO_SAFE', 'FLOAT_TOP_UP', 'PAYOUT');

-- CreateEnum
CREATE TYPE "RetailCashMovementReason" AS ENUM ('CASH_LEVEL_TOO_HIGH', 'BANK_DEPOSIT', 'END_OF_SHIFT_SKIM', 'MANAGER_REQUEST', 'CHANGE_REQUIRED', 'SUPPLIER_PAYOUT', 'PETTY_CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "RetailHeldCartStatus" AS ENUM ('HELD', 'RECALLED', 'RELEASED');

-- CreateEnum
CREATE TYPE "RetailPurchaseOrderStatus" AS ENUM ('DRAFT', 'PARTIAL', 'RECEIVED');

-- CreateEnum
CREATE TYPE "RetailGoodsReceiptStatus" AS ENUM ('POSTED');

-- CreateEnum
CREATE TYPE "RetailPromotionType" AS ENUM ('PERCENT', 'AMOUNT', 'BUY_X_GET_Y', 'BUNDLE');

-- CreateEnum
CREATE TYPE "RetailPromotionStatus" AS ENUM ('ACTIVE', 'SCHEDULED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RetailTenderType" AS ENUM ('CASH', 'CARD', 'MOBILE_MONEY', 'TRANSFER', 'VOUCHER');

-- CreateEnum
CREATE TYPE "SchoolMessageSide" AS ENUM ('GUARDIAN', 'STAFF');

-- CreateEnum
CREATE TYPE "SchoolImportEntity" AS ENUM ('CLASS', 'STUDENT', 'GUARDIAN', 'FEE_STRUCTURE', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "SchoolImportJobStatus" AS ENUM ('MAPPING', 'PREVIEW', 'COMMITTED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "SchoolImportRowStatus" AS ENUM ('PENDING', 'CREATED', 'UPDATED', 'SKIPPED', 'ANOMALY', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'SETTLEMENT_INTAKE';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'SETTLEMENT_RUN';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'SETTLEMENT_BATCH';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'LEAVE_REQUEST';
ALTER TYPE "ApprovalTargetType" ADD VALUE IF NOT EXISTS 'RETAIL_SHIFT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CompensationCalcMethod" ADD VALUE IF NOT EXISTS 'TAX_TABLE';
ALTER TYPE "CompensationCalcMethod" ADD VALUE IF NOT EXISTS 'PERCENT_OF_COMPONENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CompensationRuleType" ADD VALUE IF NOT EXISTS 'STATUTORY_DEDUCTION';
ALTER TYPE "CompensationRuleType" ADD VALUE IF NOT EXISTS 'EMPLOYER_CONTRIBUTION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CrmFieldEntity" ADD VALUE IF NOT EXISTS 'STUDENT';
ALTER TYPE "CrmFieldEntity" ADD VALUE IF NOT EXISTS 'GUARDIAN';
ALTER TYPE "CrmFieldEntity" ADD VALUE IF NOT EXISTS 'TEACHER';
ALTER TYPE "CrmFieldEntity" ADD VALUE IF NOT EXISTS 'CLASS';
ALTER TYPE "CrmFieldEntity" ADD VALUE IF NOT EXISTS 'SUBJECT';
ALTER TYPE "CrmFieldEntity" ADD VALUE IF NOT EXISTS 'HOSTEL';
ALTER TYPE "CrmFieldEntity" ADD VALUE IF NOT EXISTS 'REP';

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationEntityType_new" AS ENUM ('PAYROLL_RUN', 'DISBURSEMENT_BATCH', 'ADJUSTMENT_ENTRY', 'COMPENSATION_PROFILE', 'COMPENSATION_RULE', 'GOLD_SHIFT_ALLOCATION', 'DISCIPLINARY_ACTION', 'HR_INCIDENT', 'INCIDENT', 'PERMIT', 'WORK_ORDER', 'CRM_LEAD', 'CRM_DOCUMENT', 'CRM_TASK', 'CRM_COMMENT');
ALTER TABLE "Notification" ALTER COLUMN "entityType" TYPE "NotificationEntityType_new" USING ("entityType"::text::"NotificationEntityType_new");
ALTER TYPE "NotificationEntityType" RENAME TO "NotificationEntityType_old";
ALTER TYPE "NotificationEntityType_new" RENAME TO "NotificationEntityType";
DROP TYPE "public"."NotificationEntityType_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SCHOOL_NOTICE_ALL';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SCHOOL_NOTICE_PARENTS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SCHOOL_NOTICE_STUDENTS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SCHOOL_NOTICE_TEACHERS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PostingBasis" ADD VALUE IF NOT EXISTS 'PAYE';
ALTER TYPE "PostingBasis" ADD VALUE IF NOT EXISTS 'AIDS_LEVY';
ALTER TYPE "PostingBasis" ADD VALUE IF NOT EXISTS 'NSSA_EMPLOYEE';
ALTER TYPE "PostingBasis" ADD VALUE IF NOT EXISTS 'NSSA_EMPLOYER';
ALTER TYPE "PostingBasis" ADD VALUE IF NOT EXISTS 'ZIMDEF';
ALTER TYPE "PostingBasis" ADD VALUE IF NOT EXISTS 'STANDARDS_DEVELOPMENT_LEVY';
ALTER TYPE "PostingBasis" ADD VALUE IF NOT EXISTS 'NEC_EMPLOYEE';
ALTER TYPE "PostingBasis" ADD VALUE IF NOT EXISTS 'NEC_EMPLOYER';
ALTER TYPE "PostingBasis" ADD VALUE IF NOT EXISTS 'OTHER_DEDUCTIONS';
ALTER TYPE "PostingBasis" ADD VALUE IF NOT EXISTS 'EMPLOYER_CONTRIBUTIONS';

-- AlterEnum
ALTER TYPE "PriceListKind" ADD VALUE IF NOT EXISTS 'RETAIL';

-- AlterEnum
ALTER TYPE "WorkspaceProfile" ADD VALUE IF NOT EXISTS 'PAYROLL';

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_siteId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeePayment" DROP CONSTRAINT "EmployeePayment_goldShiftAllocationId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeePayment" DROP CONSTRAINT "EmployeePayment_irregularPayoutBatchId_fkey";

-- DropForeignKey
ALTER TABLE "IrregularPayoutBatch" DROP CONSTRAINT "IrregularPayoutBatch_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "IrregularPayoutBatch" DROP CONSTRAINT "IrregularPayoutBatch_companyId_fkey";

-- DropForeignKey
ALTER TABLE "IrregularPayoutBatch" DROP CONSTRAINT "IrregularPayoutBatch_createdById_fkey";

-- DropForeignKey
ALTER TABLE "IrregularPayoutBatch" DROP CONSTRAINT "IrregularPayoutBatch_submittedById_fkey";

-- DropForeignKey
ALTER TABLE "IrregularPayoutBatchItem" DROP CONSTRAINT "IrregularPayoutBatchItem_batchId_fkey";

-- DropForeignKey
ALTER TABLE "IrregularPayoutBatchItem" DROP CONSTRAINT "IrregularPayoutBatchItem_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "RetailCatalogItem" DROP CONSTRAINT "RetailCatalogItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "ShiftGroup" DROP CONSTRAINT "ShiftGroup_siteId_fkey";

-- DropIndex
DROP INDEX "Attendance_date_siteId_shift_employeeId_key";

-- DropIndex
DROP INDEX "EmployeePayment_employeeId_payoutSource_idx";

-- DropIndex
DROP INDEX "EmployeePayment_employeeId_type_idx";

-- DropIndex
DROP INDEX "EmployeePayment_goldShiftAllocationId_idx";

-- DropIndex
DROP INDEX "EmployeePayment_irregularPayoutBatchId_idx";

-- DropIndex
DROP INDEX "PayrollPeriod_companyId_domain_payoutSource_scopeKey_startD_idx";

-- DropIndex
DROP INDEX "PayrollPeriod_companyId_domain_periodKey_scopeKey_key";

-- DropIndex
DROP INDEX "PayrollRun_companyId_status_domain_payoutSource_idx";

-- DropIndex
DROP INDEX "RetailSale_companyId_clientOperationId_key";

-- AlterTable
ALTER TABLE "AdjustmentEntry" ALTER COLUMN "amountDelta" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "companyId" TEXT NOT NULL,
ALTER COLUMN "siteId" DROP NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "AttendanceStatus" NOT NULL;

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "autoGenerateGoldPayoutPeriods",
DROP COLUMN "goldPayoutCycle",
DROP COLUMN "goldSettlementMode";

-- AlterTable
ALTER TABLE "CompensationProfile" ALTER COLUMN "baseAmount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "CompensationRule" ADD COLUMN     "basedOnKey" TEXT,
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "statutoryKey" TEXT,
ALTER COLUMN "value" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "cap" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "CrmComment" ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "subjectType" "CrmFieldEntity";

-- AlterTable
ALTER TABLE "CrmRecordFile" ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "subjectType" "CrmFieldEntity";

-- AlterTable
ALTER TABLE "CrmTask" ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "subjectType" "CrmFieldEntity";

-- AlterTable
ALTER TABLE "DisbursementBatch" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "DisbursementItem" ADD COLUMN     "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankBranchCode" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "hasDisability" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mobileMoneyNumber" TEXT,
ADD COLUMN     "mobileMoneyProvider" TEXT,
ADD COLUMN     "nssaNumber" TEXT,
ADD COLUMN     "overtimeHourlyRate" DECIMAL(14,4),
ADD COLUMN     "taxNumber" TEXT,
ADD COLUMN     "taxStatus" "EmployeeTaxStatus" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "EmployeePayment" DROP COLUMN "amountUsd",
DROP COLUMN "goldPriceUsdPerGram",
DROP COLUMN "goldShiftAllocationId",
DROP COLUMN "goldWeightGrams",
DROP COLUMN "irregularPayoutBatchId",
DROP COLUMN "paidAmountUsd",
DROP COLUMN "payoutSource",
DROP COLUMN "type",
DROP COLUMN "valuationDate",
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "InventoryItem" ALTER COLUMN "currentStock" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "minStock" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "maxStock" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "PayrollLineComponent" ADD COLUMN     "basis" DECIMAL(14,2),
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "statutoryKey" TEXT,
ALTER COLUMN "rateOrAmount" SET DATA TYPE DECIMAL(14,4),
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "PayrollLineItem" ADD COLUMN     "employerCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
ADD COLUMN     "netBaseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxableGross" DECIMAL(14,2) NOT NULL DEFAULT 0,
ALTER COLUMN "baseAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "variableAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "allowancesTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "deductionsTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "grossAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "netAmount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "PayrollPeriod" DROP COLUMN "domain",
DROP COLUMN "payoutSource",
DROP COLUMN "scopeKey";

-- AlterTable
ALTER TABLE "PayrollRun" DROP COLUMN "domain",
DROP COLUMN "goldRatePerUnit",
DROP COLUMN "goldRateUnit",
DROP COLUMN "goldSettlementMode",
DROP COLUMN "payoutSource",
ADD COLUMN     "employerCostTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "journalEntryId" TEXT,
ADD COLUMN     "postingSkippedReason" TEXT,
ALTER COLUMN "grossTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "allowancesTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "deductionsTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "netTotal" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "PriceList" ADD COLUMN     "taxInclusive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "ageRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "compareAtPrice" DECIMAL(14,2),
ADD COLUMN     "depositAmount" DECIMAL(14,2),
ADD COLUMN     "returnable" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "standardPrice" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "defaultTaxRate" SET DATA TYPE DECIMAL(5,2),
ALTER COLUMN "maxDiscountPercent" SET DATA TYPE DECIMAL(5,2);

-- AlterTable
ALTER TABLE "ProductPrice" ALTER COLUMN "minQuantity" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "RetailGoodsReceipt" DROP COLUMN "status",
ADD COLUMN     "status" "RetailGoodsReceiptStatus" NOT NULL DEFAULT 'POSTED';

-- AlterTable
ALTER TABLE "RetailGoodsReceiptLine" ADD COLUMN     "companyId" TEXT NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "RetailHeldCart" DROP COLUMN "status",
ADD COLUMN     "status" "RetailHeldCartStatus" NOT NULL DEFAULT 'HELD';

-- AlterTable
ALTER TABLE "RetailPromotion" DROP COLUMN "type",
ADD COLUMN     "type" "RetailPromotionType" NOT NULL,
ALTER COLUMN "value" SET DATA TYPE DECIMAL(14,2),
DROP COLUMN "status",
ADD COLUMN     "status" "RetailPromotionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "RetailPurchaseOrder" DROP COLUMN "status",
ADD COLUMN     "status" "RetailPurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "RetailPurchaseOrderLine" ADD COLUMN     "companyId" TEXT NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "receivedQuantity" SET DATA TYPE DECIMAL(12,4);

-- AlterTable
ALTER TABLE "RetailSale" DROP COLUMN "clientOperationId",
ADD COLUMN     "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "clientRef" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
DROP COLUMN "saleType",
ADD COLUMN     "saleType" "RetailSaleType" NOT NULL DEFAULT 'SALE',
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "tenderedAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "changeAmount" SET DATA TYPE DECIMAL(14,2),
DROP COLUMN "status",
ADD COLUMN     "status" "RetailSaleStatus" NOT NULL DEFAULT 'POSTED';

-- AlterTable
ALTER TABLE "RetailSaleLine" DROP COLUMN "catalogItemId",
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "productId" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "costUnit" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "costTotal" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "RetailSalePayment" ADD COLUMN     "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
DROP COLUMN "tenderType",
ADD COLUMN     "tenderType" "RetailTenderType" NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "RetailShift" ALTER COLUMN "openingFloat" SET DATA TYPE DECIMAL(14,2),
DROP COLUMN "status",
ADD COLUMN     "status" "RetailShiftStatus" NOT NULL DEFAULT 'OPEN',
ALTER COLUMN "expectedCash" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "countedCash" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "variance" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN     "accent" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "emoji" TEXT;

-- AlterTable
ALTER TABLE "SchoolGuardian" ADD COLUMN     "accent" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "SchoolHostel" ADD COLUMN     "accent" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "emoji" TEXT;

-- AlterTable
ALTER TABLE "SchoolStudent" ADD COLUMN     "accent" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "SchoolSubject" ADD COLUMN     "accent" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "emoji" TEXT;

-- AlterTable
ALTER TABLE "SchoolTeacherProfile" ADD COLUMN     "accent" TEXT,
ADD COLUMN     "avatarUrl" TEXT;

-- AlterTable
ALTER TABLE "ShiftGroup" ALTER COLUMN "siteId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" "AccountingSourceType",
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,4);

-- DropTable
DROP TABLE "IrregularPayoutBatch";

-- DropTable
DROP TABLE "IrregularPayoutBatchItem";

-- DropTable
DROP TABLE "RetailCatalogItem";

-- DropEnum
DROP TYPE "GoldSettlementMode";

-- DropEnum
DROP TYPE "IrregularPayoutSource";

-- DropEnum
DROP TYPE "PaymentType";

-- DropEnum
DROP TYPE "RunDomain";

-- CreateTable
CREATE TABLE "PayeTable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "cycle" "PayrollCycle" NOT NULL DEFAULT 'MONTHLY',
    "label" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "source" TEXT,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayeTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayeBand" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "lowerBound" DECIMAL(14,2) NOT NULL,
    "upperBound" DECIMAL(14,2),
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "deductAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayeBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatutoryRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" "StatutoryRateKey" NOT NULL,
    "currency" TEXT,
    "ratePercent" DECIMAL(7,4) NOT NULL,
    "ceilingAmount" DECIMAL(14,2),
    "floorAmount" DECIMAL(14,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "source" TEXT,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatutoryRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCredit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" "TaxCreditKey" NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "ratePercent" DECIMAL(7,4),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "source" TEXT,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NecAgreement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "councilName" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "employeeRatePercent" DECIMAL(7,4),
    "employeeFixedAmount" DECIMAL(14,2),
    "employerRatePercent" DECIMAL(7,4),
    "employerFixedAmount" DECIMAL(14,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NecAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "LeaveUnit" NOT NULL DEFAULT 'DAY',
    "accrualMethod" "LeaveAccrualMethod" NOT NULL DEFAULT 'ANNUAL_GRANT',
    "defaultEntitlement" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "requiresDocumentAfterDays" INTEGER,
    "carryOverLimit" DECIMAL(6,2),
    "carryOverExpiresOn" TEXT,
    "policyNote" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "source" TEXT,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveEntitlement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "granted" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "carriedOver" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "workingDays" DECIMAL(6,2) NOT NULL,
    "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "coveringEmployeeId" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "doublePayIfWorked" BOOLEAN NOT NULL DEFAULT false,
    "siteId" TEXT,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementIntake" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" "SettlementSource" NOT NULL,
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

    CONSTRAINT "SettlementIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementIntakeItem" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementIntakeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" "SettlementSource" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "mode" "SettlementMode" NOT NULL DEFAULT 'CURRENT_PERIOD',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "ratePerUnit" DECIMAL(14,4),
    "rateUnit" TEXT NOT NULL DEFAULT 'unit',
    "totalQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" TEXT,
    "postingSkippedReason" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "unitRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementLineOrigin" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "goldShiftAllocationId" TEXT,
    "settlementIntakeId" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "SettlementLineOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "settlementRunId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "method" "PayoutMethod" NOT NULL DEFAULT 'CASH',
    "cashCustodian" TEXT,
    "cashIssuedAt" TIMESTAMP(3),
    "status" "DisbursementBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "paidAt" TIMESTAMP(3),
    "receiptReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementPayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "source" "SettlementSource" NOT NULL,
    "settlementRunId" TEXT,
    "lineId" TEXT,
    "batchId" TEXT,
    "batchItemId" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "valuationDate" TIMESTAMP(3),
    "unitPrice" DECIMAL(14,4),
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailCashMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "type" "RetailCashMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reasonCode" "RetailCashMovementReason" NOT NULL DEFAULT 'OTHER',
    "reason" TEXT,
    "denominations" JSONB,
    "recordedById" TEXT,
    "recordedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailCashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailTillPin" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastUnlockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailTillPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailZReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportNo" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "registerCode" TEXT NOT NULL,
    "registerName" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,
    "generatedByName" TEXT,
    "shiftCount" INTEGER NOT NULL DEFAULT 0,
    "saleCount" INTEGER NOT NULL DEFAULT 0,
    "refundCount" INTEGER NOT NULL DEFAULT 0,
    "voidCount" INTEGER NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "grossTakings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "voidTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openingFloat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashTakings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashDropTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashTopUpTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashPayoutTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashMovementNet" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "countedCash" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashVariance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tenderBreakdown" JSONB NOT NULL,
    "topItems" JSONB NOT NULL,
    "cashMovements" JSONB NOT NULL,
    "shifts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailZReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolSchemeOfWork" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "weekOfTerm" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "objectives" TEXT,
    "activities" TEXT,
    "resourcesNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSchemeOfWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMessageThread" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT,
    "guardianId" TEXT NOT NULL,
    "teacherProfileId" TEXT,
    "subject" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guardianReadAt" TIMESTAMP(3),
    "staffReadAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolMessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "senderSide" "SchoolMessageSide" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolIdentitySettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentPrefix" TEXT,
    "studentSeparator" TEXT,
    "studentPadWidth" INTEGER,
    "cardAccentColor" TEXT NOT NULL DEFAULT '#1D4ED8',
    "cardMotto" TEXT,
    "cardShowPhoto" BOOLEAN NOT NULL DEFAULT true,
    "cardShowGuardianPhone" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolIdentitySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolImportJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" "SchoolImportEntity" NOT NULL,
    "status" "SchoolImportJobStatus" NOT NULL DEFAULT 'MAPPING',
    "fileName" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "onDuplicate" TEXT NOT NULL DEFAULT 'SKIP',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsFailed" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),

    CONSTRAINT "SchoolImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolImportRow" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "status" "SchoolImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "rawJson" JSONB NOT NULL,
    "valuesJson" JSONB NOT NULL DEFAULT '{}',
    "issuesJson" JSONB NOT NULL DEFAULT '[]',
    "matchId" TEXT,
    "matchLabel" TEXT,
    "parserWarning" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolImportArtifact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolImportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayeTable_companyId_currency_cycle_effectiveFrom_idx" ON "PayeTable"("companyId", "currency", "cycle", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayeTable_companyId_currency_cycle_effectiveFrom_key" ON "PayeTable"("companyId", "currency", "cycle", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayeBand_tableId_sortOrder_idx" ON "PayeBand"("tableId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PayeBand_tableId_lowerBound_key" ON "PayeBand"("tableId", "lowerBound");

-- CreateIndex
CREATE INDEX "StatutoryRate_companyId_key_effectiveFrom_idx" ON "StatutoryRate"("companyId", "key", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryRate_companyId_key_currency_effectiveFrom_key" ON "StatutoryRate"("companyId", "key", "currency", "effectiveFrom");

-- CreateIndex
CREATE INDEX "TaxCredit_companyId_key_effectiveFrom_idx" ON "TaxCredit"("companyId", "key", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCredit_companyId_key_currency_effectiveFrom_key" ON "TaxCredit"("companyId", "key", "currency", "effectiveFrom");

-- CreateIndex
CREATE INDEX "NecAgreement_companyId_isActive_effectiveFrom_idx" ON "NecAgreement"("companyId", "isActive", "effectiveFrom");

-- CreateIndex
CREATE INDEX "LeaveType_companyId_isActive_effectiveFrom_idx" ON "LeaveType"("companyId", "isActive", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_companyId_code_effectiveFrom_key" ON "LeaveType"("companyId", "code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "LeaveEntitlement_companyId_year_idx" ON "LeaveEntitlement"("companyId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveEntitlement_employeeId_leaveTypeId_year_key" ON "LeaveEntitlement"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_employeeId_startDate_idx" ON "LeaveRequest"("companyId", "employeeId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_status_startDate_idx" ON "LeaveRequest"("companyId", "status", "startDate");

-- CreateIndex
CREATE INDEX "PublicHoliday_companyId_date_idx" ON "PublicHoliday"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_companyId_date_siteId_key" ON "PublicHoliday"("companyId", "date", "siteId");

-- CreateIndex
CREATE INDEX "SettlementIntake_companyId_source_workflowStatus_dueDate_idx" ON "SettlementIntake"("companyId", "source", "workflowStatus", "dueDate");

-- CreateIndex
CREATE INDEX "SettlementIntakeItem_employeeId_idx" ON "SettlementIntakeItem"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementIntakeItem_intakeId_employeeId_key" ON "SettlementIntakeItem"("intakeId", "employeeId");

-- CreateIndex
CREATE INDEX "SettlementRun_companyId_source_status_periodStart_idx" ON "SettlementRun"("companyId", "source", "status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRun_companyId_source_code_key" ON "SettlementRun"("companyId", "source", "code");

-- CreateIndex
CREATE INDEX "SettlementLine_employeeId_idx" ON "SettlementLine"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementLine_runId_employeeId_key" ON "SettlementLine"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "SettlementLineOrigin_goldShiftAllocationId_idx" ON "SettlementLineOrigin"("goldShiftAllocationId");

-- CreateIndex
CREATE INDEX "SettlementLineOrigin_settlementIntakeId_idx" ON "SettlementLineOrigin"("settlementIntakeId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementLineOrigin_lineId_goldShiftAllocationId_key" ON "SettlementLineOrigin"("lineId", "goldShiftAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementLineOrigin_lineId_settlementIntakeId_key" ON "SettlementLineOrigin"("lineId", "settlementIntakeId");

-- CreateIndex
CREATE INDEX "SettlementBatch_companyId_status_createdAt_idx" ON "SettlementBatch"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SettlementBatch_settlementRunId_idx" ON "SettlementBatch"("settlementRunId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementBatch_companyId_code_key" ON "SettlementBatch"("companyId", "code");

-- CreateIndex
CREATE INDEX "SettlementBatchItem_lineId_idx" ON "SettlementBatchItem"("lineId");

-- CreateIndex
CREATE INDEX "SettlementBatchItem_employeeId_idx" ON "SettlementBatchItem"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementBatchItem_batchId_employeeId_key" ON "SettlementBatchItem"("batchId", "employeeId");

-- CreateIndex
CREATE INDEX "SettlementPayment_companyId_employeeId_source_status_idx" ON "SettlementPayment"("companyId", "employeeId", "source", "status");

-- CreateIndex
CREATE INDEX "SettlementPayment_settlementRunId_idx" ON "SettlementPayment"("settlementRunId");

-- CreateIndex
CREATE INDEX "RetailCashMovement_companyId_shiftId_createdAt_idx" ON "RetailCashMovement"("companyId", "shiftId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailCashMovement_companyId_type_idx" ON "RetailCashMovement"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "RetailTillPin_userId_key" ON "RetailTillPin"("userId");

-- CreateIndex
CREATE INDEX "RetailTillPin_companyId_idx" ON "RetailTillPin"("companyId");

-- CreateIndex
CREATE INDEX "RetailZReport_companyId_businessDate_idx" ON "RetailZReport"("companyId", "businessDate");

-- CreateIndex
CREATE INDEX "RetailZReport_companyId_siteId_businessDate_idx" ON "RetailZReport"("companyId", "siteId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "RetailZReport_companyId_registerCode_businessDate_key" ON "RetailZReport"("companyId", "registerCode", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "RetailZReport_companyId_reportNo_key" ON "RetailZReport"("companyId", "reportNo");

-- CreateIndex
CREATE INDEX "SchoolSchemeOfWork_companyId_termId_subjectId_level_idx" ON "SchoolSchemeOfWork"("companyId", "termId", "subjectId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSchemeOfWork_companyId_subjectId_termId_level_weekOfT_key" ON "SchoolSchemeOfWork"("companyId", "subjectId", "termId", "level", "weekOfTerm");

-- CreateIndex
CREATE INDEX "SchoolMessageThread_companyId_guardianId_lastMessageAt_idx" ON "SchoolMessageThread"("companyId", "guardianId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SchoolMessageThread_companyId_teacherProfileId_lastMessageA_idx" ON "SchoolMessageThread"("companyId", "teacherProfileId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SchoolMessageThread_companyId_lastMessageAt_idx" ON "SchoolMessageThread"("companyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SchoolMessageThread_companyId_studentId_idx" ON "SchoolMessageThread"("companyId", "studentId");

-- CreateIndex
CREATE INDEX "SchoolMessage_companyId_threadId_createdAt_idx" ON "SchoolMessage"("companyId", "threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolIdentitySettings_companyId_key" ON "SchoolIdentitySettings"("companyId");

-- CreateIndex
CREATE INDEX "SchoolImportJob_companyId_status_idx" ON "SchoolImportJob"("companyId", "status");

-- CreateIndex
CREATE INDEX "SchoolImportJob_companyId_entityType_createdAt_idx" ON "SchoolImportJob"("companyId", "entityType", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolImportRow_companyId_jobId_status_idx" ON "SchoolImportRow"("companyId", "jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolImportRow_jobId_lineNo_key" ON "SchoolImportRow"("jobId", "lineNo");

-- CreateIndex
CREATE INDEX "SchoolImportArtifact_rowId_sequence_idx" ON "SchoolImportArtifact"("rowId", "sequence");

-- CreateIndex
CREATE INDEX "SchoolImportArtifact_companyId_artifactType_artifactId_idx" ON "SchoolImportArtifact"("companyId", "artifactType", "artifactId");

-- CreateIndex
CREATE INDEX "Attendance_companyId_date_idx" ON "Attendance"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_date_shift_employeeId_key" ON "Attendance"("date", "shift", "employeeId");

-- CreateIndex
CREATE INDEX "CrmComment_companyId_subjectType_subjectId_idx" ON "CrmComment"("companyId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "CrmRecordFile_companyId_subjectType_subjectId_idx" ON "CrmRecordFile"("companyId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "CrmTask_companyId_subjectType_subjectId_idx" ON "CrmTask"("companyId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "EmployeePayment_employeeId_dueDate_idx" ON "EmployeePayment"("employeeId", "dueDate");

-- CreateIndex
CREATE INDEX "PayrollPeriod_companyId_startDate_idx" ON "PayrollPeriod"("companyId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_companyId_periodKey_key" ON "PayrollPeriod"("companyId", "periodKey");

-- CreateIndex
CREATE INDEX "PayrollRun_companyId_status_idx" ON "PayrollRun"("companyId", "status");

-- CreateIndex
CREATE INDEX "Product_companyId_barcode_idx" ON "Product"("companyId", "barcode");

-- CreateIndex
CREATE INDEX "RetailGoodsReceipt_companyId_siteId_status_idx" ON "RetailGoodsReceipt"("companyId", "siteId", "status");

-- CreateIndex
CREATE INDEX "RetailGoodsReceiptLine_companyId_idx" ON "RetailGoodsReceiptLine"("companyId");

-- CreateIndex
CREATE INDEX "RetailHeldCart_companyId_shiftId_status_idx" ON "RetailHeldCart"("companyId", "shiftId", "status");

-- CreateIndex
CREATE INDEX "RetailPromotion_companyId_status_idx" ON "RetailPromotion"("companyId", "status");

-- CreateIndex
CREATE INDEX "RetailPurchaseOrder_companyId_siteId_status_idx" ON "RetailPurchaseOrder"("companyId", "siteId", "status");

-- CreateIndex
CREATE INDEX "RetailPurchaseOrderLine_companyId_idx" ON "RetailPurchaseOrderLine"("companyId");

-- CreateIndex
CREATE INDEX "RetailSale_companyId_siteId_status_postedAt_idx" ON "RetailSale"("companyId", "siteId", "status", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetailSale_companyId_clientRef_key" ON "RetailSale"("companyId", "clientRef");

-- CreateIndex
CREATE INDEX "RetailSaleLine_companyId_inventoryItemId_idx" ON "RetailSaleLine"("companyId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "RetailSaleLine_companyId_productId_idx" ON "RetailSaleLine"("companyId", "productId");

-- CreateIndex
CREATE INDEX "RetailSalePayment_companyId_tenderType_idx" ON "RetailSalePayment"("companyId", "tenderType");

-- CreateIndex
CREATE INDEX "RetailShift_companyId_siteId_status_idx" ON "RetailShift"("companyId", "siteId", "status");

-- CreateIndex
CREATE INDEX "RetailShift_cashierId_status_idx" ON "RetailShift"("cashierId", "status");

-- CreateIndex
CREATE INDEX "StockMovement_sourceType_sourceId_idx" ON "StockMovement"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "PayeTable" ADD CONSTRAINT "PayeTable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayeBand" ADD CONSTRAINT "PayeBand_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PayeTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatutoryRate" ADD CONSTRAINT "StatutoryRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCredit" ADD CONSTRAINT "TaxCredit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecAgreement" ADD CONSTRAINT "NecAgreement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveEntitlement" ADD CONSTRAINT "LeaveEntitlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveEntitlement" ADD CONSTRAINT "LeaveEntitlement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveEntitlement" ADD CONSTRAINT "LeaveEntitlement_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_coveringEmployeeId_fkey" FOREIGN KEY ("coveringEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHoliday" ADD CONSTRAINT "PublicHoliday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHoliday" ADD CONSTRAINT "PublicHoliday_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementIntake" ADD CONSTRAINT "SettlementIntake_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementIntake" ADD CONSTRAINT "SettlementIntake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementIntake" ADD CONSTRAINT "SettlementIntake_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementIntake" ADD CONSTRAINT "SettlementIntake_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementIntakeItem" ADD CONSTRAINT "SettlementIntakeItem_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "SettlementIntake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementIntakeItem" ADD CONSTRAINT "SettlementIntakeItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRun" ADD CONSTRAINT "SettlementRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SettlementRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLineOrigin" ADD CONSTRAINT "SettlementLineOrigin_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "SettlementLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLineOrigin" ADD CONSTRAINT "SettlementLineOrigin_goldShiftAllocationId_fkey" FOREIGN KEY ("goldShiftAllocationId") REFERENCES "GoldShiftAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementLineOrigin" ADD CONSTRAINT "SettlementLineOrigin_settlementIntakeId_fkey" FOREIGN KEY ("settlementIntakeId") REFERENCES "SettlementIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatchItem" ADD CONSTRAINT "SettlementBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SettlementBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatchItem" ADD CONSTRAINT "SettlementBatchItem_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "SettlementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatchItem" ADD CONSTRAINT "SettlementBatchItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayment" ADD CONSTRAINT "SettlementPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayment" ADD CONSTRAINT "SettlementPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayment" ADD CONSTRAINT "SettlementPayment_settlementRunId_fkey" FOREIGN KEY ("settlementRunId") REFERENCES "SettlementRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayment" ADD CONSTRAINT "SettlementPayment_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "SettlementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayment" ADD CONSTRAINT "SettlementPayment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SettlementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayment" ADD CONSTRAINT "SettlementPayment_batchItemId_fkey" FOREIGN KEY ("batchItemId") REFERENCES "SettlementBatchItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementPayment" ADD CONSTRAINT "SettlementPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftGroup" ADD CONSTRAINT "ShiftGroup_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailRegister" ADD CONSTRAINT "RetailRegister_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailRegister" ADD CONSTRAINT "RetailRegister_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPromotion" ADD CONSTRAINT "RetailPromotion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPurchaseOrder" ADD CONSTRAINT "RetailPurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPurchaseOrder" ADD CONSTRAINT "RetailPurchaseOrder_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPurchaseOrder" ADD CONSTRAINT "RetailPurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPurchaseOrderLine" ADD CONSTRAINT "RetailPurchaseOrderLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPurchaseOrderLine" ADD CONSTRAINT "RetailPurchaseOrderLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailGoodsReceipt" ADD CONSTRAINT "RetailGoodsReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailGoodsReceipt" ADD CONSTRAINT "RetailGoodsReceipt_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailGoodsReceipt" ADD CONSTRAINT "RetailGoodsReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailGoodsReceiptLine" ADD CONSTRAINT "RetailGoodsReceiptLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailGoodsReceiptLine" ADD CONSTRAINT "RetailGoodsReceiptLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailShift" ADD CONSTRAINT "RetailShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailShift" ADD CONSTRAINT "RetailShift_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailShift" ADD CONSTRAINT "RetailShift_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailCashMovement" ADD CONSTRAINT "RetailCashMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailCashMovement" ADD CONSTRAINT "RetailCashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "RetailShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailCashMovement" ADD CONSTRAINT "RetailCashMovement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailTillPin" ADD CONSTRAINT "RetailTillPin_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailTillPin" ADD CONSTRAINT "RetailTillPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailZReport" ADD CONSTRAINT "RetailZReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailZReport" ADD CONSTRAINT "RetailZReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailZReport" ADD CONSTRAINT "RetailZReport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailHeldCart" ADD CONSTRAINT "RetailHeldCart_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailHeldCart" ADD CONSTRAINT "RetailHeldCart_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "RetailShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailHeldCart" ADD CONSTRAINT "RetailHeldCart_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "RetailShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_sourceSaleId_fkey" FOREIGN KEY ("sourceSaleId") REFERENCES "RetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSaleLine" ADD CONSTRAINT "RetailSaleLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSaleLine" ADD CONSTRAINT "RetailSaleLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSaleLine" ADD CONSTRAINT "RetailSaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSaleLine" ADD CONSTRAINT "RetailSaleLine_sourceLineId_fkey" FOREIGN KEY ("sourceLineId") REFERENCES "RetailSaleLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSalePayment" ADD CONSTRAINT "RetailSalePayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSchemeOfWork" ADD CONSTRAINT "SchoolSchemeOfWork_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSchemeOfWork" ADD CONSTRAINT "SchoolSchemeOfWork_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSchemeOfWork" ADD CONSTRAINT "SchoolSchemeOfWork_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMessageThread" ADD CONSTRAINT "SchoolMessageThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMessageThread" ADD CONSTRAINT "SchoolMessageThread_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMessageThread" ADD CONSTRAINT "SchoolMessageThread_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "SchoolGuardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMessageThread" ADD CONSTRAINT "SchoolMessageThread_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "SchoolTeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMessage" ADD CONSTRAINT "SchoolMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMessage" ADD CONSTRAINT "SchoolMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "SchoolMessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMessage" ADD CONSTRAINT "SchoolMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolImportJob" ADD CONSTRAINT "SchoolImportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolImportJob" ADD CONSTRAINT "SchoolImportJob_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolImportRow" ADD CONSTRAINT "SchoolImportRow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolImportRow" ADD CONSTRAINT "SchoolImportRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SchoolImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolImportArtifact" ADD CONSTRAINT "SchoolImportArtifact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolImportArtifact" ADD CONSTRAINT "SchoolImportArtifact_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "SchoolImportRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

