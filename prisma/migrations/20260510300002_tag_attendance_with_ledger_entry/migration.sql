-- Epic 8: Tag Attendance rows created by import with goldLedgerEntryId (P1-10 fix)
--
-- ROLLBACK PROCEDURE:
--   1. ALTER TABLE "Attendance" DROP CONSTRAINT IF EXISTS "Attendance_goldLedgerEntryId_fkey";
--   2. DROP INDEX IF EXISTS "Attendance_goldLedgerEntryId_idx";
--   3. ALTER TABLE "Attendance" DROP COLUMN "goldLedgerEntryId";

ALTER TABLE "Attendance" ADD COLUMN "goldLedgerEntryId" TEXT;

ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_goldLedgerEntryId_fkey"
  FOREIGN KEY ("goldLedgerEntryId") REFERENCES "GoldLedgerEntry"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Attendance_goldLedgerEntryId_idx" ON "Attendance"("goldLedgerEntryId");
