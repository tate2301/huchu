-- Boarding: roll calls, the sick bay, and the geometry of a dormitory.
--
-- Three things the module could not do, and one it could only guess at.
--
-- 1. NOTHING RECORDED A ROLL CALL. A warden ticked a checklist and threw it
--    away, which is not a roll call — the point of one is answering "who said
--    this child was in the building on Tuesday night" three weeks later.
--    SchoolRollCall is scoped to a house because that is who takes it, and
--    unique on (house, night, session) so two wardens at two desks cannot
--    produce two registers for the same night.
--
-- 2. THE SICK BAY HAD NOWHERE TO LIVE. Modelling it as another hostel and
--    moving the child into it frees their real bed, and the placer hands it to
--    somebody else while its owner is two doors away with a temperature. An
--    admission is a lighter second record: not in their bed tonight, and the
--    bed is not available.
--
-- 3. A BED HAD NO PLACE IN THE ROOM. `code` was free text, so the plan view
--    had to parse "04U" to work out where a bed physically is. bay + tier make
--    that data, and a school that types "4-upper" no longer breaks the drawing.
--
-- 4. OUT OF SERVICE HAD NO REASON. `status` said a bed could not be slept in
--    and never said why, so the warden chasing it had nowhere to write what
--    they were chasing.
--
-- Every column added here is nullable or defaulted, so this applies to a
-- populated database without a backfill.

-- ── enums ────────────────────────────────────────────────────────────────
CREATE TYPE "SchoolRollCallSession" AS ENUM ('MORNING', 'EVENING');
CREATE TYPE "SchoolRollCallStatus" AS ENUM ('OPEN', 'SUBMITTED');
CREATE TYPE "SchoolRollCallEntryStatus" AS ENUM ('NOT_SEEN', 'PRESENT', 'SIGNED_OUT', 'SICK_BAY', 'ABSENT');

-- ── the geometry of a bed, and why it is out ─────────────────────────────
ALTER TABLE "SchoolHostelBed"
  ADD COLUMN "statusReason" TEXT,
  ADD COLUMN "bay"          INTEGER,
  ADD COLUMN "tier"         TEXT;

CREATE INDEX "SchoolHostelBed_companyId_roomId_bay_idx"
  ON "SchoolHostelBed"("companyId", "roomId", "bay");

-- ── what a dormitory is for ──────────────────────────────────────────────
ALTER TABLE "SchoolHostelRoom"
  ADD COLUMN "isPrefectDorm" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "yearGroupIds"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ── who is a prefect ─────────────────────────────────────────────────────
ALTER TABLE "SchoolStudent"
  ADD COLUMN "isPrefect" BOOLEAN NOT NULL DEFAULT false;

-- ── the roll call ────────────────────────────────────────────────────────
CREATE TABLE "SchoolRollCall" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "hostelId"    TEXT NOT NULL,
  "termId"      TEXT NOT NULL,
  "takenOn"     TIMESTAMP(3) NOT NULL,
  "session"     "SchoolRollCallSession" NOT NULL DEFAULT 'EVENING',
  "status"      "SchoolRollCallStatus" NOT NULL DEFAULT 'OPEN',
  "takenById"   TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SchoolRollCall_pkey" PRIMARY KEY ("id")
);

-- One count per house per night per session. This is the upsert target, and
-- the reason opening the screen twice cannot produce two registers.
CREATE UNIQUE INDEX "SchoolRollCall_companyId_hostelId_takenOn_session_key"
  ON "SchoolRollCall"("companyId", "hostelId", "takenOn", "session");
CREATE INDEX "SchoolRollCall_companyId_takenOn_idx"
  ON "SchoolRollCall"("companyId", "takenOn");

CREATE TABLE "SchoolRollCallEntry" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "rollCallId" TEXT NOT NULL,
  "studentId"  TEXT NOT NULL,
  "bedId"      TEXT,
  "status"     "SchoolRollCallEntryStatus" NOT NULL DEFAULT 'NOT_SEEN',
  "notes"      TEXT,
  "recordedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SchoolRollCallEntry_pkey" PRIMARY KEY ("id")
);

-- A child appears once on a register. Without this, a double-tap on a slow
-- connection is two rows saying different things about the same night.
CREATE UNIQUE INDEX "SchoolRollCallEntry_rollCallId_studentId_key"
  ON "SchoolRollCallEntry"("rollCallId", "studentId");
CREATE INDEX "SchoolRollCallEntry_companyId_studentId_idx"
  ON "SchoolRollCallEntry"("companyId", "studentId");

-- ── the sick bay ─────────────────────────────────────────────────────────
CREATE TABLE "SchoolSickBayAdmission" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "studentId"    TEXT NOT NULL,
  "termId"       TEXT NOT NULL,
  "bedId"        TEXT,
  "admittedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dischargedAt" TIMESTAMP(3),
  "dischargedTo" TEXT,
  "reason"       TEXT NOT NULL,
  "notes"        TEXT,
  "admittedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SchoolSickBayAdmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolSickBayAdmission_companyId_studentId_admittedAt_idx"
  ON "SchoolSickBayAdmission"("companyId", "studentId", "admittedAt");
CREATE INDEX "SchoolSickBayAdmission_companyId_dischargedAt_idx"
  ON "SchoolSickBayAdmission"("companyId", "dischargedAt");

-- ── keys ─────────────────────────────────────────────────────────────────
ALTER TABLE "SchoolRollCall"
  ADD CONSTRAINT "SchoolRollCall_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolRollCall_hostelId_fkey"  FOREIGN KEY ("hostelId")  REFERENCES "SchoolHostel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolRollCall_termId_fkey"    FOREIGN KEY ("termId")    REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolRollCall_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolRollCallEntry"
  ADD CONSTRAINT "SchoolRollCallEntry_companyId_fkey"  FOREIGN KEY ("companyId")  REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolRollCallEntry_rollCallId_fkey" FOREIGN KEY ("rollCallId") REFERENCES "SchoolRollCall"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolRollCallEntry_studentId_fkey"  FOREIGN KEY ("studentId")  REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolSickBayAdmission"
  ADD CONSTRAINT "SchoolSickBayAdmission_companyId_fkey"    FOREIGN KEY ("companyId")    REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolSickBayAdmission_studentId_fkey"    FOREIGN KEY ("studentId")    REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolSickBayAdmission_termId_fkey"       FOREIGN KEY ("termId")       REFERENCES "SchoolTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolSickBayAdmission_bedId_fkey"        FOREIGN KEY ("bedId")        REFERENCES "SchoolHostelBed"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolSickBayAdmission_admittedById_fkey" FOREIGN KEY ("admittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
