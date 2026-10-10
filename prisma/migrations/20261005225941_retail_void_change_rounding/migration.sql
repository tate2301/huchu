-- SET-05, W-05: a void reverses its sale's change rounding, and every shop
-- whose rules post change rounding has the account it posts to.

-- Cash over short (5420), as the defaults pack writes it, for any shop with a
-- retail sale or void rule and no 5420 in its chart. Without it the rule lines
-- below would be skipped and a sale whose ZiG change rounds would not balance.
INSERT INTO "ChartOfAccount" ("id", "companyId", "code", "name", "type", "category", "systemManaged", "updatedAt")
SELECT gen_random_uuid()::text, c."companyId", '5420', 'Cash Over Short', 'EXPENSE', 'Cash', true, now()
FROM (
  SELECT DISTINCT r."companyId" FROM "PostingRule" r
  WHERE (r."sourceType" = 'RETAIL_SALE' AND r."name" = 'Retail sale - perpetual inventory')
     OR (r."sourceType" = 'RETAIL_VOID' AND r."name" = 'Retail void - perpetual inventory')
) c
WHERE NOT EXISTS (SELECT 1 FROM "ChartOfAccount" a WHERE a."companyId" = c."companyId" AND a."code" = '5420');

-- The change rounding lines on every retail sale rule still without them (its
-- shop had no 5420 when retail_change_rounding ran) and on every retail void
-- rule, which runs inverted: what a sale credited, its void debits.
INSERT INTO "PostingRuleLine" ("id", "ruleId", "accountId", "direction", "basis", "allocationType", "allocationValue",
  "repeatMode", "accountSource", "valuePath", "memoTemplate", "sortOrder")
SELECT gen_random_uuid()::text, r."id", a."id", line.direction::"PostingDirection", 'DEDUCTIONS', 'PERCENT', 100,
  'NONE', 'FIXED_ACCOUNT', line.path, '{description} / change rounding', line.sort
FROM "PostingRule" r
JOIN "ChartOfAccount" a ON a."companyId" = r."companyId" AND a."code" = '5420' AND a."nodeType" = 'LEDGER'
CROSS JOIN (VALUES ('CREDIT', 'changeRoundingKept', 36), ('DEBIT', 'changeRoundingGiven', 37)) AS line(direction, path, sort)
WHERE ((r."sourceType" = 'RETAIL_SALE' AND r."name" = 'Retail sale - perpetual inventory')
    OR (r."sourceType" = 'RETAIL_VOID' AND r."name" = 'Retail void - perpetual inventory'))
  AND NOT EXISTS (SELECT 1 FROM "PostingRuleLine" l WHERE l."ruleId" = r."id" AND l."valuePath" = line.path);
