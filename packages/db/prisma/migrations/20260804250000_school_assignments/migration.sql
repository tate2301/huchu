-- Homework, and what came back.
--
-- Required by the student and teacher prototypes and absent from the schema.
-- Kept apart from `SchoolAssessment`: an assessment carries marks that roll
-- into a term mark, homework is set and handed in and mostly never marked.
-- Collapsing them would mean every piece of reading counted towards a report
-- card, or every test needing a due date it does not have.

CREATE TYPE "SchoolSubmissionStatus" AS ENUM (
    'SUBMITTED', 'LATE', 'RETURNED', 'RESUBMIT'
);

CREATE TABLE "SchoolAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "dueAt" TIMESTAMP(3),
    "maxScore" DECIMAL(6,2),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolAssignment_companyId_termId_classSubjectId_idx"
    ON "SchoolAssignment" ("companyId", "termId", "classSubjectId");
CREATE INDEX "SchoolAssignment_companyId_dueAt_idx"
    ON "SchoolAssignment" ("companyId", "dueAt");
CREATE INDEX "SchoolAssignment_companyId_isPublished_idx"
    ON "SchoolAssignment" ("companyId", "isPublished");

-- Homework worth zero marks is homework that says it is marked and is not.
-- Null is the way to say "not marked".
ALTER TABLE "SchoolAssignment"
    ADD CONSTRAINT "SchoolAssignment_maxScore_check"
    CHECK ("maxScore" IS NULL OR "maxScore" > 0);

-- Published with no date, or a date with nothing published, are both states
-- where "when could the class first see this" has no answer.
ALTER TABLE "SchoolAssignment"
    ADD CONSTRAINT "SchoolAssignment_published_provenance_check"
    CHECK ("isPublished" = ("publishedAt" IS NOT NULL));

CREATE TABLE "SchoolAssignmentSubmission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SchoolSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT,
    "attachmentUrl" TEXT,
    "score" DECIMAL(6,2),
    "feedback" TEXT,
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- One submission per child per piece of homework. A second would mean two
-- answers and a teacher marking whichever came back first.
CREATE UNIQUE INDEX "SchoolAssignmentSubmission_companyId_assignmentId_studentId_key"
    ON "SchoolAssignmentSubmission" ("companyId", "assignmentId", "studentId");
CREATE INDEX "SchoolAssignmentSubmission_companyId_studentId_submittedAt_idx"
    ON "SchoolAssignmentSubmission" ("companyId", "studentId", "submittedAt");

ALTER TABLE "SchoolAssignmentSubmission"
    ADD CONSTRAINT "SchoolAssignmentSubmission_score_check"
    CHECK ("score" IS NULL OR "score" >= 0);

-- A mark with nobody's name against it cannot be queried by a parent, and a
-- marker with no mark is a half-finished action that reads as finished.
ALTER TABLE "SchoolAssignmentSubmission"
    ADD CONSTRAINT "SchoolAssignmentSubmission_marked_provenance_check"
    CHECK (("markedById" IS NULL) = ("markedAt" IS NULL));

ALTER TABLE "SchoolAssignment" ADD CONSTRAINT "SchoolAssignment_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAssignment" ADD CONSTRAINT "SchoolAssignment_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAssignment" ADD CONSTRAINT "SchoolAssignment_classSubjectId_fkey"
    FOREIGN KEY ("classSubjectId") REFERENCES "SchoolClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolAssignmentSubmission" ADD CONSTRAINT "SchoolAssignmentSubmission_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAssignmentSubmission" ADD CONSTRAINT "SchoolAssignmentSubmission_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "SchoolAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAssignmentSubmission" ADD CONSTRAINT "SchoolAssignmentSubmission_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
