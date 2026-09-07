-- A lead can be put away.
--
-- `CrmLead` had no ending short of the LOST stage, which is a claim about the
-- business — somebody looked at the enquiry and said no. A duplicate typed
-- twice, a test row or a wrong number is not that, and there was nothing else
-- to do with one: leads could be neither archived nor deleted, so they stayed
-- in the pipeline for good.
--
-- It also had no way to stop counting a converted lead. `convertedAt` was set
-- when a lead became a deal, but nothing read it in a list query, so the same
-- opportunity sat in the pipeline twice — once as a lead in Qualified, once as
-- the deal it had just become — and every figure spanning both was wrong.
--
--   CrmLead.archivedAt     when it left the working set; NULL means live
--   CrmLead.archivedById   who put it away
--
-- Conversion now sets both, alongside the `convertedAt` it already wrote, and
-- every lead query excludes archived rows unless they are what was asked for.
-- The record itself is kept either way: source reporting reads it to answer
-- "where did this business come from".
--
-- No index. Every lead query is already scoped by `companyId` through one of
-- the composite indexes on this table, and `archivedAt IS NULL` matches almost
-- every row in it — a column that selective earns nothing as an index and
-- costs a write on every update.

ALTER TABLE "CrmLead" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "CrmLead" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "CrmLead"
  ADD CONSTRAINT "CrmLead_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Leads converted before this migration are the double-count it exists to fix,
-- so they are archived where they stand, credited to whoever converted them.
UPDATE "CrmLead"
   SET "archivedAt" = "convertedAt",
       "archivedById" = "convertedById"
 WHERE "convertedAt" IS NOT NULL
   AND "archivedAt" IS NULL;
