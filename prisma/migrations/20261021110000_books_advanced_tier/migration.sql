-- Books: the $99 tier, `books.advanced` (design/books NOTES §5.3, approved 21 Oct).
-- Tax, Close the month and the Ledger. The resolver (`getCompanyFeatureMap`) grants it to a
-- workspace with the Books screens on the larger vertical rate (more than five billed members);
-- an admin can grant it by hand through `ADDON_BOOKS_ADVANCED`.
--
-- Data only, idempotent (every write is guarded), the same shape as `20261020110000_books_screens_addon`.
-- No table or column is added, so there are no reader grants to witness.

-- 1. The feature and its add-on, as `syncEntitlementCatalog` would write them.
INSERT INTO "PlatformFeature" ("id", "key", "name", "description", "domain", "defaultEnabled", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'books.advanced', 'Books advanced', 'Tax, closing the month and the ledger, on screen.', 'accounting', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "FeatureBundle" ("id", "code", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'ADDON_BOOKS_ADVANCED', 'Books advanced', 'Tax, closing the month and the ledger.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "FeatureBundleItem" ("id", "bundleId", "featureId", "createdAt")
SELECT gen_random_uuid()::text, b."id", f."id", CURRENT_TIMESTAMP
FROM "FeatureBundle" b, "PlatformFeature" f
WHERE b."code" = 'ADDON_BOOKS_ADVANCED' AND f."key" = 'books.advanced'
ON CONFLICT ("bundleId", "featureId") DO NOTHING;

-- 2. Nobody loses a page on the day it ships: a workspace that holds the screens today (the
--    add-on, or an explicit flag) and has more than five billed members gets the feature on,
--    unless it already has a flag for it. A member is billed when active and not a parent or
--    student portal account (`BILLED_MEMBER`, lib/platform/verticals.ts).
INSERT INTO "CompanyFeatureFlag" ("id", "companyId", "featureId", "isEnabled", "reason", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", adv."id", true, 'Books advanced: on the larger vertical rate on 21 Oct 2026', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c, "PlatformFeature" adv
WHERE adv."key" = 'books.advanced'
  AND (
    EXISTS (
      SELECT 1 FROM "CompanySubscriptionAddon" a JOIN "FeatureBundle" b ON b."id" = a."bundleId"
      WHERE a."companyId" = c."id" AND a."isEnabled" AND b."code" = 'ADDON_BOOKS_SCREENS')
    OR EXISTS (
      SELECT 1 FROM "CompanyFeatureFlag" f JOIN "PlatformFeature" p ON p."id" = f."featureId"
      WHERE f."companyId" = c."id" AND f."isEnabled" AND p."key" = 'books.screens'
        AND (f."expiresAt" IS NULL OR f."expiresAt" > CURRENT_TIMESTAMP)))
  AND (SELECT count(*) FROM "User" u WHERE u."companyId" = c."id" AND u."isActive" AND u."role" NOT IN ('PARENT', 'STUDENT')) > 5
ON CONFLICT ("companyId", "featureId") DO NOTHING;
