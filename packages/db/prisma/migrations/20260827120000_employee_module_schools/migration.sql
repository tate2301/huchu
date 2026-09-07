-- The school's own staff become a module of their own.
--
-- Non-teaching school employees — the bursar, the groundsman, the drivers —
-- are `Employee` rows like anyone else, so payroll, leave and a final payslip
-- all keep working the way HR already built them. What was missing was a way
-- to say *whose* staff they are: `EmployeeModuleAssignment.module` is the
-- field that answers "show me our staff" on a tenant that also runs a mine,
-- and `SCHOOLS` was not one of the values it could hold.
--
-- The application has been passing "SCHOOLS" for a while and getting away with
-- it at compile time behind `as unknown as EmployeeModule[]`; at runtime
-- Postgres would have rejected the value. This adds it for real.
--
-- `IF NOT EXISTS` because the enum may already carry the label on a database
-- that was pushed rather than migrated.

ALTER TYPE "EmployeeModule" ADD VALUE IF NOT EXISTS 'SCHOOLS';
