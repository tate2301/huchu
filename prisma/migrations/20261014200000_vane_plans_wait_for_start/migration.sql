-- Plans wait for Start (approved 14 Oct). A plan Vane drafts waits until a person presses Start;
-- then Vane's steps run as jobs on the scheduled-jobs tick and a person's steps wait for them.
-- A plan keeps the job that laid it out, for what it read and whose request it was.
ALTER TYPE "VanePlanStatus" ADD VALUE 'WAITING' BEFORE 'OPEN';

ALTER TABLE "VanePlan" ADD COLUMN "jobId" TEXT;

CREATE INDEX "VanePlan_jobId_idx" ON "VanePlan"("jobId");
ALTER TABLE "VanePlan" ADD CONSTRAINT "VanePlan_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "VaneJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vane's reader reaches the new column, as `pnpm vane:reader-sql` prints it.
GRANT SELECT ("jobId") ON "VanePlan" TO vane_reader;
