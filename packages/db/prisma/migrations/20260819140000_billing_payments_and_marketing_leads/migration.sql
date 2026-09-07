-- SS-4 / MK-3 — the tables self-serve payments and marketing leads need.
--
-- One migration, because both are the same shape of problem: something that
-- arrives from outside the platform and must not be lost or double-counted.
-- Neither table has any dependency on the other; they ship together only so
-- the tree gains its "record what strangers send us" storage in one step.
--
-- =============================================================================
-- SS-4.2  SubscriptionPayment
-- =============================================================================
--
-- A tenant paying for its own subscription is the first money the platform
-- takes directly, and `CompanySubscription.externalSubscriptionId` is the only
-- seam that exists for it — a single nullable id on the subscription. That is
-- enough to name the current gateway subscription and nothing else: it cannot
-- hold an attempt that failed, a payment that is still PENDING at the gateway,
-- or the term that was bought. This table is the ledger behind that seam.
--
-- `provider` is TEXT, not an enum. SS-4.1 has not chosen between Paynow,
-- Pesepay and ContiPay yet, and whichever wins, the losing adapters' rows still
-- have to be readable after a switch. An enum would force a schema migration
-- for a business decision that belongs in configuration.
--
-- `amount` is DECIMAL(14,2), never DOUBLE PRECISION. Every other money column
-- in this schema is DECIMAL(14,2) for the same reason: a float cent that
-- disagrees with what the gateway settled is a dispute with a customer over
-- their own subscription payment, and the customer is right.
--
-- `periodMonths` (1 | 3 | 12) is stored rather than derived from the period
-- dates because the annual 20% discount (PR-2.1) is applied against the term
-- actually purchased, and a receipt has to state that term even after the
-- subscription's dates have moved on.
--
-- The two uniques are the whole safety story for taking money:
--
--   (provider, providerReference)  A gateway retries a webhook until it sees a
--                                  2xx and re-delivers on its own schedule. A
--                                  replay carries the same gateway reference,
--                                  so it collides here instead of writing a
--                                  second payment for one transaction. This is
--                                  enforced in the database and not in the
--                                  handler, because two concurrent deliveries
--                                  both read "not seen yet" and both insert.
--   (idempotencyKey)               The same protection on the way in: a
--                                  double-submitted checkout (double click,
--                                  browser retry, mobile network) reuses the
--                                  key the client minted and cannot start a
--                                  second charge.
--
-- `subscriptionId` is nullable with ON DELETE SET NULL, not CASCADE: the record
-- of money received must outlive the subscription row it paid for. A tenant
-- that cancels and re-subscribes would otherwise lose the evidence of what it
-- already sent. It is also legitimately NULL for a payment initiated before the
-- subscription row exists. `companyId` cascades because a deleted tenant takes
-- its whole tree with it, and an orphaned payment naming no company is not a
-- record anyone can act on.
--
-- The index (companyId, status, createdAt) serves the tenant billing page —
-- "this company's payments, newest first, optionally filtered by status" — and
-- the past-due sweep in SS-5.3, which is that query with status pinned.
--
-- =============================================================================
-- SS-4.2  PaymentWebhookEvent
-- =============================================================================
--
-- Replay protection is the entire point of this table, and it is not redundant
-- with the payment unique above. A delivery that failed part-way through
-- processing left no payment row to collide with, so "have I seen this event?"
-- cannot be answered from `SubscriptionPayment` alone. Recording the delivery
-- first, then acting, makes the second delivery of one event fail its INSERT
-- and be answered 200 without re-applying the transition — which is what the
-- roadmap's standing instruction ("a replayed webhook must not
-- double-transition") requires.
--
-- `signatureVerified` is recorded, not assumed. An unverified delivery is
-- stored and refused rather than dropped silently, so a rotated signing key
-- shows up as a run of `false` rows to look at instead of as payments that
-- simply never arrived.
--
-- `payloadJson` is the body exactly as received. It is the only evidence
-- available when a gateway and our ledger disagree.
--
-- =============================================================================
-- MK-3.1  MarketingLead
-- =============================================================================
--
-- Today a demo request goes to a webhook or, if none is configured or the call
-- fails, to `console.error` — i.e. nowhere. This table is the durable landing
-- place so a submission is visible in-app even with the webhook down.
--
-- Deliberately NOT tenant-scoped: there is no `companyId` because a lead has no
-- company yet. That is the point of a lead. Adding one later would mean
-- inventing a tenant for every stranger who used the penalty calculator.
--
-- Every contact column is nullable on purpose. A calculator submission that
-- reaches us with only a phone number is worth more than the `console.error` it
-- used to become; requiring an email would discard it. `source` and `status`
-- are the only NOT NULLs beyond the key and timestamps.
--
-- `payloadJson` holds the tool's own inputs — the calculator's till count and
-- days are the sales context that makes a follow-up call specific rather than
-- generic — and keeps tool-shaped fields out of the table's columns as more
-- tools land.
--
-- Both indexes are (…, createdAt) because every read of this table is
-- time-ordered: the operator working the queue reads by status, newest first;
-- the founder measuring a campaign reads by source over a date range.
--
-- =============================================================================
-- Rollback (the whole file)
-- =============================================================================
--
--   DROP TABLE IF EXISTS "MarketingLead";
--   DROP TABLE IF EXISTS "PaymentWebhookEvent";
--   DROP TABLE IF EXISTS "SubscriptionPayment";
--
-- Purely additive: three new tables, no column added to and no constraint
-- changed on any existing table, so the rollback restores the previous schema
-- exactly. It is only safe while no real payment has been recorded — dropping
-- `SubscriptionPayment` destroys the only record of money taken, which no
-- gateway export reconciles for you.

-- -----------------------------------------------------------------------------
-- SS-4.2  SubscriptionPayment
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "SubscriptionPayment" (
    "id"                TEXT NOT NULL,
    "companyId"         TEXT NOT NULL,
    "subscriptionId"    TEXT,
    "provider"          TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "amount"            DECIMAL(14,2) NOT NULL,
    "currency"          TEXT NOT NULL DEFAULT 'USD',
    "status"            TEXT NOT NULL,
    "periodMonths"      INTEGER NOT NULL,
    "idempotencyKey"    TEXT NOT NULL,
    "rawPayloadJson"    TEXT,
    "paidAt"            TIMESTAMP(3),
    "failureReason"     TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionPayment_companyId_fkey'
  ) THEN
    ALTER TABLE "SubscriptionPayment"
      ADD CONSTRAINT "SubscriptionPayment_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- SET NULL: the payment survives the subscription it paid for. See the header.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionPayment_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "SubscriptionPayment"
      ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "CompanySubscription"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- A replayed webhook collides here rather than creating a second payment.
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_provider_providerReference_key"
  ON "SubscriptionPayment" ("provider", "providerReference");

-- A double-submitted checkout collides here rather than starting a second charge.
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_idempotencyKey_key"
  ON "SubscriptionPayment" ("idempotencyKey");

CREATE INDEX IF NOT EXISTS "SubscriptionPayment_companyId_status_createdAt_idx"
  ON "SubscriptionPayment" ("companyId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "SubscriptionPayment_subscriptionId_idx"
  ON "SubscriptionPayment" ("subscriptionId");

-- -----------------------------------------------------------------------------
-- SS-4.2  PaymentWebhookEvent
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "PaymentWebhookEvent" (
    "id"                TEXT NOT NULL,
    "provider"          TEXT NOT NULL,
    "providerEventId"   TEXT NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "payloadJson"       TEXT NOT NULL,
    "processedAt"       TIMESTAMP(3),
    "error"             TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- The replay guard: the second delivery of one event fails this INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentWebhookEvent_provider_providerEventId_key"
  ON "PaymentWebhookEvent" ("provider", "providerEventId");

-- Serves the "deliveries this provider has not processed yet" sweep.
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_provider_processedAt_idx"
  ON "PaymentWebhookEvent" ("provider", "processedAt");

-- -----------------------------------------------------------------------------
-- MK-3.1  MarketingLead — no companyId, by design. A lead has no tenant yet.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "MarketingLead" (
    "id"          TEXT NOT NULL,
    "source"      TEXT NOT NULL,
    "name"        TEXT,
    "email"       TEXT,
    "phone"       TEXT,
    "companyName" TEXT,
    "message"     TEXT,
    "payloadJson" TEXT,
    "pagePath"    TEXT,
    "utmSource"   TEXT,
    "utmMedium"   TEXT,
    "utmCampaign" TEXT,
    "status"      TEXT NOT NULL DEFAULT 'NEW',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MarketingLead_status_createdAt_idx"
  ON "MarketingLead" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "MarketingLead_source_createdAt_idx"
  ON "MarketingLead" ("source", "createdAt");
