-- SET-05, W-05: change follows the ZiG rule, and the books say so.

-- The ZiG notes a sale handed back as change, rounded to the shop's step.
-- `changeAmount` now holds what all the change was worth, not what was owed.
ALTER TABLE "RetailSale" ADD COLUMN "changeZig" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- What rounding the ZiG change leaves goes to cash over short in the sale's
-- own journal: kept by the shop (a credit), or given to the customer (a debit).
-- Added to every shop's retail sale rule that has the account.
INSERT INTO "PostingRuleLine" ("id", "ruleId", "accountId", "direction", "basis", "allocationType", "allocationValue",
  "repeatMode", "accountSource", "valuePath", "memoTemplate", "sortOrder")
SELECT gen_random_uuid()::text, r."id", a."id", line.direction::"PostingDirection", 'DEDUCTIONS', 'PERCENT', 100,
  'NONE', 'FIXED_ACCOUNT', line.path, '{description} / change rounding', line.sort
FROM "PostingRule" r
JOIN "ChartOfAccount" a ON a."companyId" = r."companyId" AND a."code" = '5420' AND a."nodeType" = 'LEDGER'
CROSS JOIN (VALUES ('CREDIT', 'changeRoundingKept', 36), ('DEBIT', 'changeRoundingGiven', 37)) AS line(direction, path, sort)
WHERE r."sourceType" = 'RETAIL_SALE'
  AND r."name" = 'Retail sale - perpetual inventory'
  AND NOT EXISTS (SELECT 1 FROM "PostingRuleLine" l WHERE l."ruleId" = r."id" AND l."valuePath" = line.path);
