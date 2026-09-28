-- The settings screens get the columns they were drawn against.
--
-- The management and preferences refactor drew five facts the database could
-- not answer. Four of them are one nullable column each; the fifth is a boolean
-- every sibling model already carries. Nothing here is a new subsystem, nothing
-- is backfilled, and every existing row stays valid the moment this applies.
--
--   1. A department has a head, a cost centre and a site.
--   2. A section has a code and belongs to a department.
--   3. A password has a date it was last changed.
--   4. A school period can be retired.
--
-- What is deliberately NOT here: no `Employee.sectionId` (a second assignment
-- axis on the employee is a product decision, not a column for one list
-- column); no invoice model for the workspace's own subscription (a document
-- issuer is weeks of work and `SubscriptionPayment` already holds the period,
-- the date and the amount); no `User.lastSeenAt` (the audit ledger already
-- records `auth.login.success` per sign-in, and a column would need a write on
-- every request to stay true); no per-user display-preference table (density,
-- open-on and reduce-motion are client rendering choices and stay in the
-- browser until they have to follow a person between devices).

-- 1. Where a department sits.
--
-- All three are nullable with no backfill, because none of them can be
-- inferred: an existing department has no head until somebody names one, no
-- cost centre until accounting picks one, and no site because company-wide is
-- the honest reading of a row that never had the field.
--
-- The head is an `Employee`, not a `User`. A head of department is a person on
-- the payroll; plenty of them never sign in, and `Employee.supervisorId` is a
-- reporting line between two people, not a statement about who runs a unit.
--
-- `CostCenter` is not new. It has existed for accounting since the ledger went
-- in, with `journalLines` and `postingRuleLines` hanging off it; this is the
-- first HR edge onto it, which is why it is a relation and not a text field.

ALTER TABLE "Department"
  ADD COLUMN "headEmployeeId" TEXT,
  ADD COLUMN "costCenterId"   TEXT,
  ADD COLUMN "siteId"         TEXT;

ALTER TABLE "Department"
  ADD CONSTRAINT "Department_headEmployeeId_fkey"
  FOREIGN KEY ("headEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Department"
  ADD CONSTRAINT "Department_costCenterId_fkey"
  FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Department"
  ADD CONSTRAINT "Department_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- No index on any of the three. They are read in the outward direction — a
-- department record joins to its head, its cost centre and its site by primary
-- key — and nothing asks a site for its departments. An index here would cost a
-- write on every department update and earn nothing back.

-- 2. What a section is called, and who runs it.
--
-- `Section` hung off a `Site` alone and had no short reference, so the
-- departments board could draw neither the code column nor the list. Both are
-- nullable: sections created before this have no code, and a section with no
-- department still belongs to its site, which is how every existing row reads.
--
-- The People count the board draws is NOT here. Counting people in a section
-- needs `Employee.sectionId` — a second assignment axis that would have to
-- appear on the employee form and its filters, and payroll groups by department
-- only. That is a product decision, not a migration.

ALTER TABLE "Section"
  ADD COLUMN "code"         TEXT,
  ADD COLUMN "departmentId" TEXT;

ALTER TABLE "Section"
  ADD CONSTRAINT "Section_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- This one is indexed, unlike the department's three: the department record
-- lists its sections, so the read genuinely runs from the foreign key inward.
CREATE INDEX "Section_departmentId_idx" ON "Section"("departmentId");

-- No unique index on `code`. `Section` has never had a unique constraint of any
-- kind — not even on name — and adding one now would reject a tenant's existing
-- duplicates at the first edit of an unrelated field.

-- 3. When the password was last set.
--
-- `User.password` is a bcrypt hash and nothing recorded when it was written, so
-- the profile board's "Changed <date>" line had nothing to print. Nullable with
-- no backfill: `createdAt` is when the account was made, which is a different
-- claim, and a user who has never changed their password shows no date rather
-- than a wrong one.
--
-- Both writers set it — the self-service change and the superadmin reset — so
-- an administrator resetting somebody else's password moves the date too.

ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- 4. A school period can be retired.
--
-- `SchoolPeriod` was the only school master-data model without retirement
-- state. Its siblings — academic years, terms, subjects, grading schemes,
-- rooms, conduct categories, exam boards, hostels, merit reasons, teacher
-- profiles, transport routes — all carry `isActive Boolean @default(true)`, so
-- this follows them rather than the `archivedAt` that CRM and retail use. The
-- permission was already built: "archive" is in `SCHOOL_FULL_ACTIONS` and the
-- periods page already computes `canArchive`. Only the column was missing.
--
-- `DEFAULT true` and `NOT NULL`, so every period that exists stays live.
--
-- One behavioural consequence rides on this: `findOverlappingPeriod` selects
-- every period for the term, so an archived 10:00 period would keep blocking a
-- new one forever unless that where-clause filters on `isActive`. The
-- application change goes with this migration, not after it.

ALTER TABLE "SchoolPeriod" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
