-- The project spine: deal -> project -> jobs.
--
-- The chain shipped on 22 Sep ran the other way. A project was raised FROM a
-- job and held that one job in `CrmProject.workOrderId`, so a project could
-- only ever have one job in it -- which is exactly backwards for a six-week
-- floor that is twenty days of work. The link now lives on the job
-- (`CrmWorkOrder.projectId`), a project holds any number of them, and a
-- project is started from the deal that was won.
--
-- A job can still exist with no project: a callout is a real thing that
-- happens, and refusing to record it until somebody raises a project helps
-- nobody.

-- Files can hang off a project: the drawings, the permit, the signed scope.
ALTER TYPE "CrmFieldEntity" ADD VALUE IF NOT EXISTS 'PROJECT';

-- 1. The job points at its project.
ALTER TABLE "CrmWorkOrder" ADD COLUMN "projectId" TEXT;

ALTER TABLE "CrmWorkOrder"
  ADD CONSTRAINT "CrmWorkOrder_projectId_fkey" FOREIGN KEY ("projectId")
  REFERENCES "CrmProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CrmWorkOrder_companyId_projectId_idx" ON "CrmWorkOrder"("companyId", "projectId");

-- 2. Carry every existing link across before the old column goes. A job raised
--    into a project from its own page is still in that project afterwards.
--    `projectFromWorkOrder` handed back the existing project on a second
--    request, so there is normally one project per job; DISTINCT ON keeps the
--    oldest if a hand-made one ever doubled up, rather than failing the deploy.
UPDATE "CrmWorkOrder" AS job
SET "projectId" = link."projectId"
FROM (
  SELECT DISTINCT ON ("workOrderId") "workOrderId", "id" AS "projectId", "companyId"
  FROM "CrmProject"
  WHERE "workOrderId" IS NOT NULL
  ORDER BY "workOrderId", "createdAt" ASC
) AS link
WHERE job."id" = link."workOrderId"
  AND job."companyId" = link."companyId";

ALTER TABLE "CrmProject" DROP CONSTRAINT "CrmProject_workOrderId_fkey";
ALTER TABLE "CrmProject" DROP COLUMN "workOrderId";

-- 3. One project per deal.
--
--    Raising a project from each of a deal's jobs could leave two projects
--    naming the same deal. The oldest keeps the deal; the others keep
--    everything else -- their jobs, their requisitions, their costs, their
--    client and site -- and stop claiming to be the deal's project. Nothing is
--    deleted or merged: folding two budgets and two cost centres together is a
--    decision for a person, not for a migration.
UPDATE "CrmProject" AS project
SET "dealId" = NULL
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "companyId", "dealId" ORDER BY "createdAt" ASC, "id" ASC) AS position
  FROM "CrmProject"
  WHERE "dealId" IS NOT NULL
) AS ranked
WHERE project."id" = ranked."id"
  AND ranked.position > 1;

DROP INDEX "CrmProject_companyId_dealId_idx";
CREATE UNIQUE INDEX "CrmProject_companyId_dealId_key" ON "CrmProject"("companyId", "dealId");

-- 4. The team. `managerId` stays the one person answerable for the budget.
CREATE TABLE "CrmProjectMember" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmProjectMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmProjectMember_projectId_userId_key" ON "CrmProjectMember"("projectId", "userId");
CREATE INDEX "CrmProjectMember_companyId_userId_idx" ON "CrmProjectMember"("companyId", "userId");

ALTER TABLE "CrmProjectMember"
  ADD CONSTRAINT "CrmProjectMember_companyId_fkey" FOREIGN KEY ("companyId")
  REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmProjectMember"
  ADD CONSTRAINT "CrmProjectMember_projectId_fkey" FOREIGN KEY ("projectId")
  REFERENCES "CrmProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmProjectMember"
  ADD CONSTRAINT "CrmProjectMember_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
