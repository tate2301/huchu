-- Exactly one academic year may be active per company, and exactly one term
-- may be active per academic year. Before this, "the current term" was resolved
-- by findFirst({ isActive: true }) at a dozen call sites, which quietly picked
-- an arbitrary row whenever two were left active. Partial unique indexes make
-- that state unrepresentable rather than merely discouraged, so
-- lib/schools/calendar.ts can trust a single row.

CREATE UNIQUE INDEX "SchoolAcademicYear_companyId_active_key"
    ON "SchoolAcademicYear" ("companyId")
    WHERE "isActive" = true;

CREATE UNIQUE INDEX "SchoolTerm_academicYearId_active_key"
    ON "SchoolTerm" ("academicYearId")
    WHERE "isActive" = true;

-- A term must sit inside its academic year, and both must run forwards.
ALTER TABLE "SchoolAcademicYear"
    ADD CONSTRAINT "SchoolAcademicYear_dates_ordered" CHECK ("startDate" < "endDate");

ALTER TABLE "SchoolTerm"
    ADD CONSTRAINT "SchoolTerm_dates_ordered" CHECK ("startDate" < "endDate");
