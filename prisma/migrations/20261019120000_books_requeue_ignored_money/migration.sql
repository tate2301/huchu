-- D14 (books-final §7, approved 19 Oct for P1): money events written IGNORED never posted,
-- because nothing reads IGNORED (CRM requisition payouts, change returned, top-ups and
-- cost-tracker spends). Re-queue them. Conservative and idempotent: it touches only IGNORED
-- rows with a source type, a source and an amount, and never posts into a closed month.
-- No table or column changes shape, so there are no reader grants.

-- 1. Already on the ledger (the same source posted another way): POSTED, pointing at its journal.
UPDATE "AccountingIntegrationEvent" e
SET "status" = 'POSTED', "journalEntryId" = j."id", "lastError" = NULL, "nextRetryAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
FROM "JournalEntry" j
WHERE e."status" = 'IGNORED'
  AND e."sourceType" IS NOT NULL AND e."sourceId" IS NOT NULL AND COALESCE(e."amount", 0) <> 0
  AND j."companyId" = e."companyId" AND j."sourceType" = e."sourceType" AND j."sourceId" = e."sourceId";

-- 2. Dated in a closed month: held for a person in Needs posting (FAILED, a "not before" no
--    drain reaches), who posts it in the current month or reopens the month.
UPDATE "AccountingIntegrationEvent" e
SET "status" = 'FAILED',
    "nextRetryAt" = TIMESTAMP '9999-12-31 00:00:00',
    "lastError" = to_char(p."startDate", 'FMMonth YYYY') || ' is closed, so this was not posted on its own. Post it in this month, or reopen ' || to_char(p."startDate", 'FMMonth YYYY') || '.',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "AccountingPeriod" p
WHERE e."status" = 'IGNORED'
  AND e."sourceType" IS NOT NULL AND e."sourceId" IS NOT NULL AND COALESCE(e."amount", 0) <> 0
  AND p."companyId" = e."companyId" AND p."status" = 'CLOSED'
  AND p."startDate" <= COALESCE(e."entryDate", e."createdAt")
  AND p."endDate" >= date_trunc('day', COALESCE(e."entryDate", e."createdAt"));

-- 3. On or before the freeze date: held the same way.
UPDATE "AccountingIntegrationEvent" e
SET "status" = 'FAILED',
    "nextRetryAt" = TIMESTAMP '9999-12-31 00:00:00',
    "lastError" = 'The books are frozen up to ' || to_char(s."freezeBeforeDate", 'YYYY-MM-DD') || ', so this was not posted on its own. Post it in this month.',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "AccountingSettings" s
WHERE e."status" = 'IGNORED'
  AND e."sourceType" IS NOT NULL AND e."sourceId" IS NOT NULL AND COALESCE(e."amount", 0) <> 0
  AND s."companyId" = e."companyId" AND s."freezeBeforeDate" IS NOT NULL
  AND COALESCE(e."entryDate", e."createdAt") <= s."freezeBeforeDate";

-- 4. The rest wait, PENDING on their own date, for the drain (lib/books/core/drain.ts).
UPDATE "AccountingIntegrationEvent" e
SET "status" = 'PENDING', "attemptCount" = 0, "lastError" = NULL, "nextRetryAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE e."status" = 'IGNORED'
  AND e."sourceType" IS NOT NULL AND e."sourceId" IS NOT NULL AND COALESCE(e."amount", 0) <> 0;
