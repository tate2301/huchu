-- Epic 8: Add EditingLock table for lease-based import/resource locking
--
-- ROLLBACK PROCEDURE:
--   1. ALTER TABLE "User" DROP COLUMN IF EXISTS dummy; -- no User column added
--   2. DROP TABLE "EditingLock";

CREATE TABLE "EditingLock" (
  "resource"  TEXT        NOT NULL,
  "userId"    TEXT        NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EditingLock_pkey" PRIMARY KEY ("resource")
);

ALTER TABLE "EditingLock" ADD CONSTRAINT "EditingLock_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "EditingLock_userId_idx" ON "EditingLock"("userId");
CREATE INDEX "EditingLock_expiresAt_idx" ON "EditingLock"("expiresAt");
