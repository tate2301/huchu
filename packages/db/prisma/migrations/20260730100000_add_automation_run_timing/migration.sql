-- How long a rule took, and how much it did.
--
-- Both nullable/defaulted so existing rows stay valid: a run recorded before
-- this migration genuinely has no measured duration, and reporting it as zero
-- would drag every average toward a number nobody observed.
ALTER TABLE "CrmAutomationRun" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "CrmAutomationRun" ADD COLUMN "actionCount" INTEGER NOT NULL DEFAULT 0;
