-- Timetable: periods, rooms and the slots that place a class-subject
-- assignment on a day.

CREATE TABLE "SchoolPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "isTeaching" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolRoom" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "kind" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolTimetableSlot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classSubjectId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "roomId" TEXT,
    "classId" TEXT NOT NULL,
    "streamId" TEXT,
    "teacherProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolTimetableSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolPeriod_companyId_termId_code_key"
    ON "SchoolPeriod" ("companyId", "termId", "code");
CREATE INDEX "SchoolPeriod_companyId_termId_sequence_idx"
    ON "SchoolPeriod" ("companyId", "termId", "sequence");

CREATE UNIQUE INDEX "SchoolRoom_companyId_code_key" ON "SchoolRoom" ("companyId", "code");
CREATE INDEX "SchoolRoom_companyId_isActive_idx" ON "SchoolRoom" ("companyId", "isActive");

CREATE UNIQUE INDEX "SchoolTimetableSlot_teacher_slot_key"
    ON "SchoolTimetableSlot" ("companyId", "termId", "dayOfWeek", "periodId", "teacherProfileId");
CREATE UNIQUE INDEX "SchoolTimetableSlot_lesson_slot_key"
    ON "SchoolTimetableSlot" ("companyId", "termId", "dayOfWeek", "periodId", "classSubjectId");
CREATE INDEX "SchoolTimetableSlot_companyId_termId_dayOfWeek_periodId_idx"
    ON "SchoolTimetableSlot" ("companyId", "termId", "dayOfWeek", "periodId");
CREATE INDEX "SchoolTimetableSlot_companyId_termId_classId_streamId_idx"
    ON "SchoolTimetableSlot" ("companyId", "termId", "classId", "streamId");
CREATE INDEX "SchoolTimetableSlot_companyId_roomId_idx"
    ON "SchoolTimetableSlot" ("companyId", "roomId");

ALTER TABLE "SchoolPeriod" ADD CONSTRAINT "SchoolPeriod_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPeriod" ADD CONSTRAINT "SchoolPeriod_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolRoom" ADD CONSTRAINT "SchoolRoom_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolTimetableSlot" ADD CONSTRAINT "SchoolTimetableSlot_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTimetableSlot" ADD CONSTRAINT "SchoolTimetableSlot_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTimetableSlot" ADD CONSTRAINT "SchoolTimetableSlot_classSubjectId_fkey"
    FOREIGN KEY ("classSubjectId") REFERENCES "SchoolClassSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTimetableSlot" ADD CONSTRAINT "SchoolTimetableSlot_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "SchoolPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTimetableSlot" ADD CONSTRAINT "SchoolTimetableSlot_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "SchoolRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolTimetableSlot" ADD CONSTRAINT "SchoolTimetableSlot_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTimetableSlot" ADD CONSTRAINT "SchoolTimetableSlot_streamId_fkey"
    FOREIGN KEY ("streamId") REFERENCES "SchoolStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTimetableSlot" ADD CONSTRAINT "SchoolTimetableSlot_teacherProfileId_fkey"
    FOREIGN KEY ("teacherProfileId") REFERENCES "SchoolTeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Everything below is invisible to schema.prisma.

-- A period runs forwards, inside one day.
ALTER TABLE "SchoolPeriod"
    ADD CONSTRAINT "SchoolPeriod_minutes_in_day"
    CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");

-- ISO-8601: Monday is 1, Sunday is 7.
ALTER TABLE "SchoolTimetableSlot"
    ADD CONSTRAINT "SchoolTimetableSlot_day_of_week"
    CHECK ("dayOfWeek" BETWEEN 1 AND 7);

-- The class-clash and room-clash rules. Both are partial indexes because
-- Postgres treats two NULLs as distinct: a plain unique index over a nullable
-- "streamId" would let a class with no stream be double-booked, and one over
-- "roomId" would collapse every unroomed lesson in a period into a single
-- allowed row. Splitting on IS NULL / IS NOT NULL is what makes each rule mean
-- what it says.
CREATE UNIQUE INDEX "SchoolTimetableSlot_class_stream_slot_key"
    ON "SchoolTimetableSlot" ("companyId", "termId", "dayOfWeek", "periodId", "classId", "streamId")
    WHERE "streamId" IS NOT NULL;

CREATE UNIQUE INDEX "SchoolTimetableSlot_class_no_stream_slot_key"
    ON "SchoolTimetableSlot" ("companyId", "termId", "dayOfWeek", "periodId", "classId")
    WHERE "streamId" IS NULL;

CREATE UNIQUE INDEX "SchoolTimetableSlot_room_slot_key"
    ON "SchoolTimetableSlot" ("companyId", "termId", "dayOfWeek", "periodId", "roomId")
    WHERE "roomId" IS NOT NULL;
