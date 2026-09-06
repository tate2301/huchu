-- AlterTable: add nullable shiftGroupId column to GoldShiftAllocation.
-- Denormalises ShiftReport.shiftGroupId onto the allocation row so that
-- a DB-level unique constraint can include it (Postgres unique constraints
-- must reference columns on the same table).
--
-- The widened unique constraint lands in a separate migration
-- (20260510000002_widen_shift_allocation_unique_with_shift_group) that
-- runs AFTER an optional backfill step.
--
-- Rollback procedure:
--   ALTER TABLE "GoldShiftAllocation" DROP CONSTRAINT "GoldShiftAllocation_shiftGroupId_fkey";
--   ALTER TABLE "GoldShiftAllocation" DROP COLUMN "shiftGroupId";
ALTER TABLE "GoldShiftAllocation" ADD COLUMN "shiftGroupId" TEXT;

-- AddForeignKey: SET NULL on shift-group delete so the audit row is
-- preserved even if the group is removed (the allocation still has its
-- shiftReportId for traceability).
ALTER TABLE "GoldShiftAllocation" ADD CONSTRAINT "GoldShiftAllocation_shiftGroupId_fkey"
  FOREIGN KEY ("shiftGroupId") REFERENCES "ShiftGroup"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
