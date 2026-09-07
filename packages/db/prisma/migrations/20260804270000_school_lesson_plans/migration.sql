-- Lesson plans, cover, and a teaching resource library.
--
-- Both in one migration because they are one habit: a teacher writes a plan and
-- attaches the worksheet she is going to use, and splitting them across two
-- releases would ship half of a workflow.

CREATE TABLE "SchoolLessonPlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "slotId" TEXT,
    "lessonDate" DATE NOT NULL,
    "topic" TEXT NOT NULL,
    "objectives" TEXT,
    "activities" TEXT,
    "resourcesNote" TEXT,
    "homeworkNote" TEXT,
    "reflection" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolLessonPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolLessonPlan_companyId_termId_classSubjectId_lessonDate_idx"
    ON "SchoolLessonPlan" ("companyId", "termId", "classSubjectId", "lessonDate");
CREATE INDEX "SchoolLessonPlan_companyId_lessonDate_idx"
    ON "SchoolLessonPlan" ("companyId", "lessonDate");

-- One plan per timetabled lesson. Partial, because `slotId` is nullable — a
-- teacher plans a topic before the timetable is built, and those plans must not
-- collide with each other. Postgres treats NULLs as distinct, so they do not.
CREATE UNIQUE INDEX "SchoolLessonPlan_slot_date_key"
    ON "SchoolLessonPlan" ("slotId", "lessonDate")
    WHERE "slotId" IS NOT NULL;

CREATE TABLE "SchoolCoverAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lessonPlanId" TEXT NOT NULL,
    "coveringTeacherProfileId" TEXT NOT NULL,
    "reason" TEXT,
    "arrangedById" TEXT,
    "arrangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolCoverAssignment_pkey" PRIMARY KEY ("id")
);

-- One cover per lesson. Two teachers told to take the same class is how a class
-- ends up with none.
CREATE UNIQUE INDEX "SchoolCoverAssignment_lessonPlanId_key"
    ON "SchoolCoverAssignment" ("lessonPlanId");
CREATE INDEX "SchoolCoverAssignment_companyId_coveringTeacherProfileId_idx"
    ON "SchoolCoverAssignment" ("companyId", "coveringTeacherProfileId");

CREATE TABLE "SchoolTeachingResource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subjectId" TEXT,
    "classId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT,
    "linkUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "uploadedByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolTeachingResource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolTeachingResource_companyId_subjectId_idx"
    ON "SchoolTeachingResource" ("companyId", "subjectId");
CREATE INDEX "SchoolTeachingResource_companyId_isShared_title_idx"
    ON "SchoolTeachingResource" ("companyId", "isShared", "title");

-- A resource that is neither a file nor a link is a title with nothing behind
-- it, and a shelf full of those is worse than an empty one.
ALTER TABLE "SchoolTeachingResource"
    ADD CONSTRAINT "SchoolTeachingResource_has_content_check"
    CHECK ("fileUrl" IS NOT NULL OR "linkUrl" IS NOT NULL);

ALTER TABLE "SchoolLessonPlan" ADD CONSTRAINT "SchoolLessonPlan_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolLessonPlan" ADD CONSTRAINT "SchoolLessonPlan_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolLessonPlan" ADD CONSTRAINT "SchoolLessonPlan_classSubjectId_fkey"
    FOREIGN KEY ("classSubjectId") REFERENCES "SchoolClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolLessonPlan" ADD CONSTRAINT "SchoolLessonPlan_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "SchoolTimetableSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchoolCoverAssignment" ADD CONSTRAINT "SchoolCoverAssignment_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolCoverAssignment" ADD CONSTRAINT "SchoolCoverAssignment_lessonPlanId_fkey"
    FOREIGN KEY ("lessonPlanId") REFERENCES "SchoolLessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolCoverAssignment" ADD CONSTRAINT "SchoolCoverAssignment_coveringTeacherProfileId_fkey"
    FOREIGN KEY ("coveringTeacherProfileId") REFERENCES "SchoolTeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolTeachingResource" ADD CONSTRAINT "SchoolTeachingResource_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTeachingResource" ADD CONSTRAINT "SchoolTeachingResource_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolTeachingResource" ADD CONSTRAINT "SchoolTeachingResource_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolTeachingResource" ADD CONSTRAINT "SchoolTeachingResource_uploadedByProfileId_fkey"
    FOREIGN KEY ("uploadedByProfileId") REFERENCES "SchoolTeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
