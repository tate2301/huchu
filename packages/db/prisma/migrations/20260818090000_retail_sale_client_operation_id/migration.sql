-- A till's retry key stops being the number on the receipt.
--
-- The POS minted its own sale number for every ring-up — `RSL-1787005374335700`,
-- a timestamp with three random digits — and the server honoured it. Two things
-- were riding on one field:
--
--   1. the number the customer reads off the receipt, which should be the next
--      one in the shop's sequence (`RSL-0042`), allocated by `reserveIdentifier`;
--   2. the client's idempotency key, which is what saves a Harare bottle store on
--      a bad line: if the POST lands but the response never comes back, the till
--      retries, the unique index rejects the duplicate, and the customer is not
--      charged twice.
--
-- `clientOperationId` takes over the second job so the first can go back to the
-- sequence. It is the till's own key, never displayed, unique per company, and
-- null for every sale that has no client behind it — seeds, refunds, voids.
-- Postgres counts nulls as distinct, so any number of those coexist.

ALTER TABLE "RetailSale" ADD COLUMN "clientOperationId" TEXT;

CREATE UNIQUE INDEX "RetailSale_companyId_clientOperationId_key"
  ON "RetailSale"("companyId", "clientOperationId");

-- The sequence has to be told where to start, because the numbers already in the
-- table would poison it.
--
-- `reserveIdentifier` seeds a scope's counter, on first use, from the highest
-- existing code — and `RSL-1787005374335700` parses to 1.7e15, which does not fit
-- in `IdSequence.lastNumber` (INTEGER). Any shop that had rung up a POS sale but
-- never reserved a retail-sale identifier would have hit "integer out of range"
-- on its first refund, since refunds allocate through the same path.
--
-- So seed every scope that has sales, counting only the well-formed codes: at most
-- nine digits, which no real sequence reaches and no `Date.now()` is short enough
-- to be mistaken for. Scopes that already have a counter keep it.
--
-- Existing sales keep their ugly numbers. They are printed on receipts, quoted in
-- inventory movement notes and named in accounting journal descriptions; renumbering
-- them would make those references lie. Only what happens from now on is fixed.

INSERT INTO "IdSequence" ("id", "companyId", "entityKey", "scopeKey", "lastNumber", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::TEXT,
  sale."companyId",
  'RETAIL_SALE',
  sale."siteId",
  COALESCE(
    MAX(
      CASE
        WHEN sale."saleNo" ~ '^RSL-[0-9]{1,9}$'
        THEN CAST(SUBSTRING(sale."saleNo" FROM 5) AS INTEGER)
      END
    ),
    0
  ),
  NOW(),
  NOW()
FROM "RetailSale" sale
GROUP BY sale."companyId", sale."siteId"
ON CONFLICT ("companyId", "entityKey", "scopeKey") DO NOTHING;
