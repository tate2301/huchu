-- Facebook Lead Ads, as its own seam rather than another API key.
--
-- `CrmApiKey` already carries the idea of "leads arrive from somewhere else",
-- and its comment even names Facebook as the example. It cannot serve this
-- case, for three reasons that are all Meta's:
--
--   1. Meta's webhook sends its own envelope to its own callback URL. There is
--      no header to put `x-api-key` in.
--   2. It authenticates with an HMAC-SHA256 of the delivered bytes, keyed by
--      the Meta app secret. So the credential is a signing key we have to
--      keep, not a token we can store as a hash and compare.
--   3. The delivery contains a `leadgen_id` and nothing the customer typed.
--      The answers come back out of the Graph API with a Page access token,
--      which is a second secret, held on our side, that has to be replayable.
--
-- Hence two tables:
--
--   CrmFacebookConnection  one Facebook Page, its app, and the three secrets
--                          that let us verify a delivery and read a lead.
--   CrmFacebookLeadEvent   one delivery, recorded before it is acted on, with
--                          the unique key that makes Meta's retries a no-op.
--
-- Scoped per Page rather than per app: the Page is the unit a customer owns,
-- and `entry[].id` is the only id in a delivery, so it is what routes to a
-- tenant. Several tenants may run several Meta apps; none of them share a row.
--
-- The two secrets are stored encrypted (AES-256-GCM, keyed by
-- CRM_INTEGRATION_ENCRYPTION_KEY) rather than hashed. A hash is right for
-- `CrmApiKey`, whose key we only ever compare; it is useless for a value we
-- have to present back to Meta on every lead.

CREATE TABLE "CrmFacebookConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "callbackToken" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "appId" TEXT NOT NULL,
    "appSecretEnc" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "pageAccessTokenEnc" TEXT NOT NULL,
    "formIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultChannel" "CrmLeadChannel" NOT NULL DEFAULT 'ADS',
    "defaultSourceLabel" TEXT,
    "defaultAssigneeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFacebookConnection_pkey" PRIMARY KEY ("id")
);

-- The callback token is looked up on every delivery, and it is the whole
-- routing decision, so it is unique and indexed by that uniqueness.
CREATE UNIQUE INDEX "CrmFacebookConnection_callbackToken_key" ON "CrmFacebookConnection"("callbackToken");

-- One connection per Page per tenant: two rows for the same Page would make a
-- delivery ambiguous, and duplicating the lead is the least bad thing that
-- could then happen.
CREATE UNIQUE INDEX "CrmFacebookConnection_companyId_pageId_key" ON "CrmFacebookConnection"("companyId", "pageId");

CREATE INDEX "CrmFacebookConnection_companyId_isActive_idx" ON "CrmFacebookConnection"("companyId", "isActive");

CREATE TABLE "CrmFacebookLeadEvent" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "companyId" TEXT,
    "leadgenId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "formId" TEXT,
    "adId" TEXT,
    "adgroupId" TEXT,
    "campaignId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "payloadJson" TEXT NOT NULL,
    "fieldsJson" TEXT,
    "leadId" TEXT,
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmFacebookLeadEvent_pkey" PRIMARY KEY ("id")
);

-- The point of the table: the second delivery of one submission fails this
-- insert, and is answered 200 without creating a second lead.
CREATE UNIQUE INDEX "CrmFacebookLeadEvent_pageId_leadgenId_key" ON "CrmFacebookLeadEvent"("pageId", "leadgenId");

CREATE INDEX "CrmFacebookLeadEvent_companyId_createdAt_idx" ON "CrmFacebookLeadEvent"("companyId", "createdAt");
CREATE INDEX "CrmFacebookLeadEvent_connectionId_status_idx" ON "CrmFacebookLeadEvent"("connectionId", "status");

ALTER TABLE "CrmFacebookConnection"
  ADD CONSTRAINT "CrmFacebookConnection_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmFacebookConnection"
  ADD CONSTRAINT "CrmFacebookConnection_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmFacebookConnection"
  ADD CONSTRAINT "CrmFacebookConnection_defaultAssigneeId_fkey"
  FOREIGN KEY ("defaultAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A deleted connection does not delete its deliveries. The ledger is the
-- record of which leads came from where, and it outlives the credentials.
ALTER TABLE "CrmFacebookLeadEvent"
  ADD CONSTRAINT "CrmFacebookLeadEvent_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "CrmFacebookConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmFacebookLeadEvent"
  ADD CONSTRAINT "CrmFacebookLeadEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
