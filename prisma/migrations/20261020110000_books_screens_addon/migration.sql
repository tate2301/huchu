-- Books P5b (design/core-modules/spec/books-final.md §1, §7 D1): the books engine is
-- always on, and the Books screens are the add-on.
--
-- No new table or column: the catalogue rows the code reads, and the grant that keeps
-- the screens in every workspace that had accounting on 20 Oct (§9 default 1).
-- Idempotent: every write is guarded, so running it twice changes nothing.

-- 1. `accounting.core` is the engine: on in every workspace (the code forces it on
--    whatever a flag says; `alwaysOn` in lib/platform/feature-catalog.ts).
UPDATE "PlatformFeature"
SET "defaultEnabled" = true,
    "name" = 'Books engine',
    "description" = 'The ledger every module posts to, and the accountant export. On in every workspace.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'accounting.core';

-- 2. `books.screens` and its add-on, as `syncEntitlementCatalog` would write them.
INSERT INTO "PlatformFeature" ("id", "key", "name", "description", "domain", "defaultEnabled", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'books.screens', 'Books screens', 'Invoices and bills, bank matching, VAT returns, the month''s close and the ledger, on screen.', 'accounting', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "FeatureBundle" ("id", "code", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'ADDON_BOOKS_SCREENS', 'Books screens', 'The Books pages: invoices and bills, bank matching, VAT returns, the month''s close and the ledger.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "FeatureBundleItem" ("id", "bundleId", "featureId", "createdAt")
SELECT gen_random_uuid()::text, b."id", f."id", CURRENT_TIMESTAMP
FROM "FeatureBundle" b, "PlatformFeature" f
WHERE b."code" = 'ADDON_BOOKS_SCREENS' AND f."key" = 'books.screens'
ON CONFLICT ("bundleId", "featureId") DO NOTHING;

-- 3. Who had accounting today, read the way `getCompanyFeatureMap` reads it: an
--    explicit `accounting.core` flag decides; otherwise the engine's add-on, or a plan
--    whose tier carries it (every tier does, under every code it was ever sold as).
CREATE TEMP TABLE "_d1_core_flag" AS
SELECT f."companyId", f."isEnabled"
FROM "CompanyFeatureFlag" f
JOIN "PlatformFeature" pf ON pf."id" = f."featureId"
WHERE pf."key" = 'accounting.core' AND (f."expiresAt" IS NULL OR f."expiresAt" > CURRENT_TIMESTAMP);

CREATE TEMP TABLE "_d1_had_accounting" AS
SELECT c."id" AS "companyId"
FROM "Company" c
WHERE NOT EXISTS (SELECT 1 FROM "_d1_core_flag" x WHERE x."companyId" = c."id" AND NOT x."isEnabled")
  AND (
    EXISTS (SELECT 1 FROM "_d1_core_flag" x WHERE x."companyId" = c."id" AND x."isEnabled")
    OR EXISTS (
      SELECT 1 FROM "CompanySubscriptionAddon" a
      JOIN "FeatureBundle" b ON b."id" = a."bundleId"
      WHERE a."companyId" = c."id" AND a."isEnabled" AND b."code" = 'ADDON_ACCOUNTING_CORE')
    OR EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (s."companyId") s."companyId", p."code"
        FROM "CompanySubscription" s JOIN "SubscriptionPlan" p ON p."id" = s."planId"
        ORDER BY s."companyId", s."updatedAt" DESC
      ) latest
      WHERE latest."companyId" = c."id"
        AND upper(trim(latest."code")) IN (
          'FISCAL', 'START', 'GROW', 'SCALE', 'GOLD_EDITION', 'ENTERPRISE',
          'BASIC', 'STANDARD', 'MEDIUM', 'SOLO', 'STARTER', 'LAUNCH', 'SMALL', 'GROWTH', 'LARGE', 'BUSINESS', 'GOLD'))
  );

-- 4. They keep the screens: the add-on, granted.
INSERT INTO "CompanySubscriptionAddon" ("id", "companyId", "bundleId", "isEnabled", "reason", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, h."companyId", b."id", true, 'D1: kept the Books screens it had on 20 Oct 2026', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_d1_had_accounting" h, "FeatureBundle" b
WHERE b."code" = 'ADDON_BOOKS_SCREENS'
ON CONFLICT ("companyId", "bundleId") DO NOTHING;

-- 5. A workspace that had accounting switched off by hand gains the engine (it is never
--    off now) but not the screens its tier now carries: an explicit "off", as it had.
INSERT INTO "CompanyFeatureFlag" ("id", "companyId", "featureId", "isEnabled", "reason", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, x."companyId", f."id", false, 'D1: had no Books on 20 Oct 2026', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_d1_core_flag" x, "PlatformFeature" f
WHERE NOT x."isEnabled" AND f."key" = 'books.screens'
ON CONFLICT ("companyId", "featureId") DO NOTHING;

DROP TABLE "_d1_had_accounting";
DROP TABLE "_d1_core_flag";
