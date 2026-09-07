-- Bed allocation rules the application was asking politely for.
--
-- The allocation route already checked whether a bed was taken and whether a
-- student already had a place, then wrote. Between the check and the write is
-- where two wardens at two desks put two girls in the same bed, and no amount
-- of care in the handler closes that window.

-- One live allocation per bed. Partial, because a bed is allocated again every
-- year: ended allocations (`endDate` set, or a non-ACTIVE status) are history
-- and must not block the next one. `bedId` is nullable — an allocation to a
-- hostel with no bed chosen yet is legitimate — and Postgres treats NULLs as
-- distinct, so those rows are unaffected.
CREATE UNIQUE INDEX "SchoolBoardingAllocation_live_bed_key"
    ON "SchoolBoardingAllocation" ("bedId")
    WHERE "status" = 'ACTIVE' AND "endDate" IS NULL AND "bedId" IS NOT NULL;

-- One live allocation per student per term. A child in two hostels is a child
-- nobody can find at ten o'clock at night.
CREATE UNIQUE INDEX "SchoolBoardingAllocation_live_student_term_key"
    ON "SchoolBoardingAllocation" ("companyId", "studentId", "termId")
    WHERE "status" = 'ACTIVE' AND "endDate" IS NULL;

-- `genderPolicy` is a free string with a default of 'MIXED', so nothing stopped
-- a hostel being set to 'Girls', 'girls' or 'FEMALES' — three values the
-- allocation check would each read differently, and the failure is silent
-- because an unrecognised policy looks like no policy.
UPDATE "SchoolHostel"
SET "genderPolicy" = CASE
    WHEN upper("genderPolicy") IN ('MALE', 'M', 'BOYS', 'BOY') THEN 'MALE'
    WHEN upper("genderPolicy") IN ('FEMALE', 'F', 'GIRLS', 'GIRL') THEN 'FEMALE'
    ELSE 'MIXED'
END;

ALTER TABLE "SchoolHostel"
    ADD CONSTRAINT "SchoolHostel_genderPolicy_check"
    CHECK ("genderPolicy" IN ('MALE', 'FEMALE', 'MIXED'));

ALTER TABLE "SchoolHostel"
    ADD CONSTRAINT "SchoolHostel_capacity_check"
    CHECK ("capacity" IS NULL OR "capacity" > 0);

ALTER TABLE "SchoolHostelRoom"
    ADD CONSTRAINT "SchoolHostelRoom_capacity_check"
    CHECK ("capacity" IS NULL OR "capacity" > 0);
