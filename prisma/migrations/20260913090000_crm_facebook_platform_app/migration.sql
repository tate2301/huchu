-- One Meta app for everybody, so a customer never sees a credential.
--
-- The first cut of this integration asked each tenant for a Meta app id, an
-- app secret and a Page access token. Getting the third means running three
-- Graph API calls by hand, which is a wall rather than a learning curve for
-- the people this feature is for. Facebook Login does those same three calls
-- server-side, but only if one app serves everyone — an OAuth client id is
-- deployment config, not something a customer types.
--
-- So three columns stop being per-tenant facts and become deployment config
-- (FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_WEBHOOK_VERIFY_TOKEN):
--
--   appId          the app is ours now
--   appSecretEnc   likewise, and it signs every delivery
--   verifyToken    one app has one webhook, so one handshake token
--
-- `callbackToken` goes with them. It existed to route a delivery when every
-- tenant had its own callback URL. A Meta app has exactly one webhook URL, so
-- there is now one callback for the whole deployment and a delivery is routed
-- by the only id it carries: `entry[].id`, the Page.
--
-- Which forces `pageId` to be globally unique rather than unique per company.
-- Two tenants claiming one Page would make the owner of a lead a coin toss,
-- and there is no second id in the payload to break the tie. Connecting a Page
-- another workspace already holds is refused at the API instead.
--
-- `authorizedByName` is new: the Facebook user whose authorisation produced
-- the Page token. When a token stops working — a password change, someone
-- leaving — that name is the only record of who has to reconnect it.
--
-- Existing connections cannot survive this. Their tokens were issued to a
-- different Meta app, so they would fail signature verification on the first
-- delivery and read as silently broken. Better to drop them and have the
-- customer press one button than to leave rows that look connected and are
-- not. The delivery ledger is kept either way — it is the record of which
-- leads came from where, and it outlives any credential.

DELETE FROM "CrmFacebookConnection";

DROP INDEX IF EXISTS "CrmFacebookConnection_callbackToken_key";
DROP INDEX IF EXISTS "CrmFacebookConnection_companyId_pageId_key";

ALTER TABLE "CrmFacebookConnection" DROP COLUMN "callbackToken";
ALTER TABLE "CrmFacebookConnection" DROP COLUMN "appId";
ALTER TABLE "CrmFacebookConnection" DROP COLUMN "appSecretEnc";
ALTER TABLE "CrmFacebookConnection" DROP COLUMN "verifyToken";

ALTER TABLE "CrmFacebookConnection" ADD COLUMN "authorizedByName" TEXT;

-- One Page, one workspace. This is the routing guarantee the single callback
-- URL depends on, so it is a constraint rather than a convention.
CREATE UNIQUE INDEX "CrmFacebookConnection_pageId_key" ON "CrmFacebookConnection"("pageId");
