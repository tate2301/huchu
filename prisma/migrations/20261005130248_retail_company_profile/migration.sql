-- SET-01: the shop profile carries its WhatsApp number, whether it is
-- registered for VAT, and its default site. The default site moves out of the
-- JSON setup profile (`FiscalisationProviderConfig` RETAIL_SETUP_PROFILE).

ALTER TABLE "RetailShopProfile"
  ADD COLUMN "whatsapp" TEXT,
  ADD COLUMN "vatRegistered" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "defaultSiteId" TEXT;

ALTER TABLE "RetailShopProfile"
  ADD CONSTRAINT "RetailShopProfile_defaultSiteId_fkey"
  FOREIGN KEY ("defaultSiteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Copy each tenant's default site into its profile, creating the profile with
-- its defaults where none exists. Only a site of the same tenant is copied.
INSERT INTO "RetailShopProfile" ("companyId", "defaultSiteId", "updatedAt")
SELECT config."companyId", site."id", CURRENT_TIMESTAMP
FROM "FiscalisationProviderConfig" config
JOIN "Site" site
  ON site."companyId" = config."companyId"
 AND site."id" = substring(config."metadataJson" from '"defaultSiteId"\s*:\s*"([^"]+)"')
WHERE config."providerKey" = 'RETAIL_SETUP_PROFILE'
ON CONFLICT ("companyId") DO UPDATE SET "defaultSiteId" = EXCLUDED."defaultSiteId";

-- The JSON keeps only the default till until the device context replaces it
-- (SET-04); the default site is no longer read from it.
UPDATE "FiscalisationProviderConfig"
SET "metadataJson" = ("metadataJson"::jsonb - 'defaultSiteId')::text
WHERE "providerKey" = 'RETAIL_SETUP_PROFILE'
  AND "metadataJson" ~ '^\s*\{.*\}\s*$'
  AND "metadataJson" LIKE '%"defaultSiteId"%';
