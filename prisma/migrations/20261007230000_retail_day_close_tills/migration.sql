-- FLR-07: a closed day keeps its tills as they stood, so a void after the close cannot move a row under the frozen totals.
-- Days closed before this column read an empty list; the demo seed closes its days again.

-- AlterTable
ALTER TABLE "RetailDayClose" ADD COLUMN "tills" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "RetailDayClose" ALTER COLUMN "tills" DROP DEFAULT;
