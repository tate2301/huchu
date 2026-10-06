-- ADM-03: a till PIN locked by five wrong tries stays locked until somebody
-- sends a new one. `lockedAt` says when it locked; the fifteen-minute
-- `lockedUntil` goes. (`mustChange`, `issuedAt` and `issuedById` came with
-- retail_people.)
ALTER TABLE "RetailTillPin" ADD COLUMN "lockedAt" TIMESTAMP(3);

-- A lock still running keeps holding, from when it began.
UPDATE "RetailTillPin" SET "lockedAt" = "lockedUntil" - interval '15 minutes' WHERE "lockedUntil" > now();

-- A lock that ran out had given its tries back.
UPDATE "RetailTillPin" SET "failedAttempts" = 0 WHERE "lockedUntil" IS NOT NULL AND "lockedUntil" <= now();

ALTER TABLE "RetailTillPin" DROP COLUMN "lockedUntil";
