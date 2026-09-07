-- One person, not two records.
--
-- `SchoolTeacherProfile` pointed at a `User` and nothing else, so Ms Banda the
-- teacher and Ms Banda the employee were unrelated rows. Payroll, leave,
-- next-of-kin and the national ID live on `Employee`; the timetable, the mark
-- book and the register live on the teacher profile. Nothing joined them, which
-- means a school answering "who is this and how do we reach her family" had to
-- do it by name.

ALTER TABLE "SchoolTeacherProfile" ADD COLUMN "employeeId" TEXT;

-- Unique: one employee is one teacher. Without it two profiles could point at
-- the same member of staff and the school would have two of her — on two
-- timetables, with two mark books. Nullable, and Postgres treats NULLs as
-- distinct, so the profiles that are not linked yet are unaffected.
CREATE UNIQUE INDEX "SchoolTeacherProfile_employeeId_key"
    ON "SchoolTeacherProfile" ("employeeId");

ALTER TABLE "SchoolTeacherProfile" ADD CONSTRAINT "SchoolTeacherProfile_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deliberately no backfill. The obvious one — match on name — is exactly the
-- guess this story exists to remove: two people called T Moyo is ordinary, and
-- a wrong link puts one teacher's payslip against another's classes. The
-- suggestions are computed at read time and a human presses the button.
