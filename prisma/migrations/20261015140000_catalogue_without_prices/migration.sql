-- A workspace pays per vertical. Plans, bundles and features carry no price.

-- A billable feature started off however its default read; it keeps starting
-- off now that nothing is billable.
UPDATE "PlatformFeature" SET "defaultEnabled" = false WHERE "isBillable" = true;

ALTER TABLE "PlatformFeature" DROP COLUMN "isBillable",
DROP COLUMN "monthlyPrice";

ALTER TABLE "FeatureBundle" DROP COLUMN "monthlyPrice",
DROP COLUMN "additionalSiteMonthlyPrice";

ALTER TABLE "SubscriptionPlan" DROP COLUMN "monthlyPrice",
DROP COLUMN "annualPrice";
