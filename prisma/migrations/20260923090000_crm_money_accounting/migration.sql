-- The CRM's money-out flows reach the ledger.
--
-- Requisitions and daily cost entries were recorded in the CRM and posted
-- nowhere: the figures on a project page were right and the trial balance had
-- never heard of them. James asked for a requisition system "in accounts",
-- for daily costs "tied to the main accounting system", and for each project
-- to have "it own accounting". This is that.
--
-- Disbursement expenses the money as it leaves the business. The two
-- acquittal types therefore carry only the VARIANCE -- what came back as
-- change, or what the employee was owed for spending their own -- because the
-- expense has already been recognised in full. They are separate types rather
-- than one signed amount because a posting rule line has a fixed direction
-- and cannot flip on the sign of a number.
--
-- CRM_COST_ENTRY_RECEIPT is captured and deliberately left unmapped: cash
-- arriving in a rep's hands has no credit side the system can infer, and a
-- customer payment belongs in the receipt flow. It sits PENDING on the
-- integration log where somebody can see it and decide.
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'CRM_REQUISITION_DISBURSEMENT';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'CRM_REQUISITION_REFUND';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'CRM_REQUISITION_TOPUP';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'CRM_COST_ENTRY_SPEND';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'CRM_COST_ENTRY_RECEIPT';

-- A rule an accountant edits should say what it matches on. This resolves
-- from the same place MOVEMENT_TYPE does; the difference is that a fuel rule
-- now reads "expense category is FUEL" rather than "movement type is FUEL".
ALTER TYPE "PostingRuleConditionField" ADD VALUE IF NOT EXISTS 'EXPENSE_CATEGORY';

-- Each project its own accounting, in the ledger and not only in the CRM's
-- rollup. Nullable: projects raised before this have none, and SET NULL on
-- delete because losing a cost centre must not take the project with it.
ALTER TABLE "CrmProject" ADD COLUMN "costCenterId" TEXT;

ALTER TABLE "CrmProject"
  ADD CONSTRAINT "CrmProject_costCenterId_fkey" FOREIGN KEY ("costCenterId")
  REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CrmProject_companyId_costCenterId_idx" ON "CrmProject"("companyId", "costCenterId");
