-- A custom report says who sees it the way a report template does: just its
-- maker, the managers, or everyone. A report shared with everyone keeps that.
ALTER TABLE "CustomReport" ADD COLUMN "audience" "ReportTemplateAudience" NOT NULL DEFAULT 'JUST_ME';
UPDATE "CustomReport" SET "audience" = 'EVERYONE' WHERE "shared" = true;
ALTER TABLE "CustomReport" DROP COLUMN "shared";
