-- Conduct and pastoral, public exams, leavers and alumni.
--
-- The fourteen screens of the expansion canvas, and none of what they read
-- existed: 31 tables, 18 enums and four columns on `SchoolStudent`. Generated
-- with `prisma migrate diff` against the schema as it stood at the commit
-- before this block landed, so it is exactly the delta and nothing else.
--
-- Additive only. No table is dropped, no column is altered and no data is
-- rewritten, so it applies to a populated database without a window.
--
-- Three things in here are worth knowing before changing them.
--
-- `SchoolStudent` gains `certifiedName`, `nationalId`, `birthCertificateNo`
-- and `house`. The first three are NOT NULL requirements on a public exam
-- board's entry file and a school roll never carried them; `certifiedName` is
-- a column rather than a comparison because the commonest blocker on a
-- candidate roll is that the name on the roll and the name on the birth
-- certificate differ, and the board prints what it is given. All four are
-- nullable: an existing roll has none of them and a school fills them in as
-- it enters a cohort.
--
-- `campusId` is on every new table and is read by nothing. Multi-campus is
-- `S-11.x` and unbuilt; the column is here because adding it now costs a
-- column and adding it later costs a migration over a discipline record.
--
-- The unique indexes are the invariants the application cannot be trusted to
-- hold on its own, and `lib/schools/expansion-migration.test.ts` witnesses
-- each of them:
--
--   SchoolLeaver.studentId              one leaver per pupil
--   SchoolConductIncident(companyId, reference)   one CI-2026-0417
--   SchoolExamEntry(candidateId, examSubjectId)   no double entry for a subject
--   SchoolExamSeat(sessionId, candidateId)        nobody seated twice in one sitting
--   SchoolDetentionAttendance(sessionId, awardId) one register line per award
--   SchoolPastoralNoteReader(noteId, userId)      one grant per reader per note
--
-- `DisciplinaryAction` already exists in this database and is unrelated to any
-- of this. It is the HR model — an employee, a submitter and an approver. The
-- name collision is all the two share.

-- CreateEnum
CREATE TYPE "SchoolConductTone" AS ENUM ('PLAIN', 'WARN', 'BAD');

-- CreateEnum
CREATE TYPE "SchoolConductAccountAuthor" AS ENUM ('STAFF', 'STUDENT');

-- CreateEnum
CREATE TYPE "SchoolMeritKind" AS ENUM ('MERIT', 'DEMERIT');

-- CreateEnum
CREATE TYPE "SchoolDetentionState" AS ENUM ('NOT_MARKED', 'HERE', 'DID_NOT_TURN_UP', 'MOVED');

-- CreateEnum
CREATE TYPE "SchoolPastoralBand" AS ENUM ('PASTORAL_TEAM_ONLY', 'HEAD_AND_PASTORAL_TEAM', 'SAFEGUARDING_NAMED_INDIVIDUALS');

-- CreateEnum
CREATE TYPE "SchoolPastoralScope" AS ENUM ('SCHOOL', 'YEAR_GROUP', 'CLASS');

-- CreateEnum
CREATE TYPE "SchoolPastoralRequestOutcome" AS ENUM ('PENDING', 'GRANTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "SchoolExamLevel" AS ENUM ('O_LEVEL', 'A_LEVEL', 'IGCSE');

-- CreateEnum
CREATE TYPE "SchoolExamSeriesStatus" AS ENUM ('PLANNED', 'ENTRIES_OPEN', 'ENTRIES_CLOSED', 'SAT', 'RESULTS_IN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SchoolCandidateStatus" AS ENUM ('DRAFT', 'ENTERED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SchoolExamEntryStatus" AS ENUM ('DRAFT', 'ENTERED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SchoolLeavingReason" AS ENUM ('COMPLETED_FORM_4', 'COMPLETED_UPPER_6', 'FEES', 'TRANSFERRED_TO_ANOTHER_SCHOOL', 'MOVED_ABROAD', 'EXPELLED', 'WITHDRAWN_BY_GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "SchoolLeaverStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SchoolLeaverClearanceKind" AS ENUM ('FEES', 'LIBRARY', 'BOARDING', 'PORTAL', 'RESULTS');

-- CreateEnum
CREATE TYPE "SchoolLeaverClearanceState" AS ENUM ('TODO', 'DONE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "SchoolAlumniContactConsent" AS ENUM ('NOT_ASKED', 'MAY_CONTACT', 'NO_CONTACT');

-- CreateEnum
CREATE TYPE "SchoolAlumniDestinationKind" AS ENUM ('UNKNOWN', 'UNIVERSITY', 'COLLEGE', 'EMPLOYED', 'SELF_EMPLOYED', 'TRANSFERRED', 'GAP_YEAR', 'ABROAD', 'OTHER');

-- CreateEnum
CREATE TYPE "SchoolHonourKind" AS ENUM ('PRIZE', 'COLOURS', 'POST', 'OTHER');

-- AlterTable
ALTER TABLE "SchoolStudent" ADD COLUMN     "birthCertificateNo" TEXT,
ADD COLUMN     "certifiedName" TEXT,
ADD COLUMN     "house" TEXT,
ADD COLUMN     "nationalId" TEXT;

-- CreateTable
CREATE TABLE "SchoolConductCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tone" "SchoolConductTone" NOT NULL DEFAULT 'WARN',
    "demeritPoints" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolConductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolConductIncident" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "termId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "location" TEXT,
    "period" INTEGER,
    "reportedByUserId" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenByUserId" TEXT,
    "seenAt" TIMESTAMP(3),
    "sanction" TEXT,
    "sanctionTone" "SchoolConductTone" NOT NULL DEFAULT 'PLAIN',
    "sanctionDecidedByUserId" TEXT,
    "sanctionDecidedAt" TIMESTAMP(3),
    "homeToldNeeded" BOOLEAN NOT NULL DEFAULT true,
    "homeToldAt" TIMESTAMP(3),
    "homeToldChannel" TEXT,
    "homeToldByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolConductIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolConductParticipant" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sanction" TEXT,
    "sanctionTone" "SchoolConductTone" NOT NULL DEFAULT 'PLAIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolConductParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolConductAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "authorKind" "SchoolConductAccountAuthor" NOT NULL,
    "authorUserId" TEXT,
    "authorStudentId" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolConductAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMeritReason" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SchoolMeritKind" NOT NULL,
    "defaultPoints" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolMeritReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMeritEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "kind" "SchoolMeritKind" NOT NULL,
    "reasonId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "incidentId" TEXT,
    "awardedByUserId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolMeritEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDetentionSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "termId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "roomId" TEXT,
    "supervisorTeacherProfileId" TEXT,
    "label" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDetentionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDetentionAward" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "termId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "incidentId" TEXT,
    "reason" TEXT,
    "sessionsOwed" INTEGER NOT NULL DEFAULT 1,
    "awardedByUserId" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolDetentionAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDetentionAttendance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "state" "SchoolDetentionState" NOT NULL DEFAULT 'NOT_MARKED',
    "markedAt" TIMESTAMP(3),
    "markedByUserId" TEXT,
    "movedToSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDetentionAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolPastoralNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "studentId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "writtenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "body" TEXT NOT NULL,
    "band" "SchoolPastoralBand" NOT NULL,
    "reviewDueAt" TIMESTAMP(3),
    "referredTo" TEXT,
    "referredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolPastoralNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolPastoralNoteReader" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SchoolPastoralNoteReader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolPastoralClearance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "userId" TEXT NOT NULL,
    "bands" "SchoolPastoralBand"[],
    "scope" "SchoolPastoralScope" NOT NULL DEFAULT 'SCHOOL',
    "scopeLevel" INTEGER,
    "scopeClassId" TEXT,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolPastoralClearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolPastoralAccessRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "outcome" "SchoolPastoralRequestOutcome" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "SchoolPastoralAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamBoard" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamCentre" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "boardId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamCentre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamSeries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "boardId" TEXT NOT NULL,
    "centreId" TEXT,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "level" "SchoolExamLevel" NOT NULL,
    "status" "SchoolExamSeriesStatus" NOT NULL DEFAULT 'PLANNED',
    "cohortLevel" INTEGER,
    "entriesOpenAt" TIMESTAMP(3),
    "entriesCloseAt" TIMESTAMP(3),
    "lateEntriesCloseAt" TIMESTAMP(3),
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "resultsDueOn" TIMESTAMP(3),
    "feePerSubject" DECIMAL(10,2),
    "lateFeePerSubject" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamSubject" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "subjectId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "SchoolExamLevel" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamPaper" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "examSubjectId" TEXT NOT NULL,
    "paperNumber" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "sitsAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "paperId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolCandidate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "seriesId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "candidateNumber" TEXT,
    "certifiedName" TEXT,
    "status" "SchoolCandidateStatus" NOT NULL DEFAULT 'DRAFT',
    "enteredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "seriesId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "examSubjectId" TEXT NOT NULL,
    "status" "SchoolExamEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "fee" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "feeInvoiceId" TEXT,
    "feeInvoiceLineId" TEXT,
    "enteredAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamRoomAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "purpose" TEXT,
    "capacity" INTEGER,
    "invigilatorTeacherProfileId" TEXT,
    "invigilatorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamRoomAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamSeat" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "seatNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamAccessArrangement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "extraTimePercent" INTEGER,
    "detail" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamAccessArrangement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamResult" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "seriesId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "examSubjectId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "points" INTEGER,
    "isRemark" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMP(3),
    "capturedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolExamResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolExamEntryFileRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "builtByUserId" TEXT NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryCount" INTEGER NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "artifactId" TEXT,
    "notes" TEXT,

    CONSTRAINT "SchoolExamEntryFileRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolLeaver" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "studentId" TEXT NOT NULL,
    "lastDay" TIMESTAMP(3) NOT NULL,
    "reason" "SchoolLeavingReason" NOT NULL,
    "reasonNote" TEXT,
    "status" "SchoolLeaverStatus" NOT NULL DEFAULT 'OPEN',
    "openedByUserId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolLeaver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolLeaverClearance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leaverId" TEXT NOT NULL,
    "kind" "SchoolLeaverClearanceKind" NOT NULL,
    "state" "SchoolLeaverClearanceState" NOT NULL DEFAULT 'TODO',
    "detail" TEXT,
    "overrideNote" TEXT,
    "markedByUserId" TEXT,
    "markedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolLeaverClearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAlumnus" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "campusId" TEXT,
    "studentId" TEXT,
    "leaverId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "classOf" INTEGER NOT NULL,
    "finalClassName" TEXT,
    "house" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine" TEXT,
    "contactConsent" "SchoolAlumniContactConsent" NOT NULL DEFAULT 'NOT_ASKED',
    "consentGivenByUserId" TEXT,
    "consentGivenAt" TIMESTAMP(3),
    "destinationKind" "SchoolAlumniDestinationKind" NOT NULL DEFAULT 'UNKNOWN',
    "destination" TEXT,
    "destinationConfirmedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAlumnus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAlumniUpdate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "alumnusId" TEXT NOT NULL,
    "happenedOn" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "documentReference" TEXT,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolAlumniUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolStudentHonour" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "SchoolHonourKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolStudentHonour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolConductCategory_companyId_isActive_idx" ON "SchoolConductCategory"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolConductCategory_companyId_code_key" ON "SchoolConductCategory"("companyId", "code");

-- CreateIndex
CREATE INDEX "SchoolConductIncident_companyId_termId_occurredAt_idx" ON "SchoolConductIncident"("companyId", "termId", "occurredAt");

-- CreateIndex
CREATE INDEX "SchoolConductIncident_companyId_studentId_occurredAt_idx" ON "SchoolConductIncident"("companyId", "studentId", "occurredAt");

-- CreateIndex
CREATE INDEX "SchoolConductIncident_companyId_homeToldAt_idx" ON "SchoolConductIncident"("companyId", "homeToldAt");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolConductIncident_companyId_reference_key" ON "SchoolConductIncident"("companyId", "reference");

-- CreateIndex
CREATE INDEX "SchoolConductParticipant_companyId_studentId_idx" ON "SchoolConductParticipant"("companyId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolConductParticipant_incidentId_studentId_key" ON "SchoolConductParticipant"("incidentId", "studentId");

-- CreateIndex
CREATE INDEX "SchoolConductAccount_companyId_incidentId_takenAt_idx" ON "SchoolConductAccount"("companyId", "incidentId", "takenAt");

-- CreateIndex
CREATE INDEX "SchoolMeritReason_companyId_kind_isActive_idx" ON "SchoolMeritReason"("companyId", "kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMeritReason_companyId_code_key" ON "SchoolMeritReason"("companyId", "code");

-- CreateIndex
CREATE INDEX "SchoolMeritEntry_companyId_termId_kind_idx" ON "SchoolMeritEntry"("companyId", "termId", "kind");

-- CreateIndex
CREATE INDEX "SchoolMeritEntry_companyId_studentId_termId_idx" ON "SchoolMeritEntry"("companyId", "studentId", "termId");

-- CreateIndex
CREATE INDEX "SchoolMeritEntry_companyId_reasonId_idx" ON "SchoolMeritEntry"("companyId", "reasonId");

-- CreateIndex
CREATE INDEX "SchoolDetentionSession_companyId_termId_startsAt_idx" ON "SchoolDetentionSession"("companyId", "termId", "startsAt");

-- CreateIndex
CREATE INDEX "SchoolDetentionSession_companyId_startsAt_idx" ON "SchoolDetentionSession"("companyId", "startsAt");

-- CreateIndex
CREATE INDEX "SchoolDetentionAward_companyId_termId_studentId_idx" ON "SchoolDetentionAward"("companyId", "termId", "studentId");

-- CreateIndex
CREATE INDEX "SchoolDetentionAward_companyId_incidentId_idx" ON "SchoolDetentionAward"("companyId", "incidentId");

-- CreateIndex
CREATE INDEX "SchoolDetentionAttendance_companyId_sessionId_state_idx" ON "SchoolDetentionAttendance"("companyId", "sessionId", "state");

-- CreateIndex
CREATE INDEX "SchoolDetentionAttendance_companyId_studentId_idx" ON "SchoolDetentionAttendance"("companyId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolDetentionAttendance_sessionId_awardId_key" ON "SchoolDetentionAttendance"("sessionId", "awardId");

-- CreateIndex
CREATE INDEX "SchoolPastoralNote_companyId_studentId_writtenAt_idx" ON "SchoolPastoralNote"("companyId", "studentId", "writtenAt");

-- CreateIndex
CREATE INDEX "SchoolPastoralNote_companyId_writtenAt_idx" ON "SchoolPastoralNote"("companyId", "writtenAt");

-- CreateIndex
CREATE INDEX "SchoolPastoralNote_companyId_reviewDueAt_idx" ON "SchoolPastoralNote"("companyId", "reviewDueAt");

-- CreateIndex
CREATE INDEX "SchoolPastoralNoteReader_companyId_userId_revokedAt_idx" ON "SchoolPastoralNoteReader"("companyId", "userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolPastoralNoteReader_noteId_userId_key" ON "SchoolPastoralNoteReader"("noteId", "userId");

-- CreateIndex
CREATE INDEX "SchoolPastoralClearance_companyId_revokedAt_idx" ON "SchoolPastoralClearance"("companyId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolPastoralClearance_companyId_userId_key" ON "SchoolPastoralClearance"("companyId", "userId");

-- CreateIndex
CREATE INDEX "SchoolPastoralAccessRequest_companyId_outcome_requestedAt_idx" ON "SchoolPastoralAccessRequest"("companyId", "outcome", "requestedAt");

-- CreateIndex
CREATE INDEX "SchoolPastoralAccessRequest_noteId_idx" ON "SchoolPastoralAccessRequest"("noteId");

-- CreateIndex
CREATE INDEX "SchoolExamBoard_companyId_isActive_idx" ON "SchoolExamBoard"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExamBoard_companyId_code_key" ON "SchoolExamBoard"("companyId", "code");

-- CreateIndex
CREATE INDEX "SchoolExamCentre_companyId_isActive_idx" ON "SchoolExamCentre"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExamCentre_companyId_boardId_number_key" ON "SchoolExamCentre"("companyId", "boardId", "number");

-- CreateIndex
CREATE INDEX "SchoolExamSeries_companyId_year_status_idx" ON "SchoolExamSeries"("companyId", "year", "status");

-- CreateIndex
CREATE INDEX "SchoolExamSeries_companyId_entriesCloseAt_idx" ON "SchoolExamSeries"("companyId", "entriesCloseAt");

-- CreateIndex
CREATE INDEX "SchoolExamSubject_companyId_boardId_isActive_idx" ON "SchoolExamSubject"("companyId", "boardId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExamSubject_companyId_boardId_code_level_key" ON "SchoolExamSubject"("companyId", "boardId", "code", "level");

-- CreateIndex
CREATE INDEX "SchoolExamPaper_companyId_seriesId_sitsAt_idx" ON "SchoolExamPaper"("companyId", "seriesId", "sitsAt");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExamPaper_seriesId_examSubjectId_paperNumber_key" ON "SchoolExamPaper"("seriesId", "examSubjectId", "paperNumber");

-- CreateIndex
CREATE INDEX "SchoolExamSession_companyId_seriesId_startsAt_idx" ON "SchoolExamSession"("companyId", "seriesId", "startsAt");

-- CreateIndex
CREATE INDEX "SchoolCandidate_companyId_seriesId_status_idx" ON "SchoolCandidate"("companyId", "seriesId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolCandidate_seriesId_studentId_key" ON "SchoolCandidate"("seriesId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolCandidate_seriesId_candidateNumber_key" ON "SchoolCandidate"("seriesId", "candidateNumber");

-- CreateIndex
CREATE INDEX "SchoolExamEntry_companyId_seriesId_status_idx" ON "SchoolExamEntry"("companyId", "seriesId", "status");

-- CreateIndex
CREATE INDEX "SchoolExamEntry_companyId_feeInvoiceId_idx" ON "SchoolExamEntry"("companyId", "feeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExamEntry_candidateId_examSubjectId_key" ON "SchoolExamEntry"("candidateId", "examSubjectId");

-- CreateIndex
CREATE INDEX "SchoolExamRoomAllocation_companyId_sessionId_idx" ON "SchoolExamRoomAllocation"("companyId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExamRoomAllocation_sessionId_roomId_key" ON "SchoolExamRoomAllocation"("sessionId", "roomId");

-- CreateIndex
CREATE INDEX "SchoolExamSeat_companyId_sessionId_idx" ON "SchoolExamSeat"("companyId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExamSeat_sessionId_candidateId_key" ON "SchoolExamSeat"("sessionId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExamSeat_allocationId_seatNumber_key" ON "SchoolExamSeat"("allocationId", "seatNumber");

-- CreateIndex
CREATE INDEX "SchoolExamAccessArrangement_companyId_candidateId_idx" ON "SchoolExamAccessArrangement"("companyId", "candidateId");

-- CreateIndex
CREATE INDEX "SchoolExamResult_companyId_seriesId_idx" ON "SchoolExamResult"("companyId", "seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolExamResult_candidateId_examSubjectId_isRemark_key" ON "SchoolExamResult"("candidateId", "examSubjectId", "isRemark");

-- CreateIndex
CREATE INDEX "SchoolExamEntryFileRun_companyId_seriesId_builtAt_idx" ON "SchoolExamEntryFileRun"("companyId", "seriesId", "builtAt");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolLeaver_studentId_key" ON "SchoolLeaver"("studentId");

-- CreateIndex
CREATE INDEX "SchoolLeaver_companyId_status_lastDay_idx" ON "SchoolLeaver"("companyId", "status", "lastDay");

-- CreateIndex
CREATE INDEX "SchoolLeaverClearance_companyId_kind_state_idx" ON "SchoolLeaverClearance"("companyId", "kind", "state");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolLeaverClearance_leaverId_kind_key" ON "SchoolLeaverClearance"("leaverId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAlumnus_studentId_key" ON "SchoolAlumnus"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAlumnus_leaverId_key" ON "SchoolAlumnus"("leaverId");

-- CreateIndex
CREATE INDEX "SchoolAlumnus_companyId_classOf_idx" ON "SchoolAlumnus"("companyId", "classOf");

-- CreateIndex
CREATE INDEX "SchoolAlumnus_companyId_destinationKind_idx" ON "SchoolAlumnus"("companyId", "destinationKind");

-- CreateIndex
CREATE INDEX "SchoolAlumnus_companyId_contactConsent_idx" ON "SchoolAlumnus"("companyId", "contactConsent");

-- CreateIndex
CREATE INDEX "SchoolAlumniUpdate_companyId_alumnusId_happenedOn_idx" ON "SchoolAlumniUpdate"("companyId", "alumnusId", "happenedOn");

-- CreateIndex
CREATE INDEX "SchoolStudentHonour_companyId_studentId_year_idx" ON "SchoolStudentHonour"("companyId", "studentId", "year");

-- AddForeignKey
ALTER TABLE "SchoolConductCategory" ADD CONSTRAINT "SchoolConductCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConductIncident" ADD CONSTRAINT "SchoolConductIncident_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConductIncident" ADD CONSTRAINT "SchoolConductIncident_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConductIncident" ADD CONSTRAINT "SchoolConductIncident_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConductIncident" ADD CONSTRAINT "SchoolConductIncident_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SchoolConductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConductParticipant" ADD CONSTRAINT "SchoolConductParticipant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConductParticipant" ADD CONSTRAINT "SchoolConductParticipant_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SchoolConductIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConductParticipant" ADD CONSTRAINT "SchoolConductParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConductAccount" ADD CONSTRAINT "SchoolConductAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConductAccount" ADD CONSTRAINT "SchoolConductAccount_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SchoolConductIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolConductAccount" ADD CONSTRAINT "SchoolConductAccount_authorStudentId_fkey" FOREIGN KEY ("authorStudentId") REFERENCES "SchoolStudent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMeritReason" ADD CONSTRAINT "SchoolMeritReason_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMeritEntry" ADD CONSTRAINT "SchoolMeritEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMeritEntry" ADD CONSTRAINT "SchoolMeritEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMeritEntry" ADD CONSTRAINT "SchoolMeritEntry_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMeritEntry" ADD CONSTRAINT "SchoolMeritEntry_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "SchoolMeritReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMeritEntry" ADD CONSTRAINT "SchoolMeritEntry_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SchoolConductIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionSession" ADD CONSTRAINT "SchoolDetentionSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionSession" ADD CONSTRAINT "SchoolDetentionSession_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionSession" ADD CONSTRAINT "SchoolDetentionSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "SchoolRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionSession" ADD CONSTRAINT "SchoolDetentionSession_supervisorTeacherProfileId_fkey" FOREIGN KEY ("supervisorTeacherProfileId") REFERENCES "SchoolTeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionAward" ADD CONSTRAINT "SchoolDetentionAward_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionAward" ADD CONSTRAINT "SchoolDetentionAward_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionAward" ADD CONSTRAINT "SchoolDetentionAward_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionAward" ADD CONSTRAINT "SchoolDetentionAward_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SchoolConductIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionAttendance" ADD CONSTRAINT "SchoolDetentionAttendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionAttendance" ADD CONSTRAINT "SchoolDetentionAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SchoolDetentionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionAttendance" ADD CONSTRAINT "SchoolDetentionAttendance_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "SchoolDetentionAward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionAttendance" ADD CONSTRAINT "SchoolDetentionAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetentionAttendance" ADD CONSTRAINT "SchoolDetentionAttendance_movedToSessionId_fkey" FOREIGN KEY ("movedToSessionId") REFERENCES "SchoolDetentionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPastoralNote" ADD CONSTRAINT "SchoolPastoralNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPastoralNote" ADD CONSTRAINT "SchoolPastoralNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPastoralNoteReader" ADD CONSTRAINT "SchoolPastoralNoteReader_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPastoralNoteReader" ADD CONSTRAINT "SchoolPastoralNoteReader_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "SchoolPastoralNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPastoralClearance" ADD CONSTRAINT "SchoolPastoralClearance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPastoralClearance" ADD CONSTRAINT "SchoolPastoralClearance_scopeClassId_fkey" FOREIGN KEY ("scopeClassId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPastoralAccessRequest" ADD CONSTRAINT "SchoolPastoralAccessRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPastoralAccessRequest" ADD CONSTRAINT "SchoolPastoralAccessRequest_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "SchoolPastoralNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamBoard" ADD CONSTRAINT "SchoolExamBoard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamCentre" ADD CONSTRAINT "SchoolExamCentre_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamCentre" ADD CONSTRAINT "SchoolExamCentre_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "SchoolExamBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSeries" ADD CONSTRAINT "SchoolExamSeries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSeries" ADD CONSTRAINT "SchoolExamSeries_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "SchoolExamBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSeries" ADD CONSTRAINT "SchoolExamSeries_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "SchoolExamCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSubject" ADD CONSTRAINT "SchoolExamSubject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSubject" ADD CONSTRAINT "SchoolExamSubject_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "SchoolExamBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSubject" ADD CONSTRAINT "SchoolExamSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "SchoolSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamPaper" ADD CONSTRAINT "SchoolExamPaper_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamPaper" ADD CONSTRAINT "SchoolExamPaper_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "SchoolExamSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamPaper" ADD CONSTRAINT "SchoolExamPaper_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "SchoolExamSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSession" ADD CONSTRAINT "SchoolExamSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSession" ADD CONSTRAINT "SchoolExamSession_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "SchoolExamSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSession" ADD CONSTRAINT "SchoolExamSession_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "SchoolExamPaper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCandidate" ADD CONSTRAINT "SchoolCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCandidate" ADD CONSTRAINT "SchoolCandidate_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "SchoolExamSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolCandidate" ADD CONSTRAINT "SchoolCandidate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamEntry" ADD CONSTRAINT "SchoolExamEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamEntry" ADD CONSTRAINT "SchoolExamEntry_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "SchoolExamSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamEntry" ADD CONSTRAINT "SchoolExamEntry_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "SchoolCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamEntry" ADD CONSTRAINT "SchoolExamEntry_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "SchoolExamSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamEntry" ADD CONSTRAINT "SchoolExamEntry_feeInvoiceId_fkey" FOREIGN KEY ("feeInvoiceId") REFERENCES "SchoolFeeInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamRoomAllocation" ADD CONSTRAINT "SchoolExamRoomAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamRoomAllocation" ADD CONSTRAINT "SchoolExamRoomAllocation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SchoolExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamRoomAllocation" ADD CONSTRAINT "SchoolExamRoomAllocation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "SchoolRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamRoomAllocation" ADD CONSTRAINT "SchoolExamRoomAllocation_invigilatorTeacherProfileId_fkey" FOREIGN KEY ("invigilatorTeacherProfileId") REFERENCES "SchoolTeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSeat" ADD CONSTRAINT "SchoolExamSeat_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSeat" ADD CONSTRAINT "SchoolExamSeat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SchoolExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSeat" ADD CONSTRAINT "SchoolExamSeat_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "SchoolExamRoomAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamSeat" ADD CONSTRAINT "SchoolExamSeat_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "SchoolCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamAccessArrangement" ADD CONSTRAINT "SchoolExamAccessArrangement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamAccessArrangement" ADD CONSTRAINT "SchoolExamAccessArrangement_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "SchoolCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamResult" ADD CONSTRAINT "SchoolExamResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamResult" ADD CONSTRAINT "SchoolExamResult_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "SchoolExamSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamResult" ADD CONSTRAINT "SchoolExamResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "SchoolCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamResult" ADD CONSTRAINT "SchoolExamResult_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "SchoolExamSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamEntryFileRun" ADD CONSTRAINT "SchoolExamEntryFileRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolExamEntryFileRun" ADD CONSTRAINT "SchoolExamEntryFileRun_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "SchoolExamSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaver" ADD CONSTRAINT "SchoolLeaver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaver" ADD CONSTRAINT "SchoolLeaver_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaverClearance" ADD CONSTRAINT "SchoolLeaverClearance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLeaverClearance" ADD CONSTRAINT "SchoolLeaverClearance_leaverId_fkey" FOREIGN KEY ("leaverId") REFERENCES "SchoolLeaver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAlumnus" ADD CONSTRAINT "SchoolAlumnus_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAlumnus" ADD CONSTRAINT "SchoolAlumnus_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAlumnus" ADD CONSTRAINT "SchoolAlumnus_leaverId_fkey" FOREIGN KEY ("leaverId") REFERENCES "SchoolLeaver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAlumniUpdate" ADD CONSTRAINT "SchoolAlumniUpdate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAlumniUpdate" ADD CONSTRAINT "SchoolAlumniUpdate_alumnusId_fkey" FOREIGN KEY ("alumnusId") REFERENCES "SchoolAlumnus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudentHonour" ADD CONSTRAINT "SchoolStudentHonour_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudentHonour" ADD CONSTRAINT "SchoolStudentHonour_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

