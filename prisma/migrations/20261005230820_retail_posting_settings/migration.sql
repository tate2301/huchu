-- SET-09: Posting to the books.

-- When retail sales and stock reach the ledger, and who last changed it.
CREATE TYPE "RetailPostingSchedule" AS ENUM ('END_OF_DAY', 'EVERY_SALE');
CREATE TYPE "RetailPostingTrigger" AS ENUM ('SCHEDULE', 'BY_HAND');

-- The accounts a retail posting rule line asks for by role instead of by code.
CREATE TYPE "RetailAccountRole" AS ENUM ('SALES', 'VAT_OUTPUT', 'COST_OF_SALES', 'STOCK', 'BREAKAGE', 'DEPOSITS_HELD');

-- A new value cannot be used in the transaction that adds it, so the type is rebuilt.
ALTER TYPE "PostingRuleLineAccountSource" RENAME TO "PostingRuleLineAccountSource_old";
CREATE TYPE "PostingRuleLineAccountSource" AS ENUM ('FIXED_ACCOUNT', 'TENDER_MAPPING', 'ROLE_MAPPING');
ALTER TABLE "PostingRuleLine" ALTER COLUMN "accountSource" DROP DEFAULT;
ALTER TABLE "PostingRuleLine"
  ALTER COLUMN "accountSource" TYPE "PostingRuleLineAccountSource"
  USING ("accountSource"::text::"PostingRuleLineAccountSource");
ALTER TABLE "PostingRuleLine" ALTER COLUMN "accountSource" SET DEFAULT 'FIXED_ACCOUNT';
DROP TYPE "PostingRuleLineAccountSource_old";

ALTER TABLE "PostingRuleLine" ADD COLUMN "accountRole" "RetailAccountRole";

CREATE TABLE "RetailAccountRoleMapping" (
    "companyId" TEXT NOT NULL,
    "role" "RetailAccountRole" NOT NULL,
    "accountId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailAccountRoleMapping_pkey" PRIMARY KEY ("companyId", "role")
);

ALTER TABLE "RetailAccountRoleMapping" ADD CONSTRAINT "RetailAccountRoleMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailAccountRoleMapping" ADD CONSTRAINT "RetailAccountRoleMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RetailPostingSettings" (
    "companyId" TEXT NOT NULL,
    "schedule" "RetailPostingSchedule" NOT NULL DEFAULT 'END_OF_DAY',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailPostingSettings_pkey" PRIMARY KEY ("companyId")
);

ALTER TABLE "RetailPostingSettings" ADD CONSTRAINT "RetailPostingSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailPostingSettings" ADD CONSTRAINT "RetailPostingSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One posting pass: what "Last posted" reads.
CREATE TABLE "RetailPostingRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "trigger" "RetailPostingTrigger" NOT NULL,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "salesPosted" INTEGER NOT NULL DEFAULT 0,
    "refundsPosted" INTEGER NOT NULL DEFAULT 0,
    "deliveriesPosted" INTEGER NOT NULL DEFAULT 0,
    "countsPosted" INTEGER NOT NULL DEFAULT 0,
    "otherPosted" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RetailPostingRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RetailPostingRun_companyId_startedAt_idx" ON "RetailPostingRun"("companyId", "startedAt");

ALTER TABLE "RetailPostingRun" ADD CONSTRAINT "RetailPostingRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailPostingRun" ADD CONSTRAINT "RetailPostingRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The data move. Each company with retail posting rules gets a role account
-- for each code its rules posted to by hand: 4000 sales, 2200 VAT output,
-- 5000 cost of sales, 1200 stock, 5410 breakage, 2240 deposits held.
INSERT INTO "RetailAccountRoleMapping" ("companyId", "role", "accountId", "updatedAt")
SELECT a."companyId", rc."role"::"RetailAccountRole", a."id", CURRENT_TIMESTAMP
FROM (VALUES
  ('SALES', '4000'),
  ('VAT_OUTPUT', '2200'),
  ('COST_OF_SALES', '5000'),
  ('STOCK', '1200'),
  ('BREAKAGE', '5410'),
  ('DEPOSITS_HELD', '2240')
) AS rc("role", "code")
JOIN "ChartOfAccount" a ON a."code" = rc."code"
WHERE EXISTS (
  SELECT 1 FROM "PostingRule" r
  WHERE r."companyId" = a."companyId" AND r."sourceType"::text LIKE 'RETAIL\_%'
)
ON CONFLICT DO NOTHING;

-- The retail rule lines that named those accounts now ask for the role.
UPDATE "PostingRuleLine" l
SET "accountSource" = 'ROLE_MAPPING',
    "accountRole" = m."role",
    "accountId" = NULL
FROM "PostingRule" r, "RetailAccountRoleMapping" m
WHERE l."ruleId" = r."id"
  AND r."sourceType"::text LIKE 'RETAIL\_%'
  AND m."companyId" = r."companyId"
  AND l."accountId" = m."accountId";
