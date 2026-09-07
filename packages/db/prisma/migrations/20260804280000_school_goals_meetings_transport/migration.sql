-- Student goals, parent meetings and transport.
--
-- The last three stories of Iteration 1, in one migration because each is a
-- small table and three releases of one table each is three deploys for one
-- afternoon's work.

CREATE TYPE "SchoolTransportDirection" AS ENUM ('MORNING', 'AFTERNOON');

CREATE TABLE "SchoolStudentGoal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "targetMark" DECIMAL(5,2),
    "plan" TEXT,
    "baselineMark" DECIMAL(5,2),
    "achievedAt" TIMESTAMP(3),
    "teacherNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolStudentGoal_pkey" PRIMARY KEY ("id")
);

-- One goal per subject per term. Two would mean a child aiming at two marks in
-- one subject, and a progress screen that has to pick one.
CREATE UNIQUE INDEX "SchoolStudentGoal_companyId_studentId_termId_subjectId_key"
    ON "SchoolStudentGoal" ("companyId", "studentId", "termId", "subjectId");
CREATE INDEX "SchoolStudentGoal_companyId_termId_subjectId_idx"
    ON "SchoolStudentGoal" ("companyId", "termId", "subjectId");

ALTER TABLE "SchoolStudentGoal"
    ADD CONSTRAINT "SchoolStudentGoal_marks_check"
    CHECK (
        ("targetMark" IS NULL OR ("targetMark" >= 0 AND "targetMark" <= 100))
        AND ("baselineMark" IS NULL OR ("baselineMark" >= 0 AND "baselineMark" <= 100))
    );

CREATE TABLE "SchoolParentMeeting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "studentId" TEXT,
    "guardianId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "outcome" TEXT,
    "bookedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolParentMeeting_pkey" PRIMARY KEY ("id")
);

-- One teacher, one slot. Partial on the cancellation, so a slot released and
-- re-offered does not collide with the row it replaced.
CREATE UNIQUE INDEX "SchoolParentMeeting_teacher_slot_key"
    ON "SchoolParentMeeting" ("teacherProfileId", "startsAt")
    WHERE "cancelledAt" IS NULL;

CREATE INDEX "SchoolParentMeeting_companyId_teacherProfileId_startsAt_idx"
    ON "SchoolParentMeeting" ("companyId", "teacherProfileId", "startsAt");
CREATE INDEX "SchoolParentMeeting_companyId_startsAt_idx"
    ON "SchoolParentMeeting" ("companyId", "startsAt");
CREATE INDEX "SchoolParentMeeting_companyId_studentId_idx"
    ON "SchoolParentMeeting" ("companyId", "studentId");

ALTER TABLE "SchoolParentMeeting"
    ADD CONSTRAINT "SchoolParentMeeting_times_check" CHECK ("endsAt" > "startsAt");

-- A booked slot names the child it is about, and a booking time. Half of that
-- is a slot that looks taken and cannot be chased.
ALTER TABLE "SchoolParentMeeting"
    ADD CONSTRAINT "SchoolParentMeeting_booking_check"
    CHECK (("bookedAt" IS NULL) = ("studentId" IS NULL));

CREATE TABLE "SchoolTransportRoute" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "termFee" DECIMAL(10,2),
    "vehicleReg" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolTransportRoute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolTransportRoute_companyId_code_key"
    ON "SchoolTransportRoute" ("companyId", "code");
CREATE INDEX "SchoolTransportRoute_companyId_isActive_idx"
    ON "SchoolTransportRoute" ("companyId", "isActive");

ALTER TABLE "SchoolTransportRoute"
    ADD CONSTRAINT "SchoolTransportRoute_capacity_check"
    CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "SchoolTransportRoute"
    ADD CONSTRAINT "SchoolTransportRoute_fee_check"
    CHECK ("termFee" IS NULL OR "termFee" >= 0);

CREATE TABLE "SchoolTransportStop" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "pickupMinute" INTEGER,
    "dropMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolTransportStop_pkey" PRIMARY KEY ("id")
);

-- Two stops cannot share a position on the route. Without this the order is
-- whatever the database happens to return, and a driver's list is not a route.
CREATE UNIQUE INDEX "SchoolTransportStop_companyId_routeId_sequence_key"
    ON "SchoolTransportStop" ("companyId", "routeId", "sequence");
CREATE INDEX "SchoolTransportStop_companyId_routeId_idx"
    ON "SchoolTransportStop" ("companyId", "routeId");

-- Minutes from midnight, like the timetable periods.
ALTER TABLE "SchoolTransportStop"
    ADD CONSTRAINT "SchoolTransportStop_minutes_check"
    CHECK (
        ("pickupMinute" IS NULL OR ("pickupMinute" >= 0 AND "pickupMinute" < 1440))
        AND ("dropMinute" IS NULL OR ("dropMinute" >= 0 AND "dropMinute" < 1440))
    );

CREATE TABLE "SchoolTransportRider" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "stopId" TEXT,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "feeInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolTransportRider_pkey" PRIMARY KEY ("id")
);

-- One live ridership per child per term. A child on two buses is a child
-- nobody can find at four o'clock.
CREATE UNIQUE INDEX "SchoolTransportRider_live_student_term_key"
    ON "SchoolTransportRider" ("companyId", "studentId", "termId")
    WHERE "endedAt" IS NULL;

CREATE INDEX "SchoolTransportRider_companyId_routeId_termId_idx"
    ON "SchoolTransportRider" ("companyId", "routeId", "termId");
CREATE INDEX "SchoolTransportRider_companyId_studentId_idx"
    ON "SchoolTransportRider" ("companyId", "studentId");

CREATE TABLE "SchoolTransportBoarding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "onDate" DATE NOT NULL,
    "direction" "SchoolTransportDirection" NOT NULL,
    "boarded" BOOLEAN NOT NULL DEFAULT true,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolTransportBoarding_pkey" PRIMARY KEY ("id")
);

-- One answer per child per journey per day. Two would mean a driver's register
-- that says both.
CREATE UNIQUE INDEX "SchoolTransportBoarding_companyId_riderId_onDate_direction_key"
    ON "SchoolTransportBoarding" ("companyId", "riderId", "onDate", "direction");
CREATE INDEX "SchoolTransportBoarding_companyId_onDate_idx"
    ON "SchoolTransportBoarding" ("companyId", "onDate");

ALTER TABLE "SchoolStudentGoal" ADD CONSTRAINT "SchoolStudentGoal_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentGoal" ADD CONSTRAINT "SchoolStudentGoal_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentGoal" ADD CONSTRAINT "SchoolStudentGoal_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentGoal" ADD CONSTRAINT "SchoolStudentGoal_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolParentMeeting" ADD CONSTRAINT "SchoolParentMeeting_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolParentMeeting" ADD CONSTRAINT "SchoolParentMeeting_teacherProfileId_fkey"
    FOREIGN KEY ("teacherProfileId") REFERENCES "SchoolTeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolParentMeeting" ADD CONSTRAINT "SchoolParentMeeting_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolParentMeeting" ADD CONSTRAINT "SchoolParentMeeting_guardianId_fkey"
    FOREIGN KEY ("guardianId") REFERENCES "SchoolGuardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchoolTransportRoute" ADD CONSTRAINT "SchoolTransportRoute_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolTransportStop" ADD CONSTRAINT "SchoolTransportStop_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTransportStop" ADD CONSTRAINT "SchoolTransportStop_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "SchoolTransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolTransportRider" ADD CONSTRAINT "SchoolTransportRider_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTransportRider" ADD CONSTRAINT "SchoolTransportRider_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "SchoolTransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTransportRider" ADD CONSTRAINT "SchoolTransportRider_stopId_fkey"
    FOREIGN KEY ("stopId") REFERENCES "SchoolTransportStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolTransportRider" ADD CONSTRAINT "SchoolTransportRider_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTransportRider" ADD CONSTRAINT "SchoolTransportRider_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolTransportBoarding" ADD CONSTRAINT "SchoolTransportBoarding_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolTransportBoarding" ADD CONSTRAINT "SchoolTransportBoarding_riderId_fkey"
    FOREIGN KEY ("riderId") REFERENCES "SchoolTransportRider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
