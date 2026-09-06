-- Give the timetable's unique indexes the names the schema generates.
--
-- 20260804160000_school_timetable named them by hand — `..._lesson_slot_key`
-- and `..._teacher_slot_key` — which read better but are not what Prisma
-- derives from @@unique. A database built from the history therefore drifted
-- from one built by `db push`, and `prisma migrate diff` reported the schema as
-- out of date on every run.
--
-- The rename is guarded: a db-push database already carries the generated
-- names, so the ALTER would fail there with "index does not exist".

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'SchoolTimetableSlot_lesson_slot_key') THEN
    ALTER INDEX "SchoolTimetableSlot_lesson_slot_key" RENAME TO "SchoolTimetableSlot_companyId_termId_dayOfWeek_periodId_cla_key";
  END IF;
END $$;

-- RenameIndex
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'SchoolTimetableSlot_teacher_slot_key') THEN
    ALTER INDEX "SchoolTimetableSlot_teacher_slot_key" RENAME TO "SchoolTimetableSlot_companyId_termId_dayOfWeek_periodId_tea_key";
  END IF;
END $$;
