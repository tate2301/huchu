-- Projects, requisitions and the daily cost log.
--
-- James, 22 Sep: the CRM chain runs lead -> qualified -> ... -> raise job, and
-- stops. A job is a day's work with a checklist. What was missing is the thing
-- a job belongs to when the work runs longer than a day and somebody is
-- answerable for what it costs.
--
--   CrmProject         that thing. Optionally raised from a deal, a client, a
--                      site or the job itself; all four are nullable because
--                      work is sometimes raised directly and refusing to
--                      record it until the pipeline catches up helps nobody.
--
--   CrmRequisition     an employee asking for money. `projectId` is NULLABLE
--                      and that is the whole point: "requisition can be for
--                      fuel or airtime and it cannot be for a specific
--                      project". Forcing a project onto those would either
--                      block the request or invent a fictional one, and a
--                      fictional one makes every project's cost figure a lie.
--
--   CrmDailyLog        one person's money for one day, so a day can be
--   CrmDailyCostEntry  declared finished rather than leaving a trail of
--                      entries nobody ever closes. `logDate` is a DATE, not a
--                      timestamp: a rep writes up Tuesday on Wednesday
--                      morning more often than not, and the entry belongs to
--                      Tuesday.
--
--   CrmDailyReport     what one person did in a day, assembled and kept.
--                      Stored rather than recomputed, so management asking
--                      about the 14th three weeks later gets the 14th as it
--                      was rather than the 14th recomputed against records
--                      that have since been edited.
--
-- These live in the CRM and post INTO accounting; they are not a second set of
-- books. Money is Decimal(14,2) throughout, matching the rest of the repo --
-- a project's cost is money, and money is never a double here.

CREATE TYPE "CrmProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- APPROVED and DISBURSED are separate states because "he said yes" and "I have
-- the cash" are different days and different questions. ACQUITTED is a third:
-- a requisition is not finished when the money is handed over, it is finished
-- when somebody accounts for what it went on.
CREATE TYPE "CrmRequisitionStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'DISBURSED', 'ACQUITTED', 'CANCELLED'
);

-- Not derived from the chart of accounts on purpose: a rep asking for fuel
-- should pick "Fuel", not hunt for account 6220.
CREATE TYPE "CrmRequisitionCategory" AS ENUM (
  'FUEL', 'AIRTIME', 'TRANSPORT', 'MATERIALS', 'EQUIPMENT', 'LABOUR',
  'SUBSISTENCE', 'ACCOMMODATION', 'OTHER'
);

CREATE TYPE "CrmCashDirection" AS ENUM ('RECEIVED', 'SPENT');

CREATE TABLE "CrmProject" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CrmProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "dealId" TEXT,
    "clientId" TEXT,
    "siteId" TEXT,
    "workOrderId" TEXT,
    "managerId" TEXT,
    "startDate" TIMESTAMP(3),
    "targetEndDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    -- Null means nobody has set a budget, which is not the same as zero.
    "budget" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "customFields" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmProject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmProject_companyId_projectNo_key" ON "CrmProject"("companyId", "projectNo");
CREATE INDEX "CrmProject_companyId_status_updatedAt_idx" ON "CrmProject"("companyId", "status", "updatedAt");
CREATE INDEX "CrmProject_companyId_managerId_status_idx" ON "CrmProject"("companyId", "managerId", "status");
CREATE INDEX "CrmProject_companyId_dealId_idx" ON "CrmProject"("companyId", "dealId");

CREATE TABLE "CrmRequisition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requisitionNo" TEXT NOT NULL,
    "status" "CrmRequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "category" "CrmRequisitionCategory" NOT NULL,
    "purpose" TEXT NOT NULL,
    "notes" TEXT,
    -- NULLABLE by design. Fuel and airtime belong to no project.
    "projectId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "requestedById" TEXT NOT NULL,
    "neededBy" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    -- An approver may cut the amount without rejecting the request.
    "approvedAmount" DECIMAL(14,2),
    "decisionNote" TEXT,
    "disbursedById" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "bankAccountId" TEXT,
    "acquittedAt" TIMESTAMP(3),
    "acquittedAmount" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmRequisition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmRequisition_companyId_requisitionNo_key" ON "CrmRequisition"("companyId", "requisitionNo");
CREATE INDEX "CrmRequisition_companyId_status_createdAt_idx" ON "CrmRequisition"("companyId", "status", "createdAt");
CREATE INDEX "CrmRequisition_companyId_requestedById_status_idx" ON "CrmRequisition"("companyId", "requestedById", "status");
CREATE INDEX "CrmRequisition_companyId_projectId_idx" ON "CrmRequisition"("companyId", "projectId");

CREATE TABLE "CrmDailyLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "logDate" DATE NOT NULL,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmDailyLog_pkey" PRIMARY KEY ("id")
);

-- One log per person per day. Also what makes "open today's log" an upsert.
CREATE UNIQUE INDEX "CrmDailyLog_companyId_userId_logDate_key" ON "CrmDailyLog"("companyId", "userId", "logDate");
CREATE INDEX "CrmDailyLog_companyId_logDate_idx" ON "CrmDailyLog"("companyId", "logDate");

CREATE TABLE "CrmDailyCostEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "direction" "CrmCashDirection" NOT NULL,
    "category" "CrmRequisitionCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "projectId" TEXT,
    "requisitionId" TEXT,
    "receiptUrl" TEXT,
    "receiptPathname" TEXT,
    -- Written in the field too, so a replayed entry must land once.
    "clientEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmDailyCostEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmDailyCostEntry_companyId_clientEntryId_key" ON "CrmDailyCostEntry"("companyId", "clientEntryId");
CREATE INDEX "CrmDailyCostEntry_companyId_logId_idx" ON "CrmDailyCostEntry"("companyId", "logId");
-- "What has this project cost us" without a spreadsheet.
CREATE INDEX "CrmDailyCostEntry_companyId_projectId_createdAt_idx" ON "CrmDailyCostEntry"("companyId", "projectId", "createdAt");
CREATE INDEX "CrmDailyCostEntry_companyId_requisitionId_idx" ON "CrmDailyCostEntry"("companyId", "requisitionId");

CREATE TABLE "CrmDailyReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "summary" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "CrmDailyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmDailyReport_companyId_userId_reportDate_key" ON "CrmDailyReport"("companyId", "userId", "reportDate");
CREATE INDEX "CrmDailyReport_companyId_reportDate_idx" ON "CrmDailyReport"("companyId", "reportDate");

ALTER TABLE "CrmProject"
  ADD CONSTRAINT "CrmProject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmProject_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmProject_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CrmClient"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmProject_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CrmSite"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmProject_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "CrmWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmProject_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmRequisition"
  ADD CONSTRAINT "CrmRequisition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- SET NULL, not CASCADE: deleting a project must not delete the record that
  -- money was asked for and handed over.
  ADD CONSTRAINT "CrmRequisition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CrmProject"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmRequisition_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmRequisition_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmRequisition_disbursedById_fkey" FOREIGN KEY ("disbursedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmRequisition_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmDailyLog"
  ADD CONSTRAINT "CrmDailyLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmDailyLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmDailyCostEntry"
  ADD CONSTRAINT "CrmDailyCostEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmDailyCostEntry_logId_fkey" FOREIGN KEY ("logId") REFERENCES "CrmDailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmDailyCostEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CrmProject"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmDailyCostEntry_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "CrmRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmDailyReport"
  ADD CONSTRAINT "CrmDailyReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmDailyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
