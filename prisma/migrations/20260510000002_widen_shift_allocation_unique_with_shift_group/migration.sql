-- AlterTable: widen GoldShiftAllocation unique constraint
-- Replaces @@unique([siteId, date, shift]) with @@unique([siteId, date, shift, shiftGroupId])
-- so two parallel crews on the same shift label/date/site can each have their own allocation.
--
-- Postgres treats NULLs as distinct in unique constraints, so existing rows with
-- shiftGroupId=NULL are unaffected and cannot collide with each other.
--
-- Rollback procedure:
--   DROP INDEX IF EXISTS "GoldShiftAllocation_siteId_date_shift_shiftGroupId_key";
--   CREATE UNIQUE INDEX "GoldShiftAllocation_siteId_date_shift_key"
--     ON "GoldShiftAllocation"("siteId", "date", "shift");
DROP INDEX IF EXISTS "GoldShiftAllocation_siteId_date_shift_key";

CREATE UNIQUE INDEX "GoldShiftAllocation_siteId_date_shift_shiftGroupId_key"
  ON "GoldShiftAllocation"("siteId", "date", "shift", "shiftGroupId");
