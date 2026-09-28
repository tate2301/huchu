-- Every project belongs to the deal it delivers.
--
-- A project is what a deal turns into once it is sold. It used to be possible
-- to raise one with no deal behind it, and such a project had no price to set
-- its budget against, no quote to take its checklist from and nothing to
-- invoice when the work was done. Starting a project now always starts from a
-- deal, and the column says so.
--
-- There is no backfill. A deal cannot be invented for a project, and deleting
-- a project would take its jobs, requisitions and costs' link to it with it.
-- If any project has no deal the migration stops and names them: link each to
-- the deal it delivers, then deploy again.
DO $$
DECLARE
  orphans text;
BEGIN
  SELECT string_agg("projectNo", ', ' ORDER BY "projectNo") INTO orphans
  FROM "CrmProject"
  WHERE "dealId" IS NULL;

  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION 'These projects have no deal: %. Set "dealId" on each to the deal it delivers, then run this migration again.', orphans;
  END IF;
END $$;

-- SET NULL cannot hold on a required column. RESTRICT: a deal with a project
-- is not deleted out from under the project's jobs, requisitions and costs.
ALTER TABLE "CrmProject" DROP CONSTRAINT "CrmProject_dealId_fkey";

ALTER TABLE "CrmProject" ALTER COLUMN "dealId" SET NOT NULL;

ALTER TABLE "CrmProject"
  ADD CONSTRAINT "CrmProject_dealId_fkey" FOREIGN KEY ("dealId")
  REFERENCES "CrmDeal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
