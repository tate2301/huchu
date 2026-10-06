-- Site-visit questions built in the form builder: the measuring kinds, the
-- settings that do not have a column of their own, and the quote a set drafts.
ALTER TYPE "CrmQuestionType" ADD VALUE IF NOT EXISTS 'LENGTH';
ALTER TYPE "CrmQuestionType" ADD VALUE IF NOT EXISTS 'AREA';
ALTER TYPE "CrmQuestionType" ADD VALUE IF NOT EXISTS 'AREAS';
ALTER TYPE "CrmQuestionType" ADD VALUE IF NOT EXISTS 'COUNT';
ALTER TYPE "CrmQuestionType" ADD VALUE IF NOT EXISTS 'READING';
ALTER TYPE "CrmQuestionType" ADD VALUE IF NOT EXISTS 'RUN';
ALTER TYPE "CrmQuestionType" ADD VALUE IF NOT EXISTS 'SIGNATURE';
ALTER TYPE "CrmQuestionType" ADD VALUE IF NOT EXISTS 'SECTION';
ALTER TYPE "CrmQuestionType" ADD VALUE IF NOT EXISTS 'NOTE';

ALTER TABLE "CrmQuestion" ADD COLUMN "settings" JSONB;
ALTER TABLE "CrmQuestionSet" ADD COLUMN "quoteLines" JSONB;
