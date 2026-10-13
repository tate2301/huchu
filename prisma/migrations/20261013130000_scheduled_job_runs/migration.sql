-- When each scheduled job last ran, and who holds it now (lib/scheduled-jobs).
-- The jobs run from app/api/cron/tick, which keeps nothing in memory between
-- calls, so the last run and the lease against overlapping ticks live here.

-- CreateTable
CREATE TABLE "ScheduledJobRun" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "claimedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("name")
);

