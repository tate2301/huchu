-- The admissions pipeline.
--
-- Applicants were being kept as `SchoolStudent` rows with status APPLICANT,
-- which makes every count of the school wrong until somebody remembers the
-- filter, and gives a child who may never arrive a class, a fee account and a
-- place in a register.

CREATE TYPE "SchoolApplicationStage" AS ENUM (
    'ENQUIRY', 'APPLIED', 'ASSESSMENT', 'WAITLISTED', 'OFFERED',
    'ACCEPTED', 'ENROLLED', 'DECLINED', 'WITHDRAWN'
);

CREATE TABLE "SchoolApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "gender" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "guardianEmail" TEXT,
    "previousSchool" TEXT,
    "source" TEXT,
    "appliedForClassId" TEXT,
    "intendedTermId" TEXT,
    "stage" "SchoolApplicationStage" NOT NULL DEFAULT 'ENQUIRY',
    "assessmentScore" DECIMAL(5,2),
    "assessmentAt" TIMESTAMP(3),
    "offeredAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "notes" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolApplication_companyId_applicationNo_key"
    ON "SchoolApplication" ("companyId", "applicationNo");

-- One child cannot be enrolled twice off two applications. NULLs are distinct
-- in Postgres, so everything still in the pipeline is unaffected.
CREATE UNIQUE INDEX "SchoolApplication_studentId_key"
    ON "SchoolApplication" ("studentId");

CREATE INDEX "SchoolApplication_companyId_stage_idx"
    ON "SchoolApplication" ("companyId", "stage");
CREATE INDEX "SchoolApplication_companyId_appliedForClassId_stage_idx"
    ON "SchoolApplication" ("companyId", "appliedForClassId", "stage");
CREATE INDEX "SchoolApplication_companyId_lastName_firstName_idx"
    ON "SchoolApplication" ("companyId", "lastName", "firstName");

-- An application at ENROLLED with no student is a place given to nobody, and
-- the screens read the stage rather than the join.
ALTER TABLE "SchoolApplication"
    ADD CONSTRAINT "SchoolApplication_enrolled_has_student_check"
    CHECK ("stage" <> 'ENROLLED' OR "studentId" IS NOT NULL);

-- An offer with no date is one nobody can chase, and an expiry before the offer
-- is a typo that would expire it the moment it was made.
ALTER TABLE "SchoolApplication"
    ADD CONSTRAINT "SchoolApplication_offer_dates_check"
    CHECK ("offerExpiresAt" IS NULL OR "offeredAt" IS NULL
           OR "offerExpiresAt" >= "offeredAt");

ALTER TABLE "SchoolApplication"
    ADD CONSTRAINT "SchoolApplication_assessmentScore_check"
    CHECK ("assessmentScore" IS NULL
           OR ("assessmentScore" >= 0 AND "assessmentScore" <= 100));

CREATE TABLE "SchoolApplicationEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStage" "SchoolApplicationStage",
    "toStage" "SchoolApplicationStage" NOT NULL,
    "actorUserId" TEXT,
    "comment" TEXT,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolApplicationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolApplicationEvent_companyId_applicationId_actedAt_idx"
    ON "SchoolApplicationEvent" ("companyId", "applicationId", "actedAt");

ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_appliedForClassId_fkey"
    FOREIGN KEY ("appliedForClassId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_intendedTermId_fkey"
    FOREIGN KEY ("intendedTermId") REFERENCES "SchoolTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolApplication" ADD CONSTRAINT "SchoolApplication_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchoolApplicationEvent" ADD CONSTRAINT "SchoolApplicationEvent_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolApplicationEvent" ADD CONSTRAINT "SchoolApplicationEvent_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "SchoolApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
