-- Epic 6: Denormalise companyId onto GoldPour
-- Phase A: Add nullable companyId column + Company relation
-- Phase B: Backfill from site.companyId (see scripts/backfill-gold-pour-company-id.ts)
-- Phase C: NOT NULL enforcement deferred until backfill verified in production
-- Phase D (partial): Add (companyId, pourBarId) compound unique. The global pourBarId
--   unique is KEPT for backward-compat until domain-backend migrates API lookups.
--   Phase D full (drop global unique) is a follow-on ticket for domain-backend.
-- Phase E: Add (companyId, pourDate DESC) index for list queries
--
-- Rollback procedure:
--   1. DROP INDEX IF EXISTS "GoldPour_companyId_pourDate_idx";
--   2. DROP INDEX IF EXISTS "GoldPour_companyId_pourBarId_key";
--   3. ALTER TABLE "GoldPour" DROP CONSTRAINT IF EXISTS "GoldPour_companyId_fkey";
--   4. ALTER TABLE "GoldPour" DROP COLUMN "companyId";

-- Phase A: add nullable column
ALTER TABLE "GoldPour" ADD COLUMN "companyId" TEXT;

-- Phase A: add FK constraint
ALTER TABLE "GoldPour"
  ADD CONSTRAINT "GoldPour_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase D (partial): add compound tenant-scoped unique
-- Global pourBarId unique is intentionally kept until domain-backend
-- updates findUnique({ where: { pourBarId } }) call sites.
CREATE UNIQUE INDEX "GoldPour_companyId_pourBarId_key" ON "GoldPour"("companyId", "pourBarId");

-- Phase E: compound index for hot list queries
CREATE INDEX "GoldPour_companyId_pourDate_idx" ON "GoldPour"("companyId", "pourDate" DESC);
