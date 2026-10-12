-- CreateEnum
CREATE TYPE "MoneyAccountKind" AS ENUM ('CASH', 'BANK', 'MOBILE');

-- CreateEnum
CREATE TYPE "CrmRequisitionRejectReason" AS ENUM ('NOT_NEEDED_NOW', 'TOO_MUCH', 'PAY_ANOTHER_WAY', 'OTHER');

-- CreateEnum
CREATE TYPE "RetailPayoutMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'ECOCASH');

-- CreateEnum
CREATE TYPE "RetailAttachmentKind" AS ENUM ('QUOTE', 'RECEIPT', 'BILL', 'DELIVERY_NOTE', 'PHOTO');

-- AlterEnum
ALTER TYPE "CrmRequisitionCategory" ADD VALUE 'STOCK';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CRM_REQUISITION_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'CRM_REQUISITION_QUESTION';

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "kind" "MoneyAccountKind" NOT NULL DEFAULT 'BANK',
ADD COLUMN     "ledgerAccountId" TEXT;

-- AlterTable
ALTER TABLE "CrmRequisition" ADD COLUMN     "acquittalNote" TEXT,
ADD COLUMN     "acquittedById" TEXT,
ADD COLUMN     "approvalLimit" DECIMAL(14,2),
ADD COLUMN     "approverId" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "changeAccountId" TEXT,
ADD COLUMN     "changeAmount" DECIMAL(14,2),
ADD COLUMN     "expenseTypeId" TEXT,
ADD COLUMN     "paidAmount" DECIMAL(14,2),
ADD COLUMN     "paidToId" TEXT,
ADD COLUMN     "payeeVendorId" TEXT,
ADD COLUMN     "payoutMethod" "RetailPayoutMethod",
ADD COLUMN     "payoutReference" TEXT,
ADD COLUMN     "purchaseOrderId" TEXT,
ADD COLUMN     "receiptsDueAt" TIMESTAMP(3),
ADD COLUMN     "rejectReason" "CrmRequisitionRejectReason";

-- CreateTable
CREATE TABLE "RetailExpenseType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "CrmRequisitionCategory" NOT NULL DEFAULT 'OTHER',
    "ledgerAccountId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailExpenseType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "RetailAttachmentKind" NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailExpenseType_companyId_name_key" ON "RetailExpenseType"("companyId", "name");

-- CreateIndex
CREATE INDEX "RetailAttachment_companyId_entityType_entityId_idx" ON "RetailAttachment"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CrmRequisition_companyId_purchaseOrderId_idx" ON "CrmRequisition"("companyId", "purchaseOrderId");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailExpenseType" ADD CONSTRAINT "RetailExpenseType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailExpenseType" ADD CONSTRAINT "RetailExpenseType_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailAttachment" ADD CONSTRAINT "RetailAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailAttachment" ADD CONSTRAINT "RetailAttachment_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRequisition" ADD CONSTRAINT "CrmRequisition_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "RetailPurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRequisition" ADD CONSTRAINT "CrmRequisition_expenseTypeId_fkey" FOREIGN KEY ("expenseTypeId") REFERENCES "RetailExpenseType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRequisition" ADD CONSTRAINT "CrmRequisition_payeeVendorId_fkey" FOREIGN KEY ("payeeVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRequisition" ADD CONSTRAINT "CrmRequisition_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRequisition" ADD CONSTRAINT "CrmRequisition_paidToId_fkey" FOREIGN KEY ("paidToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRequisition" ADD CONSTRAINT "CrmRequisition_acquittedById_fkey" FOREIGN KEY ("acquittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRequisition" ADD CONSTRAINT "CrmRequisition_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmRequisition" ADD CONSTRAINT "CrmRequisition_changeAccountId_fkey" FOREIGN KEY ("changeAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The five expense types every shop starts with, for each company with a retail shop,
-- each on its expense account when the company's chart has it.
INSERT INTO "RetailExpenseType" ("id", "companyId", "name", "category", "ledgerAccountId")
SELECT gen_random_uuid()::text, p."companyId", t."name", t."category"::"CrmRequisitionCategory",
  (SELECT a."id" FROM "ChartOfAccount" a WHERE a."companyId" = p."companyId" AND a."code" = t."code" LIMIT 1)
FROM "RetailShopProfile" p
CROSS JOIN (VALUES
  ('Repairs and maintenance', 'EQUIPMENT', '5300'),
  ('Fuel and transport', 'FUEL', '5500'),
  ('Cleaning', 'MATERIALS', '5100'),
  ('Electricity and water', 'OTHER', '5570'),
  ('Licences and fees', 'OTHER', '5580')
) AS t("name", "category", "code")
ON CONFLICT ("companyId", "name") DO NOTHING;

-- A shop's requisitions kept before this name their expense type by category.
UPDATE "CrmRequisition" r
SET "expenseTypeId" = e."id"
FROM "RetailExpenseType" e
WHERE r."siteId" IS NOT NULL
  AND r."expenseTypeId" IS NULL
  AND e."companyId" = r."companyId"
  AND e."name" = CASE r."category"::text
    WHEN 'EQUIPMENT' THEN 'Repairs and maintenance'
    WHEN 'FUEL' THEN 'Fuel and transport'
    WHEN 'TRANSPORT' THEN 'Fuel and transport'
    WHEN 'MATERIALS' THEN 'Cleaning'
  END;

-- Every account kept before this is a bank account in the company's operating bank.
UPDATE "BankAccount" b
SET "kind" = 'BANK',
  "ledgerAccountId" = (SELECT a."id" FROM "ChartOfAccount" a WHERE a."companyId" = b."companyId" AND a."code" = '1010' LIMIT 1)
WHERE b."ledgerAccountId" IS NULL;
