-- The school calendar: what is happening, and whether the school is open.
-- Without it "no register for Form 2" and "it was a public holiday" are the
-- same absence of a row.

CREATE TYPE "SchoolCalendarEventKind" AS ENUM (
    'HOLIDAY', 'PUBLIC_HOLIDAY', 'HALF_TERM', 'EXAM', 'EVENT', 'STAFF_ONLY'
);

CREATE TABLE "SchoolCalendarEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "termId" TEXT,
    "title" TEXT NOT NULL,
    "kind" "SchoolCalendarEventKind" NOT NULL DEFAULT 'EVENT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isTeachingDay" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolCalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolCalendarEvent_companyId_startDate_endDate_idx"
    ON "SchoolCalendarEvent" ("companyId", "startDate", "endDate");
CREATE INDEX "SchoolCalendarEvent_companyId_isTeachingDay_idx"
    ON "SchoolCalendarEvent" ("companyId", "isTeachingDay");

ALTER TABLE "SchoolCalendarEvent" ADD CONSTRAINT "SchoolCalendarEvent_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolCalendarEvent" ADD CONSTRAINT "SchoolCalendarEvent_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invisible to schema.prisma: a run of days must run forwards. A single-day
-- event has the same start and end, so this is <=, unlike terms and years
-- which must span at least a day.
ALTER TABLE "SchoolCalendarEvent"
    ADD CONSTRAINT "SchoolCalendarEvent_dates_ordered" CHECK ("startDate" <= "endDate");
