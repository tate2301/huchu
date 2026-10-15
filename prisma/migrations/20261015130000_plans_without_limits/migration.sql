-- A workspace pays per vertical, with no cap on sites, tills or members, so
-- plans no longer carry limits.
ALTER TABLE "SubscriptionPlan" DROP COLUMN "maxSites",
DROP COLUMN "maxUsers",
DROP COLUMN "maxTills";
