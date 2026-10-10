-- One posting run per company at a time (SET-09): a run keeps when it last
-- counted an event, and the slice posting it holds it until `sliceUntil`.
ALTER TABLE "RetailPostingRun" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RetailPostingRun" ADD COLUMN "sliceUntil" TIMESTAMP(3);
