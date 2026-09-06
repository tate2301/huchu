-- Assessments and the grading scheme that turns them into a term mark.
--
-- Before this a `SchoolResultLine` carried a hand-typed score and a hand-typed
-- grade, with nothing underneath either: no record of the tests the mark came
-- from, and no table saying what 68 is called.

CREATE TYPE "SchoolAssessmentKind" AS ENUM ('CONTINUOUS', 'EXAM', 'PRACTICAL');
CREATE TYPE "SchoolAssessmentStatus" AS ENUM ('OPEN', 'LOCKED');

CREATE TABLE "SchoolGradingScheme" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "continuousWeight" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "examWeight" DECIMAL(5,2) NOT NULL DEFAULT 70,
    "passMark" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolGradingScheme_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolGradingScheme_companyId_code_key"
    ON "SchoolGradingScheme" ("companyId", "code");
CREATE INDEX "SchoolGradingScheme_companyId_isActive_idx"
    ON "SchoolGradingScheme" ("companyId", "isActive");

-- One default scheme per school. Partial, because Postgres treats repeated
-- `false` as ordinary duplicates and only the `true` rows need to be unique —
-- the same shape as the single-active-term index in the first schools
-- migration.
CREATE UNIQUE INDEX "SchoolGradingScheme_companyId_default_key"
    ON "SchoolGradingScheme" ("companyId")
    WHERE "isDefault";

-- A scheme whose halves do not add to 100 produces term marks that are quietly
-- short, and nothing downstream can tell that from a cohort that did badly.
ALTER TABLE "SchoolGradingScheme"
    ADD CONSTRAINT "SchoolGradingScheme_weights_sum_check"
    CHECK ("continuousWeight" >= 0 AND "examWeight" >= 0
           AND "continuousWeight" + "examWeight" = 100);

ALTER TABLE "SchoolGradingScheme"
    ADD CONSTRAINT "SchoolGradingScheme_passMark_check"
    CHECK ("passMark" >= 0 AND "passMark" <= 100);

CREATE TABLE "SchoolGradingBand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "minScore" DECIMAL(5,2) NOT NULL,
    "maxScore" DECIMAL(5,2) NOT NULL,
    "points" INTEGER,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolGradingBand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolGradingBand_companyId_schemeId_grade_key"
    ON "SchoolGradingBand" ("companyId", "schemeId", "grade");
CREATE INDEX "SchoolGradingBand_companyId_schemeId_minScore_idx"
    ON "SchoolGradingBand" ("companyId", "schemeId", "minScore");

ALTER TABLE "SchoolGradingBand"
    ADD CONSTRAINT "SchoolGradingBand_range_check"
    CHECK ("minScore" >= 0 AND "maxScore" <= 100 AND "minScore" <= "maxScore");

CREATE TABLE "SchoolAssessment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "kind" "SchoolAssessmentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "maxScore" DECIMAL(6,2) NOT NULL,
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "assessedOn" DATE,
    "status" "SchoolAssessmentStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAssessment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolAssessment_companyId_termId_classSubjectId_idx"
    ON "SchoolAssessment" ("companyId", "termId", "classSubjectId");
CREATE INDEX "SchoolAssessment_companyId_classSubjectId_kind_idx"
    ON "SchoolAssessment" ("companyId", "classSubjectId", "kind");
CREATE INDEX "SchoolAssessment_companyId_status_idx"
    ON "SchoolAssessment" ("companyId", "status");

-- A paper out of zero makes every percentage a division by zero, and a weight
-- of zero makes an assessment that is recorded, marked, and counts for nothing.
ALTER TABLE "SchoolAssessment"
    ADD CONSTRAINT "SchoolAssessment_maxScore_check" CHECK ("maxScore" > 0);
ALTER TABLE "SchoolAssessment"
    ADD CONSTRAINT "SchoolAssessment_weight_check" CHECK ("weight" > 0);

CREATE TABLE "SchoolAssessmentScore" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DECIMAL(6,2),
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "markedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAssessmentScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolAssessmentScore_companyId_assessmentId_studentId_key"
    ON "SchoolAssessmentScore" ("companyId", "assessmentId", "studentId");
CREATE INDEX "SchoolAssessmentScore_companyId_studentId_idx"
    ON "SchoolAssessmentScore" ("companyId", "studentId");

ALTER TABLE "SchoolAssessmentScore"
    ADD CONSTRAINT "SchoolAssessmentScore_score_check"
    CHECK ("score" IS NULL OR "score" >= 0);

-- An absent student has no score. Storing one alongside the absence leaves two
-- answers to "did she sit it", and the roll-up has to pick one.
ALTER TABLE "SchoolAssessmentScore"
    ADD CONSTRAINT "SchoolAssessmentScore_absent_has_no_score_check"
    CHECK (NOT "isAbsent" OR "score" IS NULL);

ALTER TABLE "SchoolGradingScheme" ADD CONSTRAINT "SchoolGradingScheme_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolGradingBand" ADD CONSTRAINT "SchoolGradingBand_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolGradingBand" ADD CONSTRAINT "SchoolGradingBand_schemeId_fkey"
    FOREIGN KEY ("schemeId") REFERENCES "SchoolGradingScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolAssessment" ADD CONSTRAINT "SchoolAssessment_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAssessment" ADD CONSTRAINT "SchoolAssessment_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAssessment" ADD CONSTRAINT "SchoolAssessment_classSubjectId_fkey"
    FOREIGN KEY ("classSubjectId") REFERENCES "SchoolClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolAssessmentScore" ADD CONSTRAINT "SchoolAssessmentScore_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAssessmentScore" ADD CONSTRAINT "SchoolAssessmentScore_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SchoolAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAssessmentScore" ADD CONSTRAINT "SchoolAssessmentScore_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
