/**
 * A school with a term behind it.
 *
 *   npx tsx scripts/seed-school-demo.ts --slug stmarys
 *   npx tsx scripts/seed-school-demo.ts --slug stmarys --students 120 --reset
 *
 * Phase 2.4 of `docs/testing/e2e-plan-2026-09-01.md`.
 *
 * ## Why this exists when `provision-school.ts` already does
 *
 * `provisionSchool` lays the skeleton — an academic year, three terms, the class
 * ladder, subjects, a starter fee structure, the school chart of accounts. It
 * deliberately creates **no people**. That is right for opening a real school,
 * where the pupils arrive through admissions, and useless for testing: with no
 * students there is no register to mark, no report card to publish, no invoice
 * to chase, and — the part that blocks most of the suite — **no portal accounts,
 * so the student, parent and teacher portals cannot be signed into at all.**
 *
 * On 2026-09-01 the database held thirteen SCHOOLS-profile tenants and every one
 * of them was a `PROVISIONING` test fixture with four students. Nothing to test
 * against, and nothing to photograph.
 *
 * ## Rows that are wrong on purpose
 *
 * A happy-path seed is how an exception state ships without anybody looking at
 * it. `seed-retail-demo.ts` seeds a short shift and a part-received PO for this
 * reason, and `seed-payroll-demo.ts` an employee with no BP number. Here:
 *
 *   - a pupil with **no guardian on file**, so the un-contactable path renders
 *   - a pupil **suspended**, who stays on the roll and in the class
 *   - invoices **part-paid** and **overdue**, so arrears is not an empty list
 *   - a child **absent repeatedly**, which is what attendance follow-up is for
 *   - one assessment left **unmarked**, and one pupil marked **absent** for it
 *   - a boarder **unaccounted for** at tonight's roll call, and tonight's roll
 *     call still **open** — the two states a matron actually works
 *   - a pupil **in the sick bay right now**, not only discharged ones
 *   - four conduct incidents **not yet passed home**, and one nobody has seen
 *   - a merit **reversed**, because a total that can only go up is not trusted
 *   - a result sheet **sent back by the HOD**, with the comment saying why
 *   - two exam candidates **not entered** with the deadline three weeks out,
 *     one entry **late** and one **withdrawn**
 *   - a leaver **still open** with fees and library outstanding
 *   - a library book **overdue and fined**, and a copy **withdrawn** so the
 *     catalogue and the shelf disagree the way they really do
 *   - a fee receipt **overpaid** (and refunded), one **voided**, one **draft**
 *   - an import job stuck in **preview** with rows that will not go in
 *   - a lesson somebody else is **covering**, and free parents' evening slots
 *
 * ## Deterministic
 *
 * The generator is a seeded LCG, as in `seed-crm-year.ts`. Two runs produce the
 * same school, so a screenshot diff means a code change rather than fresh random
 * data. Idempotent by student/guardian number — re-running updates rather than
 * duplicating.
 *
 * The modules from the timetable down are *rebuilt* rather than merged, by
 * `clearExtendedModules` at the top of that part. Most of them are rows with no
 * natural key — a roll-call entry, an exam seat, a detention — so an upsert has
 * nothing to match on and a second run would quietly double the school. The
 * roll itself is still upserted, so pupil ids survive and anything pinned to
 * them keeps working.
 *
 * ## What is covered
 *
 * Every table the schools module has: the roll, guardians and portal accounts;
 * attendance, assessments, result sheets through moderation, and the grading
 * scheme under them; fees, receipts, waivers and a refund; the timetable, its
 * rooms and periods, lesson plans and cover; boarding houses down to the bed,
 * exeat and the gate log, evening roll call, the sick bay and health records;
 * conduct, merits, demerits and detention; public examinations across two
 * series, with candidates, entries, seating, access arrangements and last
 * year's results; admissions from enquiry to enrolled; leavers, clearance and
 * alumni; the library, transport, homework, schemes of work and teaching
 * resources; guardian messages, portal invites, pastoral notes with their
 * access requests, and the import jobs that built the roll.
 *
 * ## What it does NOT do, and why
 *
 * Fee invoices are written directly rather than through
 * `POST /api/v2/schools/fees/invoices/bulk-generate`. That route also posts to
 * the ledger and fiscalises, and its logic lives in the route rather than in a
 * library, so calling it from a script would mean either a session or a
 * reimplementation that drifts. Seeded invoices are therefore **history without
 * journals**. The accounting seam is covered the right way instead: the e2e
 * suite raises an invoice *through the UI*, which exercises the real path.
 *
 * Never point it at production.
 */

import "dotenv/config";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { ensureCurrentTermEnrolments, provisionSchool } from "@/lib/schools/provision";

/* ── Arguments ────────────────────────────────────────────────────────── */

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === `--${name}`) return process.argv[index + 1];
    if (argument.startsWith(prefix)) return argument.slice(prefix.length);
  }
  return undefined;
}

const SLUG = (readArg("slug") ?? "stmarys").trim().toLowerCase();
const STUDENT_COUNT = Number(readArg("students") ?? 120);
const RESET = process.argv.includes("--reset");
const PASSWORD = "SchoolDemo123!";

/* ── Deterministic randomness ─────────────────────────────────────────── */

/** Seeded LCG. Same numbers every run, so screenshots are comparable. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const random = makeRandom(20260901);

const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));

/* ── People ───────────────────────────────────────────────────────────── */

const FIRST_NAMES = [
  "Tadiwa", "Anesu", "Rutendo", "Takudzwa", "Nyasha", "Tanaka", "Munashe", "Kudzai",
  "Farai", "Chipo", "Tinashe", "Rumbidzai", "Panashe", "Tafara", "Vimbai", "Simba",
  "Ropafadzo", "Tapiwa", "Shamiso", "Blessing", "Tatenda", "Nokutenda", "Mazvita",
  "Danai", "Tendai", "Rufaro", "Kundai", "Batsirai", "Chiedza", "Fadzai",
];

const LAST_NAMES = [
  "Moyo", "Ncube", "Dube", "Sibanda", "Nyathi", "Chirwa", "Mutasa", "Makoni",
  "Gwena", "Marange", "Mhlanga", "Zvobgo", "Chikafu", "Mutsvangwa", "Nyoni",
  "Bhebhe", "Mpofu", "Shumba", "Chidzambwa", "Muponda",
];

const TEACHERS = [
  { first: "Grace", last: "Mutasa", dept: "Mathematics", hod: true },
  { first: "Obert", last: "Chigumba", dept: "Sciences", hod: true },
  { first: "Loveness", last: "Zhou", dept: "Languages", hod: true },
  { first: "Wellington", last: "Mabika", dept: "Humanities", hod: false },
  { first: "Precious", last: "Nyamande", dept: "Commercials", hod: false },
  { first: "Tichaona", last: "Rusike", dept: "Sciences", hod: false },
  { first: "Memory", last: "Chagonda", dept: "Languages", hod: false },
  { first: "Edmore", last: "Sithole", dept: "Mathematics", hod: false },
];

const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Aunt", "Uncle", "Grandmother"];

const STREETS = ["Samora Machel", "Josiah Tongogara", "Herbert Chitepo", "Leopold Takawira"];

const pad = (value: number, width = 4) => String(value).padStart(width, "0");

/* ── Rebuilt modules ──────────────────────────────────────────────────── */

/**
 * Clear the rows the extended modules own for this tenant.
 *
 * Children before parents, and `SchoolRoom` last of all: detentions and exam
 * allocations point at it. Everything here is written by this script and
 * belongs to one tenant, so there is nothing of anybody else's to lose.
 */
async function clearExtendedModules(companyId: string) {
  const scope = { where: { companyId } };

  await prisma.schoolCoverAssignment.deleteMany(scope);
  await prisma.schoolLessonPlan.deleteMany(scope);
  await prisma.schoolTimetableSlot.deleteMany(scope);
  await prisma.schoolPeriod.deleteMany(scope);

  await prisma.schoolResultModerationAction.deleteMany(scope);
  await prisma.schoolResultLine.deleteMany(scope);
  await prisma.schoolResultSheet.deleteMany(scope);
  await prisma.schoolPublishWindow.deleteMany(scope);
  await prisma.schoolGradingBand.deleteMany(scope);
  await prisma.schoolGradingScheme.deleteMany(scope);

  await prisma.schoolDetentionAttendance.deleteMany(scope);
  await prisma.schoolDetentionAward.deleteMany(scope);
  await prisma.schoolDetentionSession.deleteMany(scope);
  await prisma.schoolMeritEntry.deleteMany(scope);
  await prisma.schoolMeritReason.deleteMany(scope);
  await prisma.schoolConductAccount.deleteMany(scope);
  await prisma.schoolConductParticipant.deleteMany(scope);
  await prisma.schoolConductIncident.deleteMany(scope);
  await prisma.schoolConductCategory.deleteMany(scope);

  await prisma.schoolExamEntryFileRun.deleteMany(scope);
  await prisma.schoolExamSeat.deleteMany(scope);
  await prisma.schoolExamRoomAllocation.deleteMany(scope);
  await prisma.schoolExamSession.deleteMany(scope);
  await prisma.schoolExamAccessArrangement.deleteMany(scope);
  await prisma.schoolExamResult.deleteMany(scope);
  await prisma.schoolExamEntry.deleteMany(scope);
  await prisma.schoolExamPaper.deleteMany(scope);
  await prisma.schoolCandidate.deleteMany(scope);
  await prisma.schoolExamSeries.deleteMany(scope);
  await prisma.schoolExamSubject.deleteMany(scope);
  await prisma.schoolExamCentre.deleteMany(scope);
  await prisma.schoolExamBoard.deleteMany(scope);

  await prisma.schoolBoardingMovementLog.deleteMany(scope);
  await prisma.schoolLeaveRequest.deleteMany(scope);
  await prisma.schoolRollCallEntry.deleteMany(scope);
  await prisma.schoolRollCall.deleteMany(scope);
  await prisma.schoolSickBayAdmission.deleteMany(scope);
  await prisma.schoolBoardingAllocation.deleteMany(scope);
  await prisma.schoolHostelBed.deleteMany(scope);
  await prisma.schoolHostelRoom.deleteMany(scope);
  await prisma.schoolHostel.deleteMany(scope);

  await prisma.schoolHealthEvent.deleteMany(scope);
  await prisma.schoolHealthRecord.deleteMany(scope);

  await prisma.schoolAlumniUpdate.deleteMany(scope);
  await prisma.schoolAlumnus.deleteMany(scope);
  await prisma.schoolLeaverClearance.deleteMany(scope);
  await prisma.schoolLeaver.deleteMany(scope);

  await prisma.schoolApplicationEvent.deleteMany(scope);
  await prisma.schoolApplication.deleteMany(scope);

  await prisma.schoolBookLoan.deleteMany(scope);
  await prisma.schoolBookReservation.deleteMany(scope);
  await prisma.schoolBookCopy.deleteMany(scope);
  await prisma.schoolBook.deleteMany(scope);

  await prisma.schoolTransportBoarding.deleteMany(scope);
  await prisma.schoolTransportRider.deleteMany(scope);
  await prisma.schoolTransportStop.deleteMany(scope);
  await prisma.schoolTransportRoute.deleteMany(scope);

  await prisma.schoolAssignmentSubmission.deleteMany(scope);
  await prisma.schoolAssignment.deleteMany(scope);

  await prisma.schoolFeeRefund.deleteMany(scope);
  await prisma.schoolFeeReceiptAllocation.deleteMany(scope);
  await prisma.schoolFeeReceipt.deleteMany(scope);
  await prisma.schoolFeeWaiver.deleteMany(scope);

  await prisma.schoolMessage.deleteMany(scope);
  await prisma.schoolMessageThread.deleteMany(scope);

  await prisma.schoolPastoralNoteReader.deleteMany(scope);
  await prisma.schoolPastoralAccessRequest.deleteMany(scope);
  await prisma.schoolPastoralNote.deleteMany(scope);
  await prisma.schoolPastoralClearance.deleteMany(scope);

  await prisma.schoolPortalInvite.deleteMany(scope);
  await prisma.schoolSchemeOfWork.deleteMany(scope);
  await prisma.schoolTeachingResource.deleteMany(scope);

  await prisma.schoolImportArtifact.deleteMany(scope);
  await prisma.schoolImportRow.deleteMany(scope);
  await prisma.schoolImportJob.deleteMany(scope);

  await prisma.schoolStudentGoal.deleteMany(scope);
  await prisma.schoolStudentHonour.deleteMany(scope);
  await prisma.schoolParentMeeting.deleteMany(scope);
  await prisma.schoolCalendarEvent.deleteMany(scope);

  await prisma.schoolRoom.deleteMany(scope);
}

/* ── Run ──────────────────────────────────────────────────────────────── */

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to seed.");
  }

  const company = await prisma.company.findUnique({
    where: { slug: SLUG },
    select: { id: true, name: true },
  });
  if (!company) {
    throw new Error(
      `No company with slug "${SLUG}". Create the tenant first:\n` +
        `  npx tsx scripts/seed-staging-tenant.ts --slug ${SLUG} ` +
        `--email head@${SLUG}.test --password '${PASSWORD}' --name "St Marys High School" --user-name "Head Teacher"`,
    );
  }
  const companyId = company.id;
  /*
    Say what this tenant *is*. `Company.workspaceProfile` defaults to GENERAL,
    and a GENERAL tenant falls through to inference — which, on a demo tenant
    with the whole product switched on, has nothing to go on. Before this, the
    workspace switcher read "Retail" above every screen of every vertical.
  */
  await prisma.company.update({
    where: { id: companyId },
    data: { workspaceProfile: "SCHOOLS" },
  });

  console.log(`Seeding ${company.name} (${SLUG})`);

  /* ── The skeleton ─────────────────────────────────────────────────── */

  const provisioned = await provisionSchool({ companyId, level: "SECONDARY", year: 2026 });
  const term = provisioned.terms.find((candidate) => candidate.isActive) ?? provisioned.terms[0];
  if (!term) throw new Error("provisionSchool returned no terms.");
  console.log(
    `  year ${provisioned.academicYear.code}, ${provisioned.terms.length} terms, ` +
      `${provisioned.classesCreated} classes, ${provisioned.subjectsCreated} subjects ` +
      `(current term ${term.code})`,
  );

  if (RESET) {
    // Order matters: children before parents. Everything here is seeded data
    // belonging to this tenant only.
    await prisma.schoolAssessmentScore.deleteMany({ where: { companyId } });
    await prisma.schoolAssessment.deleteMany({ where: { companyId } });
    await prisma.schoolAttendanceSessionLine.deleteMany({ where: { companyId } });
    await prisma.schoolAttendanceSession.deleteMany({ where: { companyId } });
    await prisma.schoolFeeInvoiceLine.deleteMany({ where: { companyId } });
    await prisma.schoolFeeInvoice.deleteMany({ where: { companyId } });
    await prisma.schoolEnrollment.deleteMany({ where: { companyId } });
    await prisma.schoolStudentGuardian.deleteMany({ where: { companyId } });
    console.log("  reset: cleared previous roll activity");
  }

  const classes = await prisma.schoolClass.findMany({
    where: { companyId },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const subjects = await prisma.schoolSubject.findMany({
    where: { companyId, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  if (classes.length === 0 || subjects.length === 0) {
    throw new Error("No classes or subjects after provisioning — cannot continue.");
  }

  /* ── Teachers ─────────────────────────────────────────────────────── */

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const teacherProfiles: Array<{ id: string; userId: string; name: string; email: string }> = [];

  for (let index = 0; index < TEACHERS.length; index += 1) {
    const person = TEACHERS[index];
    const email = `${person.first}.${person.last}@${SLUG}.test`.toLowerCase();
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: `${person.first} ${person.last}`, companyId, isActive: true },
      create: {
        email,
        name: `${person.first} ${person.last}`,
        password: passwordHash,
        role: person.hod ? "HOD" : "TEACHER",
        companyId,
        isActive: true,
      },
      select: { id: true },
    });

    const profile = await prisma.schoolTeacherProfile.upsert({
      where: { companyId_userId: { companyId, userId: user.id } },
      update: { department: person.dept, isHod: person.hod, isActive: true },
      create: {
        companyId,
        userId: user.id,
        employeeCode: `TCH-${pad(index + 1, 3)}`,
        department: person.dept,
        isClassTeacher: index < classes.length,
        isHod: person.hod,
        isActive: true,
      },
      select: { id: true },
    });
    teacherProfiles.push({
      id: profile.id,
      userId: user.id,
      name: `${person.first} ${person.last}`,
      email,
    });
  }
  console.log(`  ${teacherProfiles.length} teachers`);

  /* ── Who teaches what ─────────────────────────────────────────────── */

  const classSubjects: Array<{
    id: string;
    classId: string;
    subjectId: string;
    teacherProfileId: string;
  }> = [];
  for (const schoolClass of classes) {
    for (let index = 0; index < subjects.length; index += 1) {
      const subject = subjects[index];
      const teacher = teacherProfiles[index % teacherProfiles.length];
      // `findFirst` then write, not `upsert`. The unique is
      // `[companyId, termId, classId, streamId, subjectId]` and `streamId` is
      // nullable — Prisma refuses `null` inside a compound-unique `where`
      // ("Argument `streamId` must not be null"), because SQL `= NULL` is not a
      // match. These classes have no streams, so null is the normal case.
      const existing = await prisma.schoolClassSubject.findFirst({
        where: {
          companyId,
          termId: term.id,
          classId: schoolClass.id,
          streamId: null,
          subjectId: subject.id,
        },
        select: { id: true },
      });

      const row = existing
        ? await prisma.schoolClassSubject.update({
            where: { id: existing.id },
            data: { teacherProfileId: teacher.id, isActive: true },
            select: { id: true },
          })
        : await prisma.schoolClassSubject.create({
            data: {
              companyId,
              termId: term.id,
              classId: schoolClass.id,
              streamId: null,
              subjectId: subject.id,
              teacherProfileId: teacher.id,
              isActive: true,
            },
            select: { id: true },
          });
      classSubjects.push({
        id: row.id,
        classId: schoolClass.id,
        subjectId: subject.id,
        teacherProfileId: teacher.id,
      });
    }
  }
  console.log(`  ${classSubjects.length} class-subject assignments`);

  /* ── The roll ─────────────────────────────────────────────────────── */

  type Pupil = {
    id: string;
    no: string;
    name: string;
    first: string;
    last: string;
    gender: string;
    classId: string;
    boarding: boolean;
    status: string;
  };
  const pupils: Pupil[] = [];

  for (let index = 0; index < STUDENT_COUNT; index += 1) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const studentNo = `STU-${pad(index + 1)}`;
    const schoolClass = classes[index % classes.length];
    const boarding = random() < 0.35;

    // One pupil is suspended. They stay on the roll and in the class they will
    // come back to — `ensureCurrentTermEnrolments` treats SUSPENDED as enrolled.
    const status = index === 7 ? "SUSPENDED" : "ACTIVE";

    const student = await prisma.schoolStudent.upsert({
      where: { companyId_studentNo: { companyId, studentNo } },
      update: {
        firstName: first,
        lastName: last,
        currentClassId: schoolClass.id,
        isBoarding: boarding,
        status,
      },
      create: {
        companyId,
        studentNo,
        admissionNo: `ADM-${pad(index + 1)}`,
        firstName: first,
        lastName: last,
        dateOfBirth: new Date(Date.UTC(2026 - between(12, 18), between(1, 12), between(1, 28))),
        gender: random() < 0.5 ? "F" : "M",
        status,
        currentClassId: schoolClass.id,
        isBoarding: boarding,
        admissionDate: new Date(Date.UTC(2026 - between(0, 4), 1, 12)),
      },
      // Gender is written on create only, so a re-run keeps whatever the first
      // run rolled. Read it back rather than re-deriving it, or the hostel a
      // boarder is allocated to would move between runs.
      select: { id: true, gender: true },
    });

    pupils.push({
      id: student.id,
      no: studentNo,
      name: `${first} ${last}`,
      first,
      last,
      gender: student.gender ?? "F",
      classId: schoolClass.id,
      boarding,
      status,
    });
  }
  console.log(
    `  ${pupils.length} pupils (one suspended, ${pupils.filter((p) => p.boarding).length} boarding)`,
  );

  /* ── Guardians ────────────────────────────────────────────────────── */

  let guardianCount = 0;
  for (let index = 0; index < pupils.length; index += 1) {
    // Pupil 4 is deliberately left with no guardian on file.
    if (index === 3) continue;

    const pupil = pupils[index];
    const guardianNo = `GRD-${pad(index + 1)}`;
    const first = pick(FIRST_NAMES);
    const last = pupil.name.split(" ")[1];

    const guardian = await prisma.schoolGuardian.upsert({
      where: { companyId_guardianNo: { companyId, guardianNo } },
      update: { firstName: first, lastName: last },
      create: {
        companyId,
        guardianNo,
        firstName: first,
        lastName: last,
        phone: `+2637${between(10000000, 99999999)}`,
        email: `${first}.${last}.${index + 1}@guardians.${SLUG}.test`.toLowerCase(),
        address: `${between(1, 200)} ${pick(STREETS)} Ave, Harare`,
      },
      select: { id: true },
    });

    await prisma.schoolStudentGuardian.upsert({
      where: {
        companyId_studentId_guardianId: {
          companyId,
          studentId: pupil.id,
          guardianId: guardian.id,
        },
      },
      update: { isPrimary: true },
      create: {
        companyId,
        studentId: pupil.id,
        guardianId: guardian.id,
        relationship: pick(RELATIONSHIPS),
        isPrimary: true,
        canReceiveFinancials: true,
        canReceiveAcademicResults: true,
      },
    });
    guardianCount += 1;
  }
  console.log(`  ${guardianCount} guardians (pupil 4 deliberately has none)`);

  /* ── Portal accounts ──────────────────────────────────────────────── */

  // The three logins the portal suites sign in as. Well-known addresses, because
  // a test should name a person rather than hunt for one.
  const portalStudent = pupils[0];
  const studentUser = await prisma.user.upsert({
    where: { email: `student@${SLUG}.test` },
    update: { name: portalStudent.name, companyId, isActive: true },
    create: {
      email: `student@${SLUG}.test`,
      name: portalStudent.name,
      password: passwordHash,
      role: "STUDENT",
      companyId,
      isActive: true,
    },
    select: { id: true },
  });
  await prisma.schoolStudent.update({
    where: { id: portalStudent.id },
    data: { userId: studentUser.id },
  });

  const primaryLink = await prisma.schoolStudentGuardian.findFirst({
    where: { companyId, studentId: portalStudent.id },
    select: { guardianId: true },
  });
  if (!primaryLink) throw new Error("The portal pupil has no guardian to sign in as.");

  const parentUser = await prisma.user.upsert({
    where: { email: `parent@${SLUG}.test` },
    update: { companyId, isActive: true },
    create: {
      email: `parent@${SLUG}.test`,
      name: "Parent Account",
      password: passwordHash,
      role: "PARENT",
      companyId,
      isActive: true,
    },
    select: { id: true },
  });
  await prisma.schoolGuardian.update({
    where: { id: primaryLink.guardianId },
    data: { userId: parentUser.id },
  });

  console.log(
    `  portal accounts: student@${SLUG}.test, parent@${SLUG}.test, ${teacherProfiles[0].email}`,
  );

  /* ── Enrolments ───────────────────────────────────────────────────── */

  const enrolled = await ensureCurrentTermEnrolments({ companyId, termId: term.id });
  console.log(`  ${enrolled} enrolments for ${term.code}`);

  /* ── Attendance ───────────────────────────────────────────────────── */

  const headUser = await prisma.user.findFirst({
    where: { companyId, role: { in: ["SUPERADMIN", "SCHOOL_ADMIN"] } },
    select: { id: true },
  });
  const markerId = headUser?.id ?? studentUser.id;

  // The fifteen most recent weekdays. A register is a school day, not a date.
  const days: Date[] = [];
  const cursor = new Date(Date.UTC(2026, 8, 1));
  while (days.length < 15) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(new Date(cursor));
  }

  let sessionCount = 0;
  let lineCount = 0;
  for (const schoolClass of classes) {
    const roll = pupils.filter((pupil) => pupil.classId === schoolClass.id);
    if (roll.length === 0) continue;

    for (const day of days) {
      // Same nullable-`streamId` limitation as the class-subject write above.
      const existingSession = await prisma.schoolAttendanceSession.findFirst({
        where: {
          companyId,
          termId: term.id,
          classId: schoolClass.id,
          streamId: null,
          attendanceDate: day,
        },
        select: { id: true },
      });

      const session =
        existingSession ??
        (await prisma.schoolAttendanceSession.create({
          data: {
            companyId,
            termId: term.id,
            classId: schoolClass.id,
            streamId: null,
            attendanceDate: day,
            createdByUserId: markerId,
            submittedByUserId: markerId,
            submittedAt: day,
          },
          select: { id: true },
        }));
      sessionCount += 1;

      await prisma.schoolAttendanceSessionLine.deleteMany({
        where: { companyId, sessionId: session.id },
      });
      await prisma.schoolAttendanceSessionLine.createMany({
        data: roll.map((pupil, index) => {
          // Index 1 in each class is absent far more often than anyone else —
          // that is what the follow-up screen is for.
          const chronic = index === 1;
          const draw = random();
          const status = chronic
            ? draw < 0.55
              ? "ABSENT"
              : "PRESENT"
            : draw < 0.03
              ? "ABSENT"
              : draw < 0.06
                ? "LATE"
                : draw < 0.07
                  ? "EXCUSED"
                  : "PRESENT";
          return {
            companyId,
            sessionId: session.id,
            studentId: pupil.id,
            status: status as "PRESENT" | "ABSENT" | "LATE" | "EXCUSED",
          };
        }),
        skipDuplicates: true,
      });
      lineCount += roll.length;
    }
  }
  console.log(`  ${sessionCount} attendance sessions, ${lineCount} marks`);

  /* ── Assessments ──────────────────────────────────────────────────── */

  let assessmentCount = 0;
  let scoreCount = 0;
  for (const classSubject of classSubjects) {
    const roll = pupils.filter((pupil) => pupil.classId === classSubject.classId);
    if (roll.length === 0) continue;

    // A term's marks are two things a report card shows apart: the continuous
    // work and the paper at the end. `SchoolAssessmentKind` distinguishes them,
    // and the 30/70 weighting is the usual Zimbabwean split.
    const papers = [
      { title: "Mid-term test", kind: "CONTINUOUS" as const, weight: 30, day: 12 },
      { title: "End-of-term exam", kind: "EXAM" as const, weight: 70, day: 2 },
    ];

    for (const [index, paper] of papers.entries()) {
      const assessment = await prisma.schoolAssessment.create({
        data: {
          companyId,
          termId: term.id,
          classSubjectId: classSubject.id,
          title: paper.title,
          kind: paper.kind,
          maxScore: new Prisma.Decimal(100),
          weight: new Prisma.Decimal(paper.weight),
          assessedOn: days[paper.day],
          createdById: markerId,
        },
        select: { id: true },
      });
      assessmentCount += 1;

      // The end-of-term exam for the very first class-subject is left unmarked,
      // so the "not yet marked" state is reachable.
      if (classSubject === classSubjects[0] && index === 1) continue;

      await prisma.schoolAssessmentScore.createMany({
        data: roll.map((pupil, position) => {
          const absent = position === 2;
          return {
            companyId,
            assessmentId: assessment.id,
            studentId: pupil.id,
            score: absent ? null : new Prisma.Decimal(between(28, 96)),
            isAbsent: absent,
            markedById: markerId,
          };
        }),
        skipDuplicates: true,
      });
      scoreCount += roll.length;
    }
  }
  console.log(`  ${assessmentCount} assessments, ${scoreCount} scores (one paper left unmarked)`);

  /* ── Fees ─────────────────────────────────────────────────────────── */

  /*
    `provisionSchool` creates exactly one fee structure for the whole school —
    first class, first term, status DRAFT — and returns early if any exists. A
    school opened in January and now sitting in Term 3 therefore has a structure
    for T1 and nothing for the term it is actually teaching, so there is nothing
    to invoice against and the whole fees module renders empty.

    So bill per class, for the current term, the way a school would: tuition
    scaled by level (a Form 6 costs more than a Form 1), plus a development levy
    and a boarding charge. ACTIVE, not DRAFT — a draft cannot be invoiced from.
  */
  const structures = new Map<string, { id: string; currency: string }>();
  for (const [index, schoolClass] of classes.entries()) {
    const tuition = 250 + index * 40;
    const lines = [
      { feeCode: "TUITION", description: `Tuition — ${schoolClass.name}`, amount: tuition },
      { feeCode: "DEVLEVY", description: "Development levy", amount: 60 },
      { feeCode: "BOARDING", description: "Boarding", amount: 180 },
    ];

    const found = await prisma.schoolFeeStructure.findFirst({
      where: { companyId, termId: term.id, classId: schoolClass.id, name: "Term fees" },
      select: { id: true, currency: true },
    });

    if (found) {
      structures.set(schoolClass.id, found);
      continue;
    }

    const created = await prisma.schoolFeeStructure.create({
      data: {
        companyId,
        termId: term.id,
        classId: schoolClass.id,
        name: "Term fees",
        status: "ACTIVE",
        lines: {
          create: lines.map((line, order) => ({
            companyId,
            feeCode: line.feeCode,
            description: line.description,
            amount: new Prisma.Decimal(line.amount),
            isMandatory: line.feeCode !== "BOARDING",
            sortOrder: order,
          })),
        },
      },
      select: { id: true, currency: true },
    });
    structures.set(schoolClass.id, created);
  }
  console.log(`  ${structures.size} fee structures for ${term.code}`);

  const structureLines = new Map<
    string,
    Array<{ feeCode: string; description: string; amount: Prisma.Decimal }>
  >();
  for (const [classId, record] of structures) {
    const rows = await prisma.schoolFeeStructureLine.findMany({
      where: { companyId, feeStructureId: record.id },
      select: { feeCode: true, description: true, amount: true },
      orderBy: { sortOrder: "asc" },
    });
    structureLines.set(classId, rows);
  }

  let invoiceCount = 0;
  let paidCount = 0;
  let partPaidCount = 0;
  let overdueCount = 0;

  {
    for (let index = 0; index < pupils.length; index += 1) {
      const pupil = pupils[index];
      const structure = structures.get(pupil.classId);
      const allLines = structureLines.get(pupil.classId) ?? [];
      if (!structure || allLines.length === 0) continue;

      // A day scholar is not billed for boarding. This is the one line that
      // varies by pupil rather than by class, and leaving it on everybody would
      // make every invoice in the school identical — which is exactly the kind
      // of seeded data that makes a bug invisible.
      const lines = allLines.filter((line) => pupil.boarding || line.feeCode !== "BOARDING");
      const total = lines.reduce(
        (sum, line) => sum.plus(new Prisma.Decimal(line.amount)),
        new Prisma.Decimal(0),
      );

      const invoiceNo = `SFI-${pad(index + 1, 5)}`;

      // A third paid, a fifth part-paid, the rest outstanding — and the first
      // twelve issued long enough ago to be genuinely overdue.
      const draw = random();
      const overdue = index < 12;
      const paid =
        draw < 0.34 ? total : draw < 0.55 ? total.dividedBy(2) : new Prisma.Decimal(0);
      const balance = total.minus(paid);
      const status = balance.isZero() ? "PAID" : paid.isZero() ? "ISSUED" : "PART_PAID";

      const issueDate = overdue ? new Date(Date.UTC(2026, 4, 10)) : new Date(Date.UTC(2026, 7, 20));
      const dueDate = overdue ? new Date(Date.UTC(2026, 5, 10)) : new Date(Date.UTC(2026, 8, 20));

      const invoice = await prisma.schoolFeeInvoice.upsert({
        where: { companyId_invoiceNo: { companyId, invoiceNo } },
        update: {
          paidAmount: paid,
          balanceAmount: balance,
          status,
          subTotal: total,
          totalAmount: total,
          baseAmount: total,
        },
        create: {
          companyId,
          invoiceNo,
          studentId: pupil.id,
          termId: term.id,
          feeStructureId: structure.id,
          issueDate,
          dueDate,
          status,
          currency: structure.currency,
          subTotal: total,
          totalAmount: total,
          paidAmount: paid,
          balanceAmount: balance,
          baseAmount: total,
          issuedById: markerId,
          issuedAt: issueDate,
          createdById: markerId,
        },
        select: { id: true },
      });

      await prisma.schoolFeeInvoiceLine.deleteMany({
        where: { companyId, invoiceId: invoice.id },
      });
      await prisma.schoolFeeInvoiceLine.createMany({
        data: lines.map((line) => ({
          companyId,
          invoiceId: invoice.id,
          feeCode: line.feeCode,
          description: line.description,
          quantity: new Prisma.Decimal(1),
          unitAmount: new Prisma.Decimal(line.amount),
          lineTotal: new Prisma.Decimal(line.amount),
        })),
      });

      invoiceCount += 1;
      if (status === "PAID") paidCount += 1;
      if (status === "PART_PAID") partPaidCount += 1;
      if (overdue && status !== "PAID") overdueCount += 1;
    }
  }
  console.log(
    `  ${invoiceCount} fee invoices — ${paidCount} paid, ${partPaidCount} part-paid, ${overdueCount} overdue`,
  );

  /* ── Rebuild, not merge ───────────────────────────────────────────── */

  /*
    Everything from here down is cleared and rewritten on every run.

    Most of it has no natural key — a roll-call entry, an exam seat, a
    detention — so an upsert has nothing to match on and a second run would
    quietly double the school. Deleting what this script owns for this tenant
    and writing it again is the only version that is honestly idempotent, and
    it costs about a second. The roll above is still upserted, so pupil ids,
    and anything a tester has pinned to them, survive.
  */
  await clearExtendedModules(companyId);

  /* ── Rooms and the day's shape ────────────────────────────────────── */

  const rooms: Array<{ id: string; code: string }> = [];
  for (let index = 0; index < classes.length; index += 1) {
    const room = await prisma.schoolRoom.upsert({
      where: { companyId_code: { companyId, code: `R${index + 1}` } },
      update: { name: `Room ${index + 1}`, isActive: true },
      create: {
        companyId,
        code: `R${index + 1}`,
        name: `Room ${index + 1}`,
        capacity: 40,
        kind: "CLASSROOM",
      },
      select: { id: true, code: true },
    });
    rooms.push(room);
  }
  for (const special of [
    { code: "LAB1", name: "Science Laboratory 1", capacity: 32, kind: "LAB" },
    { code: "LAB2", name: "Science Laboratory 2", capacity: 32, kind: "LAB" },
    { code: "LIB", name: "Library", capacity: 60, kind: "LIBRARY" },
    { code: "HALL", name: "Assembly Hall", capacity: 400, kind: "HALL" },
  ]) {
    const room = await prisma.schoolRoom.upsert({
      where: { companyId_code: { companyId, code: special.code } },
      update: { name: special.name, isActive: true },
      create: { companyId, ...special },
      select: { id: true, code: true },
    });
    rooms.push(room);
  }

  // Minutes from midnight. Break and lunch are periods too — a timetable that
  // omits them cannot answer "what is the class doing at eleven", which is the
  // question a parent on the phone actually asks.
  const PERIODS = [
    { code: "P1", name: "Period 1", start: 480, end: 520, teaching: true },
    { code: "P2", name: "Period 2", start: 520, end: 560, teaching: true },
    { code: "BREAK", name: "Break", start: 560, end: 580, teaching: false },
    { code: "P3", name: "Period 3", start: 580, end: 620, teaching: true },
    { code: "P4", name: "Period 4", start: 620, end: 660, teaching: true },
    { code: "LUNCH", name: "Lunch", start: 660, end: 700, teaching: false },
    { code: "P5", name: "Period 5", start: 700, end: 740, teaching: true },
    { code: "P6", name: "Period 6", start: 740, end: 780, teaching: true },
  ];

  const periods: Array<{ id: string; code: string; teaching: boolean }> = [];
  for (let index = 0; index < PERIODS.length; index += 1) {
    const period = PERIODS[index];
    const row = await prisma.schoolPeriod.upsert({
      where: { companyId_termId_code: { companyId, termId: term.id, code: period.code } },
      update: {
        name: period.name,
        startMinute: period.start,
        endMinute: period.end,
        sequence: index + 1,
        isTeaching: period.teaching,
      },
      create: {
        companyId,
        termId: term.id,
        code: period.code,
        name: period.name,
        startMinute: period.start,
        endMinute: period.end,
        sequence: index + 1,
        isTeaching: period.teaching,
      },
      select: { id: true, code: true, isTeaching: true },
    });
    periods.push({ id: row.id, code: row.code, teaching: row.isTeaching });
  }

  /* ── The timetable ────────────────────────────────────────────────── */

  /*
    Greedy, and it has to be: `SchoolTimetableSlot` is unique on
    (term, day, period, teacher), so a teacher cannot be in two rooms at once —
    the database enforces the one rule a hand-written timetable always breaks.
    Six classes and eight teachers leaves room to place every class in every
    teaching period, and taking the least-taught subject first spreads the
    thirteen subjects evenly instead of timetabling Maths six times on Monday.
  */
  const teachingPeriods = periods.filter((period) => period.teaching);
  const busyTeacher = new Set<string>();
  const subjectLoad = new Map<string, number>();
  const timetableRows: Prisma.SchoolTimetableSlotCreateManyInput[] = [];

  for (let day = 1; day <= 5; day += 1) {
    for (const period of teachingPeriods) {
      for (let classIndex = 0; classIndex < classes.length; classIndex += 1) {
        const schoolClass = classes[classIndex];
        const candidates = classSubjects
          .filter((candidate) => candidate.classId === schoolClass.id)
          .sort(
            (left, right) =>
              (subjectLoad.get(left.id) ?? 0) - (subjectLoad.get(right.id) ?? 0),
          );
        const chosen = candidates.find(
          (candidate) => !busyTeacher.has(`${day}|${period.id}|${candidate.teacherProfileId}`),
        );
        // No free teacher for this class this period: leave it a study period
        // rather than write a clash the unique index would refuse anyway.
        if (!chosen) continue;

        busyTeacher.add(`${day}|${period.id}|${chosen.teacherProfileId}`);
        subjectLoad.set(chosen.id, (subjectLoad.get(chosen.id) ?? 0) + 1);
        timetableRows.push({
          companyId,
          termId: term.id,
          classSubjectId: chosen.id,
          periodId: period.id,
          dayOfWeek: day,
          roomId: rooms[classIndex % rooms.length].id,
          classId: schoolClass.id,
          streamId: null,
          teacherProfileId: chosen.teacherProfileId,
        });
      }
    }
  }
  await prisma.schoolTimetableSlot.createMany({ data: timetableRows });
  console.log(
    `  ${periods.length} periods, ${timetableRows.length} timetable slots across ${rooms.length} rooms`,
  );

  /* ── Lesson plans, and one lesson somebody else has to take ───────── */

  const weekDays = [...days].slice(0, 5).reverse();
  const slotsForPlans = await prisma.schoolTimetableSlot.findMany({
    where: { companyId, termId: term.id },
    select: { id: true, dayOfWeek: true, classSubjectId: true, teacherProfileId: true },
  });

  const TOPICS = [
    "Quadratic equations", "Photosynthesis", "The Great Zimbabwe state",
    "Comprehension and summary", "Balancing chemical equations", "Ratio and proportion",
    "Map reading", "Trial balance", "Cell division", "Persuasive writing",
  ];

  const lessonPlanRows: Prisma.SchoolLessonPlanCreateManyInput[] = [];
  for (const day of weekDays) {
    // getUTCDay is 0-6 from Sunday; dayOfWeek here is 1-5 from Monday.
    const dayOfWeek = day.getUTCDay();
    for (const slot of slotsForPlans.filter((candidate) => candidate.dayOfWeek === dayOfWeek)) {
      lessonPlanRows.push({
        companyId,
        termId: term.id,
        classSubjectId: slot.classSubjectId,
        slotId: slot.id,
        lessonDate: day,
        topic: pick(TOPICS),
        objectives: "Pupils can state the rule and apply it to two worked examples.",
        activities: "Starter, worked example, pair work, plenary.",
        homeworkNote: random() < 0.4 ? "Exercise 4B, questions 1-8." : null,
        createdById: teacherProfiles[0].userId,
      });
    }
  }
  await prisma.schoolLessonPlan.createMany({ data: lessonPlanRows });

  // Wrong on purpose: one teacher is out, and somebody is covering. A cover
  // list that is always empty is a screen nobody has ever seen work.
  const coveredPlan = await prisma.schoolLessonPlan.findFirst({
    where: { companyId, termId: term.id },
    orderBy: { lessonDate: "desc" },
    select: { id: true },
  });
  if (coveredPlan) {
    await prisma.schoolCoverAssignment.create({
      data: {
        companyId,
        lessonPlanId: coveredPlan.id,
        coveringTeacherProfileId: teacherProfiles[1].id,
        reason: "Class teacher at a district moderation meeting",
        arrangedById: markerId,
      },
    });
  }
  console.log(`  ${lessonPlanRows.length} lesson plans for the week, 1 covered`);

  /* ── The school calendar ──────────────────────────────────────────── */

  const CALENDAR: Array<Omit<Prisma.SchoolCalendarEventCreateManyInput, "companyId" | "termId">> = [
    { title: "Term 3 begins", kind: "EVENT", startDate: new Date(Date.UTC(2026, 8, 8)), endDate: new Date(Date.UTC(2026, 8, 8)) },
    { title: "Heroes' Day", kind: "PUBLIC_HOLIDAY", startDate: new Date(Date.UTC(2026, 7, 11)), endDate: new Date(Date.UTC(2026, 7, 11)), isTeachingDay: false },
    { title: "Defence Forces Day", kind: "PUBLIC_HOLIDAY", startDate: new Date(Date.UTC(2026, 7, 12)), endDate: new Date(Date.UTC(2026, 7, 12)), isTeachingDay: false },
    { title: "Half term", kind: "HALF_TERM", startDate: new Date(Date.UTC(2026, 9, 16)), endDate: new Date(Date.UTC(2026, 9, 20)), isTeachingDay: false },
    { title: "Sports day", kind: "EVENT", startDate: new Date(Date.UTC(2026, 8, 25)), endDate: new Date(Date.UTC(2026, 8, 25)) },
    { title: "Parents' evening", kind: "EVENT", startDate: new Date(Date.UTC(2026, 9, 2)), endDate: new Date(Date.UTC(2026, 9, 2)) },
    { title: "End of term examinations", kind: "EXAM", startDate: new Date(Date.UTC(2026, 10, 16)), endDate: new Date(Date.UTC(2026, 10, 27)) },
    { title: "Staff development day", kind: "STAFF_ONLY", startDate: new Date(Date.UTC(2026, 9, 23)), endDate: new Date(Date.UTC(2026, 9, 23)), isTeachingDay: false },
    { title: "Prize giving", kind: "EVENT", startDate: new Date(Date.UTC(2026, 11, 3)), endDate: new Date(Date.UTC(2026, 11, 3)) },
    { title: "Term 3 ends", kind: "EVENT", startDate: new Date(Date.UTC(2026, 11, 4)), endDate: new Date(Date.UTC(2026, 11, 4)) },
  ];
  const calendarRows = CALENDAR.map((event) => ({ companyId, termId: term.id, ...event }));
  await prisma.schoolCalendarEvent.createMany({ data: calendarRows });
  console.log(`  ${calendarRows.length} calendar events`);

  /* ── Grading scheme ───────────────────────────────────────────────── */

  const scheme = await prisma.schoolGradingScheme.upsert({
    where: { companyId_code: { companyId, code: "ZIMSEC" } },
    update: { name: "ZIMSEC standard", isDefault: true, isActive: true },
    create: {
      companyId,
      code: "ZIMSEC",
      name: "ZIMSEC standard",
      continuousWeight: new Prisma.Decimal(30),
      examWeight: new Prisma.Decimal(70),
      passMark: new Prisma.Decimal(50),
      isDefault: true,
      isActive: true,
    },
    select: { id: true },
  });

  const BANDS = [
    { grade: "A", min: 80, max: 100, points: 1, remark: "Excellent" },
    { grade: "B", min: 70, max: 79, points: 2, remark: "Very good" },
    { grade: "C", min: 60, max: 69, points: 3, remark: "Good" },
    { grade: "D", min: 50, max: 59, points: 4, remark: "Satisfactory" },
    { grade: "E", min: 40, max: 49, points: 5, remark: "Weak pass" },
    { grade: "U", min: 0, max: 39, points: 9, remark: "Ungraded" },
  ];
  for (const band of BANDS) {
    await prisma.schoolGradingBand.upsert({
      where: { companyId_schemeId_grade: { companyId, schemeId: scheme.id, grade: band.grade } },
      update: {
        minScore: new Prisma.Decimal(band.min),
        maxScore: new Prisma.Decimal(band.max),
        points: band.points,
        remark: band.remark,
      },
      create: {
        companyId,
        schemeId: scheme.id,
        grade: band.grade,
        minScore: new Prisma.Decimal(band.min),
        maxScore: new Prisma.Decimal(band.max),
        points: band.points,
        remark: band.remark,
      },
    });
  }

  const gradeFor = (score: number) =>
    BANDS.find((band) => score >= band.min && score <= band.max)?.grade ?? "U";

  /* ── Result sheets, at every stage of moderation ──────────────────── */

  /*
    One sheet per class, and deliberately not all in the same state. A results
    screen is a moderation queue before it is a list of marks: the interesting
    question is which sheets are waiting on the HOD and which came back. So the
    six sheets here are spread across every status the state machine has,
    including the rejected one, which is the only path that carries a comment.
  */
  type SheetStatus = "DRAFT" | "SUBMITTED" | "HOD_APPROVED" | "HOD_REJECTED" | "PUBLISHED";
  type ModerationAction = "SUBMIT" | "REQUEST_CHANGES" | "HOD_APPROVE" | "PUBLISH";

  const SHEET_PLAN: Array<{ status: SheetStatus; trail: ModerationAction[] }> = [
    { status: "PUBLISHED", trail: ["SUBMIT", "HOD_APPROVE", "PUBLISH"] },
    { status: "PUBLISHED", trail: ["SUBMIT", "HOD_APPROVE", "PUBLISH"] },
    { status: "HOD_APPROVED", trail: ["SUBMIT", "HOD_APPROVE"] },
    { status: "SUBMITTED", trail: ["SUBMIT"] },
    { status: "HOD_REJECTED", trail: ["SUBMIT", "REQUEST_CHANGES"] },
    { status: "DRAFT", trail: [] },
  ];

  const reportSubjects = subjects.slice(0, 6);
  let sheetCount = 0;
  let resultLineCount = 0;

  for (let index = 0; index < classes.length; index += 1) {
    const schoolClass = classes[index];
    const plan = SHEET_PLAN[index % SHEET_PLAN.length];
    const roll = pupils.filter((pupil) => pupil.classId === schoolClass.id);
    if (roll.length === 0) continue;

    const submittedAt = new Date(Date.UTC(2026, 7, 24, 9, 0));
    const approvedAt = new Date(Date.UTC(2026, 7, 26, 14, 30));
    const publishedAt = new Date(Date.UTC(2026, 7, 28, 8, 0));

    const sheet = await prisma.schoolResultSheet.create({
      data: {
        companyId,
        termId: term.id,
        classId: schoolClass.id,
        streamId: null,
        title: `${schoolClass.name} — ${term.code} ${provisioned.academicYear.code}`,
        status: plan.status,
        submittedById: plan.trail.length > 0 ? teacherProfiles[index % teacherProfiles.length].userId : null,
        submittedAt: plan.trail.length > 0 ? submittedAt : null,
        hodApprovedById: plan.trail.includes("HOD_APPROVE") ? teacherProfiles[0].userId : null,
        hodApprovedAt: plan.trail.includes("HOD_APPROVE") ? approvedAt : null,
        publishedById: plan.trail.includes("PUBLISH") ? markerId : null,
        publishedAt: plan.trail.includes("PUBLISH") ? publishedAt : null,
      },
      select: { id: true },
    });
    sheetCount += 1;

    const lines: Prisma.SchoolResultLineCreateManyInput[] = [];
    for (const pupil of roll) {
      for (const subject of reportSubjects) {
        const score = between(28, 92);
        lines.push({
          companyId,
          sheetId: sheet.id,
          studentId: pupil.id,
          subjectCode: subject.code,
          score,
          grade: gradeFor(score),
          remarks: score < 40 ? "Must attend remedial sessions" : null,
        });
      }
    }
    await prisma.schoolResultLine.createMany({ data: lines });
    resultLineCount += lines.length;

    const actions: Prisma.SchoolResultModerationActionCreateManyInput[] = [];
    let fromStatus: SheetStatus = "DRAFT";
    for (const action of plan.trail) {
      const toStatus: SheetStatus =
        action === "SUBMIT"
          ? "SUBMITTED"
          : action === "HOD_APPROVE"
            ? "HOD_APPROVED"
            : action === "REQUEST_CHANGES"
              ? "HOD_REJECTED"
              : "PUBLISHED";
      actions.push({
        companyId,
        sheetId: sheet.id,
        actionType: action,
        fromStatus,
        toStatus,
        actorUserId: action === "SUBMIT" ? teacherProfiles[index % teacherProfiles.length].userId : teacherProfiles[0].userId,
        comment:
          action === "REQUEST_CHANGES"
            ? "Three papers are missing a continuous-assessment mark. Please complete before resubmitting."
            : null,
        actedAt: action === "SUBMIT" ? submittedAt : action === "PUBLISH" ? publishedAt : approvedAt,
      });
      fromStatus = toStatus;
    }
    if (actions.length > 0) {
      await prisma.schoolResultModerationAction.createMany({ data: actions });
    }
  }

  // A window the portal is inside, one it has closed, one still to come — so
  // "why can a parent not see the report" has all three of its answers present.
  await prisma.schoolPublishWindow.createMany({
    data: [
      {
        companyId,
        termId: term.id,
        openAt: new Date(Date.UTC(2026, 7, 28)),
        closeAt: new Date(Date.UTC(2026, 11, 20)),
        status: "OPEN",
        notes: "Term 3 reports visible to guardians",
      },
      {
        companyId,
        termId: term.id,
        classId: classes[0].id,
        openAt: new Date(Date.UTC(2026, 4, 2)),
        closeAt: new Date(Date.UTC(2026, 5, 30)),
        status: "CLOSED",
        notes: "Term 2 reports",
      },
      {
        companyId,
        termId: term.id,
        openAt: new Date(Date.UTC(2026, 11, 8)),
        closeAt: new Date(Date.UTC(2026, 11, 22)),
        status: "SCHEDULED",
        notes: "End of year reports",
      },
    ],
  });
  console.log(
    `  ${sheetCount} result sheets (${resultLineCount} lines) across every moderation state, 3 publish windows`,
  );

  /* ── Boarding: houses, beds and who is in them ────────────────────── */

  /*
    Single-sex houses, because that is how a Zimbabwean boarding school is run
    and because it is the constraint every allocation screen has to respect.
    Beds are real rows rather than a capacity number: a bed is what a matron
    allocates, what a roll call is taken against, and what breaks — so one of
    them is out of service below, which a capacity integer cannot express.
  */
  const HOUSES = [
    { code: "NYA", name: "Nyanga House", gender: "F" },
    { code: "CHI", name: "Chimanimani House", gender: "M" },
  ];

  type Bed = { id: string; hostelId: string; roomId: string; code: string };
  const bedsByGender = new Map<string, Bed[]>();
  const hostelsByGender = new Map<string, string>();
  let bedCount = 0;

  for (const house of HOUSES) {
    const hostel = await prisma.schoolHostel.create({
      data: {
        companyId,
        code: house.code,
        name: house.name,
        genderPolicy: house.gender === "F" ? "FEMALE" : "MALE",
        capacity: 40,
        isActive: true,
      },
      select: { id: true },
    });
    hostelsByGender.set(house.gender, hostel.id);
    const beds: Bed[] = [];

    for (let roomIndex = 1; roomIndex <= 5; roomIndex += 1) {
      const room = await prisma.schoolHostelRoom.create({
        data: {
          companyId,
          hostelId: hostel.id,
          code: `${house.code}-${pad(roomIndex, 2)}`,
          floor: roomIndex <= 3 ? "Ground" : "First",
          capacity: 8,
          isPrefectDorm: roomIndex === 1,
          yearGroupIds: [],
          isActive: true,
        },
        select: { id: true },
      });

      for (let bedIndex = 1; bedIndex <= 8; bedIndex += 1) {
        // Wrong on purpose: one bed in each house is out of service, so the
        // allocation screen has to show a bed it may not fill and say why.
        const broken = roomIndex === 2 && bedIndex === 5;
        const bed = await prisma.schoolHostelBed.create({
          data: {
            companyId,
            hostelId: hostel.id,
            roomId: room.id,
            code: `${house.code}-${pad(roomIndex, 2)}-${bedIndex}`,
            status: broken ? "OUT_OF_SERVICE" : "AVAILABLE",
            statusReason: broken ? "Frame broken, awaiting repair" : null,
            bay: bedIndex <= 4 ? 1 : 2,
            tier: bedIndex % 2 === 1 ? "LOWER" : "UPPER",
            isActive: true,
          },
          select: { id: true, hostelId: true, roomId: true, code: true },
        });
        bedCount += 1;
        if (!broken) beds.push(bed);
      }
    }
    bedsByGender.set(house.gender, beds);
  }

  const boarders = pupils.filter((pupil) => pupil.boarding);
  type Allocation = { id: string; pupil: Pupil; bed: Bed };
  const allocations: Allocation[] = [];
  const bedCursor = new Map<string, number>();

  for (const pupil of boarders) {
    const gender = pupil.gender === "M" ? "M" : "F";
    const beds = bedsByGender.get(gender) ?? [];
    const cursor = bedCursor.get(gender) ?? 0;
    const bed = beds[cursor];
    if (!bed) continue;
    bedCursor.set(gender, cursor + 1);

    const allocation = await prisma.schoolBoardingAllocation.create({
      data: {
        companyId,
        studentId: pupil.id,
        termId: term.id,
        hostelId: bed.hostelId,
        roomId: bed.roomId,
        bedId: bed.id,
        status: "ACTIVE",
        startDate: new Date(Date.UTC(2026, 8, 8)),
      },
      select: { id: true },
    });
    await prisma.schoolHostelBed.update({
      where: { id: bed.id },
      data: { status: "OCCUPIED" },
    });
    allocations.push({ id: allocation.id, pupil, bed });
  }

  // Wrong on purpose: one boarder moved house mid-term and one went home to be
  // a day scholar. Both are history the roll has to keep, not rows to delete.
  if (allocations.length >= 2) {
    await prisma.schoolBoardingAllocation.update({
      where: { id: allocations[allocations.length - 1].id },
      data: {
        status: "ENDED",
        endDate: new Date(Date.UTC(2026, 8, 26)),
        reason: "Became a day scholar — family moved to Harare",
      },
    });
    await prisma.schoolBoardingAllocation.update({
      where: { id: allocations[allocations.length - 2].id },
      data: { status: "TRANSFERRED", reason: "Moved to the prefects' dormitory" },
    });
  }
  const livingIn = allocations.slice(0, Math.max(allocations.length - 2, 0));
  console.log(
    `  ${HOUSES.length} houses, ${bedCount} beds, ${allocations.length} allocations ` +
      `(1 transferred, 1 ended, 2 beds out of service)`,
  );

  /* ── Exeat: signing a boarder out and back in ─────────────────────── */

  const exeatPlan = [
    { status: "CHECKED_IN", type: "LEAVE", days: 7, reason: "Family funeral in Gweru" },
    { status: "CHECKED_OUT", type: "OUTING", days: 0, reason: "Orthodontist appointment" },
    { status: "APPROVED", type: "OUTING", days: -3, reason: "Provincial hockey trials" },
    { status: "SUBMITTED", type: "LEAVE", days: -7, reason: "Sister's wedding" },
    { status: "DRAFT", type: "OUTING", days: -10, reason: "Saturday town pass" },
    { status: "REJECTED", type: "LEAVE", days: 4, reason: "Requested during examinations" },
  ] as const;

  const anchor = days[0] ?? new Date(Date.UTC(2026, 7, 31));
  let movementCount = 0;

  for (let index = 0; index < exeatPlan.length && index < livingIn.length; index += 1) {
    const plan = exeatPlan[index];
    const allocation = livingIn[index];
    const start = new Date(anchor);
    start.setUTCDate(start.getUTCDate() - plan.days);
    start.setUTCHours(14, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 2);
    end.setUTCHours(17, 0, 0, 0);

    const checkedOut = plan.status === "CHECKED_OUT" || plan.status === "CHECKED_IN";
    const request = await prisma.schoolLeaveRequest.create({
      data: {
        companyId,
        studentId: allocation.pupil.id,
        allocationId: allocation.id,
        termId: term.id,
        requestType: plan.type,
        startDateTime: start,
        endDateTime: end,
        destination: plan.type === "LEAVE" ? "Home" : "Harare",
        guardianContact: "+263 77 123 4567",
        status: plan.status,
        reason: plan.reason,
        approvedById: plan.status === "DRAFT" || plan.status === "SUBMITTED" ? null : markerId,
        approvedAt: plan.status === "DRAFT" || plan.status === "SUBMITTED" ? null : start,
        checkedOutById: checkedOut ? markerId : null,
        checkedOutAt: checkedOut ? start : null,
        checkedInById: plan.status === "CHECKED_IN" ? markerId : null,
        checkedInAt: plan.status === "CHECKED_IN" ? end : null,
        createdById: markerId,
      },
      select: { id: true },
    });

    if (checkedOut) {
      await prisma.schoolBoardingMovementLog.create({
        data: {
          companyId,
          leaveRequestId: request.id,
          studentId: allocation.pupil.id,
          movementType: "CHECK_OUT",
          recordedById: markerId,
          recordedAt: start,
          notes: "Signed out at the gate by the matron",
        },
      });
      movementCount += 1;
    }
    if (plan.status === "CHECKED_IN") {
      await prisma.schoolBoardingMovementLog.create({
        data: {
          companyId,
          leaveRequestId: request.id,
          studentId: allocation.pupil.id,
          movementType: "CHECK_IN",
          recordedById: markerId,
          recordedAt: end,
        },
      });
      movementCount += 1;
    }
  }

  /* ── Sick bay ─────────────────────────────────────────────────────── */

  const sickPupil = livingIn[2]?.pupil ?? boarders[2];
  const sickBayRows: Prisma.SchoolSickBayAdmissionCreateManyInput[] = [];
  if (sickPupil) {
    const admitted = new Date(anchor);
    admitted.setUTCHours(20, 30, 0, 0);
    // Wrong on purpose: this one is still in. An open admission is the row the
    // evening roll call has to reconcile against, and the one a discharge
    // report would otherwise never show.
    sickBayRows.push({
      companyId,
      studentId: sickPupil.id,
      termId: term.id,
      admittedAt: admitted,
      reason: "Fever and headache",
      notes: "Paracetamol given at 20:45. Matron to review in the morning.",
      admittedById: markerId,
    });
  }
  for (let index = 0; index < 2; index += 1) {
    const pupil = livingIn[6 + index]?.pupil;
    if (!pupil) continue;
    const admitted = new Date(anchor);
    admitted.setUTCDate(admitted.getUTCDate() - (index + 3));
    admitted.setUTCHours(11, 0, 0, 0);
    const discharged = new Date(admitted);
    discharged.setUTCHours(16, 0, 0, 0);
    sickBayRows.push({
      companyId,
      studentId: pupil.id,
      termId: term.id,
      admittedAt: admitted,
      dischargedAt: discharged,
      dischargedTo: index === 0 ? "Returned to class" : "Collected by guardian",
      reason: index === 0 ? "Sprained ankle at games" : "Stomach upset",
      admittedById: markerId,
    });
  }
  await prisma.schoolSickBayAdmission.createMany({ data: sickBayRows });

  /* ── Evening roll call ────────────────────────────────────────────── */

  /*
    Seven evenings per house, and tonight's is still OPEN — a roll call that is
    always closed is the one state a matron never sees. The statuses below are
    the point of the screen: everybody PRESENT except the boarder signed out on
    exeat, the one in the sick bay, and one nobody has accounted for at all.
  */
  const rollCallDays = [...days].slice(0, 7).reverse();
  const signedOutStudentId = livingIn[1]?.pupil.id;
  const sickStudentId = sickPupil?.id;
  const unaccountedStudentId = livingIn[4]?.pupil.id;
  const notYetSeenStudentId = livingIn[5]?.pupil.id;
  let rollCallCount = 0;
  let rollCallEntryCount = 0;

  for (const house of HOUSES) {
    const hostelId = hostelsByGender.get(house.gender);
    if (!hostelId) continue;
    const residents = livingIn.filter((allocation) => allocation.bed.hostelId === hostelId);
    if (residents.length === 0) continue;

    for (let index = 0; index < rollCallDays.length; index += 1) {
      const day = rollCallDays[index];
      const isTonight = index === rollCallDays.length - 1;
      const takenOn = new Date(day);
      const rollCall = await prisma.schoolRollCall.create({
        data: {
          companyId,
          hostelId,
          termId: term.id,
          takenOn,
          session: "EVENING",
          status: isTonight ? "OPEN" : "SUBMITTED",
          takenById: markerId,
          submittedAt: isTonight ? null : new Date(takenOn.getTime() + 20 * 60 * 60 * 1000),
        },
        select: { id: true },
      });
      rollCallCount += 1;

      const entries: Prisma.SchoolRollCallEntryCreateManyInput[] = residents.map((resident) => {
        const studentId = resident.pupil.id;
        const status =
          studentId === signedOutStudentId
            ? "SIGNED_OUT"
            : isTonight && studentId === sickStudentId
              ? "SICK_BAY"
              : isTonight && studentId === unaccountedStudentId
                ? "ABSENT"
                : isTonight && studentId === notYetSeenStudentId
                  ? "NOT_SEEN"
                  : "PRESENT";
        return {
          companyId,
          rollCallId: rollCall.id,
          studentId,
          bedId: resident.bed.id,
          status,
          notes: status === "ABSENT" ? "Not in the dormitory and no exeat on file" : null,
          recordedAt: status === "NOT_SEEN" ? null : new Date(takenOn.getTime() + 19 * 60 * 60 * 1000),
        };
      });
      await prisma.schoolRollCallEntry.createMany({ data: entries });
      rollCallEntryCount += entries.length;
    }
  }
  console.log(
    `  ${movementCount} gate movements, ${sickBayRows.length} sick bay admissions (1 still in), ` +
      `${rollCallCount} roll calls with ${rollCallEntryCount} entries (tonight's still open)`,
  );

  /* ── Health records ───────────────────────────────────────────────── */

  const ALLERGIES = ["Penicillin", "Peanuts", "Bee stings", "Dust", null, null, null];
  const CONDITIONS = ["Asthma", "Eczema", null, null, null, null];
  let healthRecordCount = 0;
  const healthEventRows: Array<Prisma.SchoolHealthEventCreateManyInput> = [];

  for (let index = 0; index < pupils.length; index += 1) {
    const pupil = pupils[index];
    // Two thirds of the school has a record. A medical screen where every pupil
    // is filled in is a screen that never shows "not on file", which is the
    // state a school nurse actually chases.
    if (index % 3 === 2) continue;

    const record = await prisma.schoolHealthRecord.upsert({
      where: { studentId: pupil.id },
      update: {},
      create: {
        companyId,
        studentId: pupil.id,
        bloodGroup: pick(["O+", "A+", "B+", "AB+", "O-"]),
        allergies: pick(ALLERGIES),
        chronicConditions: pick(CONDITIONS),
        doctorName: "Dr T Marufu",
        doctorPhone: "+263 24 279 1234",
        medicalAidProvider: index % 4 === 0 ? "CIMAS" : null,
        medicalAidNumber: index % 4 === 0 ? `CIM-${pad(index + 1, 6)}` : null,
        consentFirstAid: true,
        consentEmergencyTreatment: index % 7 !== 0,
        consentPhotography: index % 5 !== 0,
        consentOutings: true,
        consentGivenBy: "Guardian",
        consentGivenAt: new Date(Date.UTC(2026, 0, 20)),
      },
      select: { id: true },
    });
    healthRecordCount += 1;

    if (index % 17 === 0) {
      const occurred = new Date(anchor);
      occurred.setUTCDate(occurred.getUTCDate() - (index % 11));
      healthEventRows.push({
        companyId,
        healthRecordId: record.id,
        studentId: pupil.id,
        kind: pick(["SANATORIUM_VISIT", "MEDICATION", "INJURY", "SCREENING"] as const),
        occurredAt: occurred,
        summary: "Seen by the school nurse",
        treatment: "Rest and fluids",
        guardianNotified: index % 2 === 0,
        recordedById: markerId,
      });
    }
  }
  await prisma.schoolHealthEvent.createMany({ data: healthEventRows });
  console.log(`  ${healthRecordCount} health records, ${healthEventRows.length} health events`);

  /* ── Conduct: the book, and what happened in it ───────────────────── */

  const CONDUCT_CATEGORIES = [
    { code: "LATE", name: "Late to lesson", tone: "WARN", points: 1 },
    { code: "UNIFORM", name: "Uniform infringement", tone: "WARN", points: 1 },
    { code: "HOMEWORK", name: "Homework not done", tone: "WARN", points: 2 },
    { code: "DISRUPT", name: "Disrupting a lesson", tone: "BAD", points: 3 },
    { code: "TRUANCY", name: "Absent from a lesson", tone: "BAD", points: 5 },
    { code: "DEFIANCE", name: "Defiance of a member of staff", tone: "BAD", points: 5 },
    { code: "BULLYING", name: "Bullying", tone: "BAD", points: 10 },
    { code: "PRAISE", name: "Noted for the record", tone: "PLAIN", points: null },
  ] as const;

  const conductCategories: Array<{ id: string; code: string; tone: string }> = [];
  for (let index = 0; index < CONDUCT_CATEGORIES.length; index += 1) {
    const category = CONDUCT_CATEGORIES[index];
    const row = await prisma.schoolConductCategory.create({
      data: {
        companyId,
        code: category.code,
        name: category.name,
        tone: category.tone,
        demeritPoints: category.points,
        sortOrder: index + 1,
        isActive: true,
      },
      select: { id: true, code: true, tone: true },
    });
    conductCategories.push(row);
  }

  // Forty weekdays of term, newest last. Conduct is a pattern before it is an
  // event — six incidents on one pupil in a fortnight is the thing a head of
  // year is looking for, and that only shows up against a run of dates.
  const termDays: Date[] = [];
  {
    const cursor = new Date(anchor);
    cursor.setUTCHours(0, 0, 0, 0);
    while (termDays.length < 40) {
      const weekday = cursor.getUTCDay();
      if (weekday !== 0 && weekday !== 6) termDays.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    termDays.reverse();
  }

  const LOCATIONS = ["Room 3", "The quad", "Science laboratory 1", "Dining hall", "Sports field"];
  const SUMMARIES = [
    "Arrived eleven minutes after the bell with no note.",
    "Refused to hand over a phone when asked twice.",
    "Talking through the whole of a written exercise.",
    "Not in uniform — trainers instead of school shoes.",
    "Did not arrive at the lesson; found in the library.",
    "Name-calling directed at a younger pupil in the queue.",
    "Homework not produced for the third time this fortnight.",
  ];

  // A repeat offender, because one pupil with a pattern is what the whole
  // module exists to surface. Every sixth incident is theirs.
  const repeatOffender = pupils[11];
  const incidents: Array<{ id: string; tone: string; studentId: string; occurredAt: Date }> = [];

  for (let index = 0; index < 34; index += 1) {
    const category = conductCategories[index % conductCategories.length];
    const pupil = index % 6 === 0 ? repeatOffender : pupils[between(0, pupils.length - 1)];
    const occurredAt = new Date(termDays[Math.min(index, termDays.length - 1)]);
    occurredAt.setUTCHours(between(8, 15), between(0, 59), 0, 0);
    const serious = category.tone === "BAD";

    // Wrong on purpose: four of these have not been passed home yet, and one
    // has not even been seen by the form teacher. An inbox that is always empty
    // is a screen nobody has ever had to work through.
    const homeToldNeeded = category.tone !== "PLAIN";
    const homeTold = homeToldNeeded && index % 8 !== 3;
    const seen = index !== 30;

    const incident = await prisma.schoolConductIncident.create({
      data: {
        companyId,
        termId: term.id,
        studentId: pupil.id,
        categoryId: category.id,
        reference: `CND-${pad(index + 1, 4)}`,
        occurredAt,
        summary: pick(SUMMARIES),
        location: pick(LOCATIONS),
        period: between(1, 6),
        reportedByUserId: teacherProfiles[index % teacherProfiles.length].userId,
        reportedAt: occurredAt,
        seenByUserId: seen ? markerId : null,
        seenAt: seen ? new Date(occurredAt.getTime() + 3 * 60 * 60 * 1000) : null,
        sanction: serious ? "Friday detention" : index % 3 === 0 ? "Verbal warning" : null,
        sanctionTone: serious ? "BAD" : "PLAIN",
        sanctionDecidedByUserId: serious ? markerId : null,
        sanctionDecidedAt: serious ? new Date(occurredAt.getTime() + 4 * 60 * 60 * 1000) : null,
        homeToldNeeded,
        homeToldAt: homeTold ? new Date(occurredAt.getTime() + 26 * 60 * 60 * 1000) : null,
        homeToldChannel: homeTold ? pick(["Phone call", "SMS", "Letter"]) : null,
        homeToldByUserId: homeTold ? markerId : null,
      },
      select: { id: true },
    });
    incidents.push({ id: incident.id, tone: category.tone, studentId: pupil.id, occurredAt });
  }

  // Three incidents involved more than one pupil. A conduct record filed
  // against a single name cannot describe a fight, which is most of what a
  // deputy head deals with.
  let participantCount = 0;
  for (const offset of [4, 13, 25]) {
    const incident = incidents[offset];
    if (!incident) continue;
    for (const extra of [pupils[(offset * 7) % pupils.length], pupils[(offset * 11) % pupils.length]]) {
      if (extra.id === incident.studentId) continue;
      await prisma.schoolConductParticipant.upsert({
        where: { incidentId_studentId: { incidentId: incident.id, studentId: extra.id } },
        update: {},
        create: {
          companyId,
          incidentId: incident.id,
          studentId: extra.id,
          sanction: "Friday detention",
          sanctionTone: "BAD",
        },
      });
      participantCount += 1;
    }
  }

  // Statements: the staff account, and — for the serious ones — the pupil's own.
  const accountRows: Prisma.SchoolConductAccountCreateManyInput[] = [];
  for (let index = 0; index < incidents.length; index += 3) {
    const incident = incidents[index];
    accountRows.push({
      companyId,
      incidentId: incident.id,
      authorKind: "STAFF",
      authorUserId: teacherProfiles[index % teacherProfiles.length].userId,
      takenAt: new Date(incident.occurredAt.getTime() + 60 * 60 * 1000),
      body: "I asked twice and was ignored on both occasions. The class was held up for several minutes.",
    });
    if (incident.tone === "BAD") {
      accountRows.push({
        companyId,
        incidentId: incident.id,
        authorKind: "STUDENT",
        authorStudentId: incident.studentId,
        takenAt: new Date(incident.occurredAt.getTime() + 2 * 60 * 60 * 1000),
        body: "I did not hear the first time. I am sorry for holding up the lesson.",
      });
    }
  }
  await prisma.schoolConductAccount.createMany({ data: accountRows });

  console.log(
    `  ${incidents.length} conduct incidents (${participantCount} extra participants, ` +
      `4 not yet passed home, 1 unseen), ${accountRows.length} statements`,
  );

  /* ── Merits and demerits ──────────────────────────────────────────── */

  const MERIT_REASONS = [
    { code: "HELPFUL", name: "Helpfulness", kind: "MERIT", points: 1 },
    { code: "EFFORT", name: "Outstanding effort", kind: "MERIT", points: 2 },
    { code: "SERVICE", name: "Service to the school", kind: "MERIT", points: 3 },
    { code: "SPORT", name: "Representing the school", kind: "MERIT", points: 3 },
    { code: "LATENESS", name: "Lateness", kind: "DEMERIT", points: 1 },
    { code: "NOHW", name: "Homework not done", kind: "DEMERIT", points: 2 },
  ] as const;

  const meritReasons: Array<{ id: string; kind: string; points: number }> = [];
  for (let index = 0; index < MERIT_REASONS.length; index += 1) {
    const reason = MERIT_REASONS[index];
    const row = await prisma.schoolMeritReason.create({
      data: {
        companyId,
        code: reason.code,
        name: reason.name,
        kind: reason.kind,
        defaultPoints: reason.points,
        sortOrder: index + 1,
        isActive: true,
      },
      select: { id: true, kind: true, defaultPoints: true },
    });
    meritReasons.push({ id: row.id, kind: row.kind, points: row.defaultPoints });
  }

  const meritRows: Prisma.SchoolMeritEntryCreateManyInput[] = [];
  for (let index = 0; index < 90; index += 1) {
    const reason = meritReasons[index % meritReasons.length];
    const pupil = pupils[(index * 13) % pupils.length];
    const awardedAt = new Date(termDays[index % termDays.length]);
    awardedAt.setUTCHours(between(8, 16), 0, 0, 0);
    meritRows.push({
      companyId,
      studentId: pupil.id,
      termId: term.id,
      kind: reason.kind === "MERIT" ? "MERIT" : "DEMERIT",
      reasonId: reason.id,
      points: reason.points,
      note: index % 9 === 0 ? "Noted in assembly" : null,
      awardedByUserId: teacherProfiles[index % teacherProfiles.length].userId,
      awardedAt,
      // Wrong on purpose: one award was given to the wrong pupil and reversed.
      // A points total that can only go up is a total nobody trusts.
      reversedAt: index === 41 ? new Date(awardedAt.getTime() + 48 * 60 * 60 * 1000) : null,
      reversedByUserId: index === 41 ? markerId : null,
      reversalReason: index === 41 ? "Awarded to the wrong pupil — corrected" : null,
    });
  }
  await prisma.schoolMeritEntry.createMany({ data: meritRows });
  console.log(`  ${meritRows.length} merit and demerit entries (1 reversed)`);

  /* ── Detention ────────────────────────────────────────────────────── */

  /*
    Four Friday sessions: three sat, one still to come. The interesting rows
    are not the ones who turned up — they are the pupil who did not, and the
    pupil moved to next week because they were at a fixture. Both are states
    the register has to be able to record, and both are here.
  */
  const fridays = termDays.filter((day) => day.getUTCDay() === 5).slice(-3);
  const upcoming = new Date(termDays[termDays.length - 1]);
  upcoming.setUTCDate(upcoming.getUTCDate() + ((5 - upcoming.getUTCDay() + 7) % 7 || 7));
  const detentionDays = [...fridays, upcoming];

  const hall = rooms.find((room) => room.code === "HALL") ?? rooms[0];
  const sessions: Array<{ id: string; startsAt: Date }> = [];
  for (const day of detentionDays) {
    const startsAt = new Date(day);
    startsAt.setUTCHours(15, 30, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const session = await prisma.schoolDetentionSession.create({
      data: {
        companyId,
        termId: term.id,
        startsAt,
        endsAt,
        roomId: hall.id,
        supervisorTeacherProfileId: teacherProfiles[3].id,
        label: "Friday detention",
      },
      select: { id: true, startsAt: true },
    });
    sessions.push(session);
  }

  const seriousIncidents = incidents.filter((incident) => incident.tone === "BAD").slice(0, 12);
  let awardCount = 0;
  let attendanceCount = 0;

  for (let index = 0; index < seriousIncidents.length; index += 1) {
    const incident = seriousIncidents[index];
    const session = sessions[index % sessions.length];
    const award = await prisma.schoolDetentionAward.create({
      data: {
        companyId,
        termId: term.id,
        studentId: incident.studentId,
        incidentId: incident.id,
        reason: "Sanction recorded against the incident",
        sessionsOwed: 1,
        awardedByUserId: markerId,
        awardedAt: incident.occurredAt,
      },
      select: { id: true },
    });
    awardCount += 1;

    const isUpcoming = session.id === sessions[sessions.length - 1].id;
    const state = isUpcoming
      ? "NOT_MARKED"
      : index === 2
        ? "DID_NOT_TURN_UP"
        : index === 5
          ? "MOVED"
          : "HERE";

    await prisma.schoolDetentionAttendance.create({
      data: {
        companyId,
        sessionId: session.id,
        awardId: award.id,
        studentId: incident.studentId,
        state,
        markedAt: isUpcoming ? null : new Date(session.startsAt.getTime() + 5 * 60 * 1000),
        markedByUserId: isUpcoming ? null : teacherProfiles[3].userId,
        movedToSessionId: state === "MOVED" ? sessions[sessions.length - 1].id : null,
      },
    });
    attendanceCount += 1;
  }
  console.log(
    `  ${sessions.length} detention sessions, ${awardCount} awards, ${attendanceCount} register rows ` +
      `(1 no-show, 1 moved, next Friday unmarked)`,
  );

  /* ── Public examinations ──────────────────────────────────────────── */

  /*
    Two series, on purpose. The live one is mid-entry — that is where the work
    is, and where the screens have to show a candidate who is not entered yet.
    Last year's is RESULTS_IN, because a results screen with nothing in it
    cannot show a grade profile, and a school judges itself on last year.
  */
  const board = await prisma.schoolExamBoard.create({
    data: { companyId, code: "ZIMSEC", name: "Zimbabwe School Examinations Council", isActive: true },
    select: { id: true },
  });
  const centre = await prisma.schoolExamCentre.create({
    data: { companyId, boardId: board.id, number: "06012", name: "St Marys High School", isActive: true },
    select: { id: true },
  });

  const examSubjects: Array<{ id: string; code: string; name: string }> = [];
  for (const subject of subjects.slice(0, 8)) {
    const row = await prisma.schoolExamSubject.create({
      data: {
        companyId,
        boardId: board.id,
        subjectId: subject.id,
        code: subject.code,
        name: subject.name,
        level: "O_LEVEL",
        isActive: true,
      },
      select: { id: true, code: true, name: true },
    });
    examSubjects.push(row);
  }

  const examClass = classes[Math.min(3, classes.length - 1)];
  const priorClass = classes[Math.min(4, classes.length - 1)];

  const liveSeries = await prisma.schoolExamSeries.create({
    data: {
      companyId,
      boardId: board.id,
      centreId: centre.id,
      name: "November 2026 O Level",
      year: 2026,
      level: "O_LEVEL",
      status: "ENTRIES_OPEN",
      cohortLevel: 4,
      entriesOpenAt: new Date(Date.UTC(2026, 7, 3)),
      entriesCloseAt: new Date(Date.UTC(2026, 8, 30)),
      lateEntriesCloseAt: new Date(Date.UTC(2026, 9, 14)),
      startsOn: new Date(Date.UTC(2026, 10, 2)),
      endsOn: new Date(Date.UTC(2026, 10, 27)),
      resultsDueOn: new Date(Date.UTC(2027, 0, 22)),
      feePerSubject: new Prisma.Decimal(12),
      lateFeePerSubject: new Prisma.Decimal(18),
      currency: "USD",
    },
    select: { id: true },
  });

  const priorSeries = await prisma.schoolExamSeries.create({
    data: {
      companyId,
      boardId: board.id,
      centreId: centre.id,
      name: "November 2025 O Level",
      year: 2025,
      level: "O_LEVEL",
      status: "RESULTS_IN",
      cohortLevel: 4,
      startsOn: new Date(Date.UTC(2025, 10, 3)),
      endsOn: new Date(Date.UTC(2025, 10, 28)),
      feePerSubject: new Prisma.Decimal(11),
      currency: "USD",
    },
    select: { id: true },
  });

  const papers: Array<{ id: string; examSubjectId: string; code: string; sitsAt: Date }> = [];
  for (let index = 0; index < examSubjects.length; index += 1) {
    const examSubject = examSubjects[index];
    for (const paperNumber of [1, 2]) {
      const sitsAt = new Date(Date.UTC(2026, 10, 2 + index, paperNumber === 1 ? 8 : 13, 30));
      const paper = await prisma.schoolExamPaper.create({
        data: {
          companyId,
          seriesId: liveSeries.id,
          examSubjectId: examSubject.id,
          paperNumber,
          code: `${examSubject.code}/${paperNumber}`,
          sitsAt,
          durationMinutes: paperNumber === 1 ? 90 : 150,
        },
        select: { id: true, examSubjectId: true, code: true, sitsAt: true },
      });
      papers.push({ ...paper, sitsAt: paper.sitsAt ?? sitsAt });
    }
  }

  const examCohort = pupils.filter((pupil) => pupil.classId === examClass.id);
  const candidates: Array<{ id: string; pupil: Pupil }> = [];
  for (let index = 0; index < examCohort.length; index += 1) {
    const pupil = examCohort[index];
    // Wrong on purpose: the last two are still DRAFT with the entry deadline
    // three weeks away. An entries screen whose only job is to find the
    // candidate nobody has entered needs a candidate nobody has entered.
    const status = index >= examCohort.length - 2 ? "DRAFT" : "ENTERED";
    const candidate = await prisma.schoolCandidate.create({
      data: {
        companyId,
        seriesId: liveSeries.id,
        studentId: pupil.id,
        candidateNumber: `6012${pad(index + 1, 4)}`,
        certifiedName: `${pupil.last.toUpperCase()}, ${pupil.first}`,
        status,
        enteredAt: status === "ENTERED" ? new Date(Date.UTC(2026, 7, 20)) : null,
      },
      select: { id: true },
    });
    candidates.push({ id: candidate.id, pupil });
  }

  let entryCount = 0;
  let lateCount = 0;
  let withdrawnCount = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const chosen = examSubjects.slice(0, 6);
    for (let subjectIndex = 0; subjectIndex < chosen.length; subjectIndex += 1) {
      const examSubject = chosen[subjectIndex];
      const withdrawn = index === 3 && subjectIndex === 5;
      const late = index === 6 && subjectIndex === 4;
      const draft = index >= candidates.length - 2;
      const status = withdrawn ? "WITHDRAWN" : draft ? "DRAFT" : "ENTERED";
      if (withdrawn) withdrawnCount += 1;
      if (late) lateCount += 1;

      await prisma.schoolExamEntry.create({
        data: {
          companyId,
          seriesId: liveSeries.id,
          candidateId: candidate.id,
          examSubjectId: examSubject.id,
          status,
          isLate: late,
          fee: new Prisma.Decimal(late ? 18 : 12),
          currency: "USD",
          enteredAt: status === "DRAFT" ? null : new Date(Date.UTC(2026, 7, 21)),
          withdrawnAt: withdrawn ? new Date(Date.UTC(2026, 8, 4)) : null,
        },
      });
      entryCount += 1;
    }
  }

  // Sittings, the rooms they are in, and who sits where. Seating is the part
  // that is always done on paper and always wrong; it is modelled here.
  const hallRoom = rooms.find((room) => room.code === "HALL") ?? rooms[0];
  const labRoom = rooms.find((room) => room.code === "LAB1") ?? rooms[1];
  let sessionCountExams = 0;
  let seatCount = 0;

  for (const paper of papers.slice(0, 4)) {
    const session = await prisma.schoolExamSession.create({
      data: {
        companyId,
        seriesId: liveSeries.id,
        paperId: paper.id,
        startsAt: paper.sitsAt,
        endsAt: new Date(paper.sitsAt.getTime() + 150 * 60 * 1000),
        label: paper.code,
      },
      select: { id: true },
    });
    sessionCountExams += 1;

    const allocation = await prisma.schoolExamRoomAllocation.create({
      data: {
        companyId,
        sessionId: session.id,
        roomId: hallRoom.id,
        purpose: "Main hall",
        capacity: 60,
        invigilatorTeacherProfileId: teacherProfiles[2].id,
        invigilatorName: teacherProfiles[2].name,
      },
      select: { id: true },
    });
    // A second room for the candidates with extra time, which is why access
    // arrangements exist at all.
    await prisma.schoolExamRoomAllocation.create({
      data: {
        companyId,
        sessionId: session.id,
        roomId: labRoom.id,
        purpose: "Extra time",
        capacity: 8,
        invigilatorTeacherProfileId: teacherProfiles[5].id,
        invigilatorName: teacherProfiles[5].name,
      },
    });

    for (let index = 0; index < candidates.length; index += 1) {
      await prisma.schoolExamSeat.create({
        data: {
          companyId,
          sessionId: session.id,
          allocationId: allocation.id,
          candidateId: candidates[index].id,
          seatNumber: pad(index + 1, 3),
        },
      });
      seatCount += 1;
    }
  }

  for (const index of [1, 9]) {
    const candidate = candidates[index];
    if (!candidate) continue;
    await prisma.schoolExamAccessArrangement.create({
      data: {
        companyId,
        candidateId: candidate.id,
        kind: "EXTRA_TIME",
        extraTimePercent: 25,
        detail: "Educational psychologist's report on file",
        approvedAt: new Date(Date.UTC(2026, 7, 28)),
        approvedByUserId: markerId,
      },
    });
  }

  /* ── Last year's results ──────────────────────────────────────────── */

  const priorCohort = pupils.filter((pupil) => pupil.classId === priorClass.id);
  const GRADE_SPREAD = ["A", "A", "B", "B", "B", "C", "C", "C", "D", "E", "U"];
  let resultCount = 0;

  for (let index = 0; index < priorCohort.length; index += 1) {
    const pupil = priorCohort[index];
    const candidate = await prisma.schoolCandidate.create({
      data: {
        companyId,
        seriesId: priorSeries.id,
        studentId: pupil.id,
        candidateNumber: `6012${pad(index + 1, 4)}`,
        certifiedName: `${pupil.last.toUpperCase()}, ${pupil.first}`,
        status: "ENTERED",
        enteredAt: new Date(Date.UTC(2025, 7, 18)),
      },
      select: { id: true },
    });

    for (let subjectIndex = 0; subjectIndex < 6; subjectIndex += 1) {
      const examSubject = examSubjects[subjectIndex];
      const grade = GRADE_SPREAD[(index + subjectIndex) % GRADE_SPREAD.length];
      await prisma.schoolExamResult.create({
        data: {
          companyId,
          seriesId: priorSeries.id,
          candidateId: candidate.id,
          examSubjectId: examSubject.id,
          grade,
          points: BANDS.find((band) => band.grade === grade)?.points ?? 9,
          isRemark: false,
          releasedAt: new Date(Date.UTC(2026, 0, 22)),
          capturedByUserId: markerId,
        },
      });
      resultCount += 1;
    }
  }

  // One candidate asked for a remark and it moved a grade. The remark is a
  // second result against the same subject, not an edit of the first — which
  // is why `isRemark` is part of the unique key.
  const remarkCandidate = await prisma.schoolCandidate.findFirst({
    where: { companyId, seriesId: priorSeries.id },
    select: { id: true },
  });
  if (remarkCandidate) {
    await prisma.schoolExamResult.create({
      data: {
        companyId,
        seriesId: priorSeries.id,
        candidateId: remarkCandidate.id,
        examSubjectId: examSubjects[0].id,
        grade: "B",
        points: 2,
        isRemark: true,
        releasedAt: new Date(Date.UTC(2026, 2, 6)),
        capturedByUserId: markerId,
      },
    });
    resultCount += 1;
  }

  console.log(
    `  exams: 2 series, ${candidates.length} live candidates, ${entryCount} entries ` +
      `(${lateCount} late, ${withdrawnCount} withdrawn), ${sessionCountExams} sittings, ` +
      `${seatCount} seats, ${resultCount} results from last year`,
  );

  /* ── Admissions ───────────────────────────────────────────────────── */

  type ApplicationStage =
    | "ENQUIRY"
    | "APPLIED"
    | "ASSESSMENT"
    | "WAITLISTED"
    | "OFFERED"
    | "ACCEPTED"
    | "ENROLLED"
    | "DECLINED"
    | "WITHDRAWN";

  const APPLICATION_PLAN: Array<{ stage: ApplicationStage; trail: ApplicationStage[] }> = [
    { stage: "ENQUIRY", trail: ["ENQUIRY"] },
    { stage: "ENQUIRY", trail: ["ENQUIRY"] },
    { stage: "APPLIED", trail: ["ENQUIRY", "APPLIED"] },
    { stage: "APPLIED", trail: ["ENQUIRY", "APPLIED"] },
    { stage: "ASSESSMENT", trail: ["ENQUIRY", "APPLIED", "ASSESSMENT"] },
    { stage: "ASSESSMENT", trail: ["ENQUIRY", "APPLIED", "ASSESSMENT"] },
    { stage: "WAITLISTED", trail: ["ENQUIRY", "APPLIED", "ASSESSMENT", "WAITLISTED"] },
    { stage: "OFFERED", trail: ["ENQUIRY", "APPLIED", "ASSESSMENT", "OFFERED"] },
    { stage: "OFFERED", trail: ["ENQUIRY", "APPLIED", "ASSESSMENT", "OFFERED"] },
    { stage: "ACCEPTED", trail: ["ENQUIRY", "APPLIED", "ASSESSMENT", "OFFERED", "ACCEPTED"] },
    { stage: "ENROLLED", trail: ["ENQUIRY", "APPLIED", "ASSESSMENT", "OFFERED", "ACCEPTED", "ENROLLED"] },
    { stage: "DECLINED", trail: ["ENQUIRY", "APPLIED", "ASSESSMENT", "OFFERED", "DECLINED"] },
    { stage: "WITHDRAWN", trail: ["ENQUIRY", "APPLIED", "WITHDRAWN"] },
  ];

  const SOURCES = ["Walk-in", "Website", "Referral", "Open day", "Sibling"];
  let applicationCount = 0;
  let applicationEventCount = 0;

  for (let index = 0; index < APPLICATION_PLAN.length; index += 1) {
    const plan = APPLICATION_PLAN[index];
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const assessed = plan.trail.includes("ASSESSMENT");
    const offered = plan.trail.includes("OFFERED");

    // An enrolled application has to point at the pupil it became: the table
    // carries a check constraint saying so, which is the database refusing to
    // hold an admission that produced nobody.
    const enrolledPupil = plan.stage === "ENROLLED" ? pupils[pupils.length - 1] : null;

    const application = await prisma.schoolApplication.create({
      data: {
        companyId,
        applicationNo: `APP-${pad(index + 1, 4)}`,
        studentId: enrolledPupil?.id ?? null,
        firstName: enrolledPupil?.first ?? first,
        lastName: enrolledPupil?.last ?? last,
        dateOfBirth: new Date(Date.UTC(2013, between(0, 11), between(1, 28))),
        gender: random() < 0.5 ? "F" : "M",
        guardianName: `${pick(FIRST_NAMES)} ${last}`,
        guardianPhone: `+263 77 ${between(100, 999)} ${between(1000, 9999)}`,
        guardianEmail: `${last.toLowerCase()}.home@example.test`,
        previousSchool: pick(["Chipo Primary", "Mufakose Primary", "Borrowdale Primary", "Home schooled"]),
        source: pick(SOURCES),
        appliedForClassId: classes[0].id,
        intendedTermId: term.id,
        stage: plan.stage,
        assessmentScore: assessed ? new Prisma.Decimal(between(42, 94)) : null,
        assessmentAt: assessed ? new Date(Date.UTC(2026, 7, 15)) : null,
        offeredAt: offered ? new Date(Date.UTC(2026, 7, 22)) : null,
        offerExpiresAt: offered ? new Date(Date.UTC(2026, 8, 12)) : null,
        decidedById: offered ? markerId : null,
        notes: plan.stage === "WAITLISTED" ? "Strong assessment — hold for a Form 1 place" : null,
      },
      select: { id: true },
    });
    applicationCount += 1;

    const events: Prisma.SchoolApplicationEventCreateManyInput[] = [];
    let fromStage: ApplicationStage | null = null;
    for (let stageIndex = 0; stageIndex < plan.trail.length; stageIndex += 1) {
      const toStage = plan.trail[stageIndex];
      events.push({
        companyId,
        applicationId: application.id,
        fromStage,
        toStage,
        actorUserId: markerId,
        comment: toStage === "DECLINED" ? "Guardian took a place at another school" : null,
        actedAt: new Date(Date.UTC(2026, 7, 5 + stageIndex * 3)),
      });
      fromStage = toStage;
    }
    await prisma.schoolApplicationEvent.createMany({ data: events });
    applicationEventCount += events.length;
  }
  console.log(
    `  ${applicationCount} applications across every stage, ${applicationEventCount} stage changes`,
  );

  /* ── Leavers and alumni ───────────────────────────────────────────── */

  /*
    Leaving is a checklist, not a status change: the library wants its books
    back, the bursar wants the balance cleared, and the portal account has to
    be closed. One leaver here is still open with two items outstanding, which
    is the only state the screen exists for.
  */
  const leavingClass = classes[classes.length - 1];
  const leaversCohort = pupils.filter((pupil) => pupil.classId === leavingClass.id).slice(0, 5);
  const CLEARANCE_KINDS = ["FEES", "LIBRARY", "BOARDING", "PORTAL", "RESULTS"] as const;
  let leaverCount = 0;
  let clearanceCount = 0;
  let alumniCount = 0;

  for (let index = 0; index < leaversCohort.length; index += 1) {
    const pupil = leaversCohort[index];
    const open = index === 0;
    const leaver = await prisma.schoolLeaver.create({
      data: {
        companyId,
        studentId: pupil.id,
        lastDay: new Date(Date.UTC(2026, 11, 4)),
        reason: index === 4 ? "TRANSFERRED_TO_ANOTHER_SCHOOL" : "COMPLETED_UPPER_6",
        reasonNote: index === 4 ? "Family relocating to Bulawayo" : null,
        status: open ? "OPEN" : "CLOSED",
        openedByUserId: markerId,
        openedAt: new Date(Date.UTC(2026, 10, 20)),
        closedByUserId: open ? null : markerId,
        closedAt: open ? null : new Date(Date.UTC(2026, 11, 8)),
      },
      select: { id: true },
    });
    leaverCount += 1;

    for (const kind of CLEARANCE_KINDS) {
      // The open leaver still owes the library and the bursar.
      const outstanding = open && (kind === "FEES" || kind === "LIBRARY");
      await prisma.schoolLeaverClearance.create({
        data: {
          companyId,
          leaverId: leaver.id,
          kind,
          state: outstanding ? "TODO" : kind === "BOARDING" && !pupil.boarding ? "NOT_APPLICABLE" : "DONE",
          detail: outstanding && kind === "LIBRARY" ? "Two books still on loan" : null,
          markedByUserId: outstanding ? null : markerId,
          markedAt: outstanding ? null : new Date(Date.UTC(2026, 11, 6)),
        },
      });
      clearanceCount += 1;
    }

    if (!open) {
      const alumnus = await prisma.schoolAlumnus.create({
        data: {
          companyId,
          studentId: pupil.id,
          leaverId: leaver.id,
          firstName: pupil.first,
          lastName: pupil.last,
          classOf: 2026,
          finalClassName: leavingClass.name,
          house: pupil.boarding ? "Nyanga House" : null,
          email: `${pupil.first}.${pupil.last}@alumni.test`.toLowerCase(),
          phone: `+263 77 ${between(100, 999)} ${between(1000, 9999)}`,
          contactConsent: index % 3 === 0 ? "NO_CONTACT" : "MAY_CONTACT",
          consentGivenByUserId: markerId,
          consentGivenAt: new Date(Date.UTC(2026, 11, 8)),
          destinationKind: pick(["UNIVERSITY", "COLLEGE", "EMPLOYED", "GAP_YEAR"] as const),
          destination: pick(["University of Zimbabwe", "NUST", "Harare Polytechnic", "Econet Wireless"]),
          destinationConfirmedAt: new Date(Date.UTC(2027, 1, 14)),
        },
        select: { id: true },
      });
      alumniCount += 1;

      if (index % 2 === 0) {
        await prisma.schoolAlumniUpdate.create({
          data: {
            companyId,
            alumnusId: alumnus.id,
            happenedOn: new Date(Date.UTC(2027, 5, 1)),
            summary: "Graduated with a first in engineering; spoke at prize giving.",
            recordedByUserId: markerId,
          },
        });
      }
    }
  }
  console.log(
    `  ${leaverCount} leavers (1 still open with fees and library outstanding), ` +
      `${clearanceCount} clearance items, ${alumniCount} alumni`,
  );

  /* ── Library ──────────────────────────────────────────────────────── */

  const BOOKS = [
    { title: "Nervous Conditions", author: "Tsitsi Dangarembga", category: "Fiction" },
    { title: "The House of Hunger", author: "Dambudzo Marechera", category: "Fiction" },
    { title: "Bones", author: "Chenjerai Hove", category: "Fiction" },
    { title: "Harvest of Thorns", author: "Shimmer Chinodya", category: "Fiction" },
    { title: "Things Fall Apart", author: "Chinua Achebe", category: "Fiction" },
    { title: "New General Mathematics 4", author: "J B Channon", category: "Mathematics" },
    { title: "Step Ahead Mathematics", author: "M Chikuku", category: "Mathematics" },
    { title: "Focus on Biology", author: "R Musarurwa", category: "Science" },
    { title: "Principles of Chemistry", author: "A Nyamayaro", category: "Science" },
    { title: "Physics for O Level", author: "T Mukuze", category: "Science" },
    { title: "Zimbabwean History 1890-1980", author: "N Bhebe", category: "History" },
    { title: "Geography of Southern Africa", author: "P Mavhunga", category: "Geography" },
    { title: "Principles of Accounts", author: "F Wood", category: "Commerce" },
    { title: "Shona Grammar", author: "H Chimhundu", category: "Languages" },
    { title: "An Anthology of Shona Poetry", author: "Various", category: "Languages" },
    { title: "English Comprehension Practice", author: "L Zhou", category: "Languages" },
  ];

  const copies: Array<{ id: string; code: string }> = [];
  for (let index = 0; index < BOOKS.length; index += 1) {
    const definition = BOOKS[index];
    const book = await prisma.schoolBook.create({
      data: {
        companyId,
        isbn: `978-0-${pad(index + 100, 3)}-${pad(index * 7 + 1000, 5)}-1`,
        title: definition.title,
        author: definition.author,
        publisher: "College Press",
        category: definition.category,
        shelfMark: `${definition.category.slice(0, 3).toUpperCase()}-${pad(index + 1, 3)}`,
      },
      select: { id: true },
    });

    const copyCount = index < 6 ? 4 : 2;
    for (let copyIndex = 1; copyIndex <= copyCount; copyIndex += 1) {
      const copy = await prisma.schoolBookCopy.create({
        data: {
          companyId,
          bookId: book.id,
          copyCode: `C-${pad(index + 1, 3)}-${copyIndex}`,
          condition: copyIndex === 1 && index % 5 === 0 ? "Worn" : "Good",
          // Wrong on purpose: one copy is withdrawn, so the catalogue count and
          // the shelf count disagree the way they really do.
          isWithdrawn: index === 3 && copyIndex === 2,
        },
        select: { id: true, copyCode: true },
      });
      if (!(index === 3 && copyIndex === 2)) copies.push({ id: copy.id, code: copy.copyCode });
    }

    if (index % 6 === 2) {
      await prisma.schoolBookReservation.create({
        data: {
          companyId,
          bookId: book.id,
          studentId: pupils[(index * 5) % pupils.length].id,
          reservedAt: new Date(termDays[termDays.length - 4]),
          readyAt: index === 2 ? new Date(termDays[termDays.length - 2]) : null,
        },
      });
    }
  }

  let loanCount = 0;
  let overdueLoans = 0;
  for (let index = 0; index < 34; index += 1) {
    const copy = copies[index % copies.length];
    const pupil = pupils[(index * 17) % pupils.length];
    const borrowedAt = new Date(termDays[Math.max(termDays.length - 1 - (index % 30), 0)]);
    borrowedAt.setUTCHours(13, 0, 0, 0);
    const dueAt = new Date(borrowedAt);
    dueAt.setUTCDate(dueAt.getUTCDate() + 14);

    // Two thirds are back on the shelf. Of those still out, three are past
    // their date and one has been fined — the row the librarian chases.
    const returned = index % 3 !== 0;
    const overdue = !returned && index % 9 === 0;
    if (overdue) overdueLoans += 1;
    const fined = overdue && index === 9;

    await prisma.schoolBookLoan.create({
      data: {
        companyId,
        copyId: copy.id,
        studentId: pupil.id,
        borrowedAt,
        dueAt,
        returnedAt: returned ? new Date(dueAt.getTime() - 2 * 24 * 60 * 60 * 1000) : null,
        renewals: index % 7 === 0 ? 1 : 0,
        fineAmount: fined ? new Prisma.Decimal("2.50") : null,
        finePaidAt: fined ? new Date(termDays[termDays.length - 1]) : null,
        issuedById: markerId,
        returnedById: returned ? markerId : null,
        notes: overdue ? "Reminder sent with the form teacher" : null,
      },
    });
    loanCount += 1;
  }
  console.log(
    `  library: ${BOOKS.length} titles, ${copies.length} copies on the shelf, ` +
      `${loanCount} loans (${overdueLoans} overdue, 1 fined)`,
  );

  /* ── Transport ────────────────────────────────────────────────────── */

  const ROUTES = [
    {
      code: "RT-N",
      name: "Northern route — Borrowdale, Mount Pleasant",
      vehicle: "AEX 4412",
      driver: "Sekuru Marimo",
      stops: ["Borrowdale Village", "Mount Pleasant shops", "Avondale flyover", "Belgravia"],
    },
    {
      code: "RT-S",
      name: "Southern route — Waterfalls, Hatfield",
      vehicle: "ADQ 9087",
      driver: "Baba Nyamande",
      stops: ["Waterfalls shops", "Hatfield post office", "Cranborne", "Braeside"],
    },
  ];

  const riders: Array<{ id: string; studentId: string }> = [];
  for (const definition of ROUTES) {
    const route = await prisma.schoolTransportRoute.create({
      data: {
        companyId,
        code: definition.code,
        name: definition.name,
        termFee: new Prisma.Decimal(95),
        vehicleReg: definition.vehicle,
        driverName: definition.driver,
        driverPhone: `+263 77 ${between(100, 999)} ${between(1000, 9999)}`,
        capacity: 22,
        isActive: true,
      },
      select: { id: true },
    });

    const stops: string[] = [];
    for (let index = 0; index < definition.stops.length; index += 1) {
      const stop = await prisma.schoolTransportStop.create({
        data: {
          companyId,
          routeId: route.id,
          name: definition.stops[index],
          sequence: index + 1,
          pickupMinute: 390 + index * 8,
          dropMinute: 960 + index * 8,
        },
        select: { id: true },
      });
      stops.push(stop.id);
    }

    // Day scholars only — a boarder does not catch the bus, and a transport
    // list that includes them is the first thing a bursar spots as wrong.
    const dayScholars = pupils.filter((pupil) => !pupil.boarding);
    const offset = definition.code === "RT-N" ? 0 : 12;
    for (let index = 0; index < 12; index += 1) {
      const pupil = dayScholars[(offset + index) % dayScholars.length];
      if (!pupil) continue;
      const rider = await prisma.schoolTransportRider.create({
        data: {
          companyId,
          routeId: route.id,
          stopId: stops[index % stops.length],
          studentId: pupil.id,
          termId: term.id,
          startedAt: new Date(Date.UTC(2026, 8, 8)),
        },
        select: { id: true },
      });
      riders.push({ id: rider.id, studentId: pupil.id });
    }
  }

  const boardingRows: Prisma.SchoolTransportBoardingCreateManyInput[] = [];
  const busDays = [...days].slice(0, 5);
  for (const day of busDays) {
    for (let index = 0; index < riders.length; index += 1) {
      const rider = riders[index];
      for (const direction of ["MORNING", "AFTERNOON"] as const) {
        // Wrong on purpose: one child missed the bus one morning. That single
        // false is the only reason the screen is worth opening.
        const missed = index === 3 && direction === "MORNING" && day.getTime() === busDays[1].getTime();
        boardingRows.push({
          companyId,
          riderId: rider.id,
          onDate: day,
          direction,
          boarded: !missed,
          recordedById: markerId,
        });
      }
    }
  }
  await prisma.schoolTransportBoarding.createMany({ data: boardingRows });
  console.log(
    `  transport: ${ROUTES.length} routes, ${riders.length} riders, ${boardingRows.length} boardings (1 missed)`,
  );

  /* ── Homework ─────────────────────────────────────────────────────── */

  const HOMEWORK = [
    "Exercise 4B — simultaneous equations",
    "Read chapter 7 and answer the comprehension",
    "Practical write-up: rates of reaction",
    "Essay: causes of the First Chimurenga",
    "Past paper, section A",
  ];

  let assignmentCount = 0;
  let submissionCount = 0;
  let unmarkedCount = 0;

  for (const schoolClass of classes) {
    const roll = pupils.filter((pupil) => pupil.classId === schoolClass.id);
    const forClass = classSubjects.filter((candidate) => candidate.classId === schoolClass.id).slice(0, 3);

    for (let index = 0; index < forClass.length; index += 1) {
      const classSubject = forClass[index];
      const dueAt = new Date(termDays[termDays.length - 1 - index * 4]);
      dueAt.setUTCHours(16, 0, 0, 0);
      // One in three is still a draft. `isPublished` and `publishedAt` have to
      // agree — the table carries a check constraint saying so.
      const published = index !== 2;

      const assignment = await prisma.schoolAssignment.create({
        data: {
          companyId,
          termId: term.id,
          classSubjectId: classSubject.id,
          title: HOMEWORK[(index + classes.indexOf(schoolClass)) % HOMEWORK.length],
          instructions: "Show your working. Hand in through the portal or on paper.",
          dueAt,
          maxScore: new Prisma.Decimal(20),
          isPublished: published,
          publishedAt: published ? new Date(dueAt.getTime() - 5 * 24 * 60 * 60 * 1000) : null,
          createdById: teacherProfiles[index % teacherProfiles.length].userId,
        },
        select: { id: true },
      });
      assignmentCount += 1;
      if (!published) continue;

      const submissions: Prisma.SchoolAssignmentSubmissionCreateManyInput[] = [];
      for (let rollIndex = 0; rollIndex < roll.length; rollIndex += 1) {
        const pupil = roll[rollIndex];
        // Four in five hand in. Of those, one class's worth is still unmarked —
        // `markedById` and `markedAt` move together or the constraint refuses.
        if (rollIndex % 5 === 4) continue;
        const late = rollIndex % 7 === 3;
        const marked = index !== 0;
        const score = between(8, 20);

        submissions.push({
          companyId,
          assignmentId: assignment.id,
          studentId: pupil.id,
          status: marked ? "RETURNED" : late ? "LATE" : "SUBMITTED",
          submittedAt: new Date(dueAt.getTime() - (late ? -6 : 20) * 60 * 60 * 1000),
          content: "Submitted through the student portal.",
          score: marked ? new Prisma.Decimal(score) : null,
          feedback: marked ? (score < 12 ? "See me — we will go over question 3." : "Well done.") : null,
          markedById: marked ? teacherProfiles[index % teacherProfiles.length].userId : null,
          markedAt: marked ? new Date(dueAt.getTime() + 48 * 60 * 60 * 1000) : null,
        });
        if (!marked) unmarkedCount += 1;
      }
      await prisma.schoolAssignmentSubmission.createMany({ data: submissions });
      submissionCount += submissions.length;
    }
  }
  console.log(
    `  homework: ${assignmentCount} assignments (6 unpublished), ${submissionCount} submissions ` +
      `(${unmarkedCount} awaiting marking)`,
  );

  /* ── Receipts behind the money already taken ──────────────────────── */

  /*
    The invoices above carry a `paidAmount` with nothing behind it. A payment a
    bursar cannot produce a receipt for is a payment they cannot defend, so
    every paid and part-paid invoice gets the receipt that paid it, allocated
    against it. `amountAllocated + amountUnallocated = amountReceived` is a
    check constraint, not a convention — the overpayment below has to balance.
  */
  const settledInvoices = await prisma.schoolFeeInvoice.findMany({
    where: { companyId, paidAmount: { gt: 0 } },
    select: { id: true, studentId: true, paidAmount: true },
    orderBy: { invoiceNo: "asc" },
  });

  const METHODS = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CARD"] as const;
  let receiptCount = 0;

  for (let index = 0; index < settledInvoices.length; index += 1) {
    const invoice = settledInvoices[index];
    const paid = new Prisma.Decimal(invoice.paidAmount);
    if (paid.lessThanOrEqualTo(0)) continue;

    // Wrong on purpose: one guardian paid a round number and is in credit, and
    // one receipt was keyed twice and voided.
    const overpaid = index === 4;
    const received = overpaid ? paid.plus(50) : paid;
    const unallocated = overpaid ? new Prisma.Decimal(50) : new Prisma.Decimal(0);
    const status = index === 9 ? "VOIDED" : index === 11 ? "DRAFT" : "POSTED";
    const receiptDate = new Date(termDays[termDays.length - 1 - (index % 20)]);

    const receipt = await prisma.schoolFeeReceipt.create({
      data: {
        companyId,
        receiptNo: `SFR-${pad(index + 1, 5)}`,
        studentId: invoice.studentId,
        receiptDate,
        paymentMethod: METHODS[index % METHODS.length],
        reference: `REF-${pad(index + 1, 6)}`,
        amountReceived: received,
        amountAllocated: paid,
        amountUnallocated: unallocated,
        currency: "USD",
        exchangeRate: new Prisma.Decimal(1),
        baseAmount: received,
        status,
        notes: overpaid ? "Guardian paid a round figure — credit carried forward" : null,
        postedById: status === "POSTED" ? markerId : null,
        postedAt: status === "POSTED" ? receiptDate : null,
        voidedById: status === "VOIDED" ? markerId : null,
        voidedAt: status === "VOIDED" ? new Date(receiptDate.getTime() + 86400000) : null,
        createdById: markerId,
      },
      select: { id: true },
    });

    await prisma.schoolFeeReceiptAllocation.create({
      data: {
        companyId,
        receiptId: receipt.id,
        invoiceId: invoice.id,
        allocatedAmount: paid,
      },
    });
    receiptCount += 1;
  }

  // A scholarship and a hardship remission. Fees are not only collected.
  await prisma.schoolFeeWaiver.createMany({
    data: [
      {
        companyId,
        studentId: pupils[2].id,
        termId: term.id,
        waiverType: "SCHOLARSHIP",
        reason: "Full academic scholarship — top of the entrance examination",
        amount: new Prisma.Decimal(420),
        currency: "USD",
        exchangeRate: new Prisma.Decimal(1),
        baseAmount: new Prisma.Decimal(420),
        status: "APPLIED",
        approvedById: markerId,
        approvedAt: new Date(Date.UTC(2026, 7, 12)),
        appliedById: markerId,
        appliedAt: new Date(Date.UTC(2026, 7, 13)),
        createdById: markerId,
      },
      {
        companyId,
        studentId: pupils[9].id,
        termId: term.id,
        waiverType: "HARDSHIP",
        reason: "Both guardians retrenched — half fees for the term",
        amount: new Prisma.Decimal(210),
        currency: "USD",
        exchangeRate: new Prisma.Decimal(1),
        baseAmount: new Prisma.Decimal(210),
        status: "APPROVED",
        approvedById: markerId,
        approvedAt: new Date(Date.UTC(2026, 8, 2)),
        createdById: markerId,
      },
    ],
  });
  console.log(`  ${receiptCount} fee receipts (1 overpayment, 1 voided, 1 draft), 2 waivers`);

  /* ── Targets, honours and prefects ────────────────────────────────── */

  const goalRows: Prisma.SchoolStudentGoalCreateManyInput[] = [];
  for (let index = 0; index < pupils.length; index += 2) {
    const pupil = pupils[index];
    const subject = subjects[index % subjects.length];
    const baseline = between(35, 78);
    goalRows.push({
      companyId,
      studentId: pupil.id,
      termId: term.id,
      subjectId: subject.id,
      baselineMark: new Prisma.Decimal(baseline),
      targetMark: new Prisma.Decimal(Math.min(baseline + between(5, 15), 100)),
      plan: "Weekly past-paper question and a fortnightly check-in with the subject teacher.",
      teacherNote: index % 6 === 0 ? "Target agreed at the parents' evening." : null,
      achievedAt: index % 10 === 0 ? new Date(termDays[termDays.length - 3]) : null,
    });
  }
  await prisma.schoolStudentGoal.createMany({ data: goalRows });

  const HONOURS = [
    { kind: "PRIZE", title: "Form prize — Mathematics" },
    { kind: "PRIZE", title: "Form prize — Sciences" },
    { kind: "COLOURS", title: "Full colours for hockey" },
    { kind: "COLOURS", title: "Half colours for athletics" },
    { kind: "POST", title: "Head girl" },
    { kind: "POST", title: "Head boy" },
    { kind: "POST", title: "Library prefect" },
    { kind: "POST", title: "House captain — Nyanga" },
    { kind: "OTHER", title: "Best improved pupil" },
  ] as const;

  const honourRows: Prisma.SchoolStudentHonourCreateManyInput[] = [];
  for (let index = 0; index < HONOURS.length; index += 1) {
    const pupil = pupils[(index * 9 + 3) % pupils.length];
    honourRows.push({
      companyId,
      studentId: pupil.id,
      kind: HONOURS[index].kind,
      year: 2026,
      title: HONOURS[index].title,
      detail: HONOURS[index].kind === "POST" ? "Appointed at the start of Term 3" : null,
    });
    if (HONOURS[index].kind === "POST") {
      await prisma.schoolStudent.update({ where: { id: pupil.id }, data: { isPrefect: true } });
    }
  }
  await prisma.schoolStudentHonour.createMany({ data: honourRows });
  console.log(`  ${goalRows.length} subject targets, ${honourRows.length} honours, 4 prefects`);

  /* ── Parents' evening ─────────────────────────────────────────────── */

  /*
    Twelve ten-minute slots, eight of them booked. The free ones are the point:
    a booking screen with no free slots cannot be booked against, and
    `bookedAt` and `studentId` have to be null together — a slot nobody has
    taken belongs to no pupil.
  */
  const meetingRows: Prisma.SchoolParentMeetingCreateManyInput[] = [];
  for (let index = 0; index < 12; index += 1) {
    const startsAt = new Date(Date.UTC(2026, 9, 2, 16, 0));
    startsAt.setUTCMinutes(startsAt.getUTCMinutes() + index * 10);
    const endsAt = new Date(startsAt.getTime() + 10 * 60 * 1000);
    const booked = index < 8;
    const pupil = pupils[(index * 6) % pupils.length];

    meetingRows.push({
      companyId,
      teacherProfileId: teacherProfiles[index % 4].id,
      studentId: booked ? pupil.id : null,
      startsAt,
      endsAt,
      location: `Room ${(index % 6) + 1}`,
      notes: booked ? "Ten-minute slot" : null,
      outcome: booked && index < 3 ? "Agreed a reading target for the holidays" : null,
      bookedAt: booked ? new Date(Date.UTC(2026, 8, 20, 9, index)) : null,
      cancelledAt: booked && index === 7 ? new Date(Date.UTC(2026, 8, 29, 11, 0)) : null,
    });
  }
  await prisma.schoolParentMeeting.createMany({ data: meetingRows });
  console.log(`  ${meetingRows.length} parents' evening slots (8 booked, 1 cancelled, 4 free)`);

  /* ── Streams ──────────────────────────────────────────────────────── */

  // Form 1 is big enough to split, so it is split. Streams exist mostly to
  // prove the nullable `streamId` running through enrolments, timetables and
  // result sheets is exercised by something rather than null everywhere.
  const streamedClass = classes[0];
  const streams: Array<{ id: string; code: string }> = [];
  for (const code of ["A", "B"]) {
    const stream = await prisma.schoolStream.upsert({
      where: { companyId_classId_code: { companyId, classId: streamedClass.id, code } },
      update: { name: `${streamedClass.name}${code}`, capacity: 24 },
      create: {
        companyId,
        classId: streamedClass.id,
        termId: term.id,
        code,
        name: `${streamedClass.name}${code}`,
        capacity: 24,
      },
      select: { id: true, code: true },
    });
    streams.push(stream);
  }
  {
    const roll = pupils.filter((pupil) => pupil.classId === streamedClass.id);
    for (let index = 0; index < roll.length; index += 1) {
      await prisma.schoolStudent.update({
        where: { id: roll[index].id },
        data: { currentStreamId: streams[index % streams.length].id },
      });
    }
    console.log(`  ${streams.length} streams on ${streamedClass.name} (${roll.length} pupils split)`);
  }

  /* ── How the school numbers and badges itself ─────────────────────── */

  await prisma.schoolIdentitySettings.upsert({
    where: { companyId },
    update: {},
    create: {
      companyId,
      studentPrefix: "STU",
      studentSeparator: "-",
      studentPadWidth: 4,
      cardAccentColor: "#1D4ED8",
      cardMotto: "Fortis in fide",
      cardShowPhoto: true,
      cardShowGuardianPhone: true,
    },
  });

  /* ── Portal invites ───────────────────────────────────────────────── */

  /*
    An invite is a token that has been sent and has not been claimed yet, which
    is exactly the state nobody seeds and everybody debugs. One claimed, one
    outstanding, one expired, one revoked — and the hash is of a string that
    was never a real token, because a seeded invite must not be redeemable.
  */
  const inviteRows: Prisma.SchoolPortalInviteCreateManyInput[] = [];
  const invitePupils = pupils.slice(20, 24);
  for (let index = 0; index < invitePupils.length; index += 1) {
    const pupil = invitePupils[index];
    const expires = new Date(anchor);
    expires.setUTCDate(expires.getUTCDate() + (index === 2 ? -6 : 14));
    inviteRows.push({
      companyId,
      subject: "STUDENT",
      studentId: pupil.id,
      guardianId: null,
      tokenHash: `seeded-not-a-token-${pupil.no}`,
      sentTo: `${pupil.first}.${pupil.last}@example.test`.toLowerCase(),
      expiresAt: expires,
      claimedAt: index === 0 ? new Date(anchor) : null,
      claimedUserId: null,
      revokedAt: index === 3 ? new Date(anchor) : null,
      createdById: markerId,
    });
  }
  await prisma.schoolPortalInvite.createMany({ data: inviteRows });

  /* ── Guardian messages ────────────────────────────────────────────── */

  const guardianLinks = await prisma.schoolStudentGuardian.findMany({
    where: { companyId },
    select: { studentId: true, guardianId: true },
    take: 10,
  });
  const guardianUserRow = await prisma.schoolGuardian.findFirst({
    where: { companyId, userId: { not: null } },
    select: { id: true, userId: true },
  });

  const MESSAGE_SUBJECTS = [
    "Absence on Thursday",
    "Fees — payment plan",
    "Request for a meeting about Mathematics",
    "Bus stop change",
    "Permission for the Kariba trip",
    "Concern about homework load",
  ];

  let threadCount = 0;
  let messageCount = 0;
  for (let index = 0; index < Math.min(MESSAGE_SUBJECTS.length, guardianLinks.length); index += 1) {
    const link = guardianLinks[index];
    const lastMessageAt = new Date(termDays[termDays.length - 1 - index]);
    lastMessageAt.setUTCHours(between(8, 18), 0, 0, 0);

    // Wrong on purpose: two threads are unread by staff. An inbox where
    // everything has been read is an inbox nobody has to work.
    const staffRead = index > 1;
    const thread = await prisma.schoolMessageThread.create({
      data: {
        companyId,
        studentId: link.studentId,
        guardianId: link.guardianId,
        teacherProfileId: teacherProfiles[index % teacherProfiles.length].id,
        subject: MESSAGE_SUBJECTS[index],
        lastMessageAt,
        guardianReadAt: index % 3 === 0 ? lastMessageAt : null,
        staffReadAt: staffRead ? lastMessageAt : null,
        closedAt: index === 5 ? lastMessageAt : null,
      },
      select: { id: true },
    });
    threadCount += 1;

    const opener = new Date(lastMessageAt.getTime() - 26 * 60 * 60 * 1000);
    const messages: Prisma.SchoolMessageCreateManyInput[] = [
      {
        companyId,
        threadId: thread.id,
        senderUserId: guardianUserRow?.userId ?? markerId,
        senderSide: "GUARDIAN",
        body: "Good morning. May I ask about this please — I want to make sure we have it right at home.",
        createdAt: opener,
      },
    ];
    if (staffRead) {
      messages.push({
        companyId,
        threadId: thread.id,
        senderUserId: teacherProfiles[index % teacherProfiles.length].userId,
        senderSide: "STAFF",
        body: "Thank you for letting us know. I have passed this to the form teacher and we will confirm tomorrow.",
        createdAt: lastMessageAt,
      });
    }
    await prisma.schoolMessage.createMany({ data: messages });
    messageCount += messages.length;
  }
  console.log(
    `  ${inviteRows.length} portal invites (1 claimed, 1 expired, 1 revoked), ` +
      `${threadCount} guardian threads with ${messageCount} messages (2 unread by staff)`,
  );

  /* ── Pastoral ─────────────────────────────────────────────────────── */

  /*
    Safeguarding is the one module where the access rules matter more than the
    rows. A note is banded, readers are named individually, and a member of
    staff who is not on the list has to ask — so there is a pending request
    here, a granted one and a refusal. Nothing below is a real concern about a
    real child; the bodies are deliberately procedural.
  */
  await prisma.schoolPastoralClearance.createMany({
    data: [
      {
        companyId,
        userId: markerId,
        bands: ["PASTORAL_TEAM_ONLY", "HEAD_AND_PASTORAL_TEAM", "SAFEGUARDING_NAMED_INDIVIDUALS"],
        scope: "SCHOOL",
        grantedByUserId: markerId,
      },
      {
        companyId,
        userId: teacherProfiles[0].userId,
        bands: ["PASTORAL_TEAM_ONLY"],
        scope: "CLASS",
        scopeClassId: classes[0].id,
        grantedByUserId: markerId,
      },
    ],
  });

  const PASTORAL = [
    { band: "PASTORAL_TEAM_ONLY", body: "Quieter than usual since half term. Form teacher to keep an eye and report back in a fortnight." },
    { band: "PASTORAL_TEAM_ONLY", body: "Reported difficulty with a friendship group at break. Mediation arranged with the year head." },
    { band: "HEAD_AND_PASTORAL_TEAM", body: "Attendance has fallen to 68%. Guardian contacted; a meeting is set for next week." },
    { band: "SAFEGUARDING_NAMED_INDIVIDUALS", body: "Referred to the designated safeguarding lead. Record held separately; see the named-persons file." },
  ] as const;

  let pastoralNoteCount = 0;
  let pastoralRequestCount = 0;
  for (let index = 0; index < PASTORAL.length; index += 1) {
    const note = PASTORAL[index];
    const pupil = pupils[(index * 23 + 5) % pupils.length];
    const writtenAt = new Date(termDays[termDays.length - 1 - index * 3]);
    const reviewDueAt = new Date(writtenAt);
    reviewDueAt.setUTCDate(reviewDueAt.getUTCDate() + 14);

    const row = await prisma.schoolPastoralNote.create({
      data: {
        companyId,
        studentId: pupil.id,
        authorUserId: markerId,
        writtenAt,
        body: note.body,
        band: note.band,
        reviewDueAt,
        referredTo: index === 3 ? "Designated safeguarding lead" : null,
        referredAt: index === 3 ? writtenAt : null,
        closedAt: index === 1 ? new Date(writtenAt.getTime() + 9 * 86400000) : null,
      },
      select: { id: true },
    });
    pastoralNoteCount += 1;

    await prisma.schoolPastoralNoteReader.upsert({
      where: { noteId_userId: { noteId: row.id, userId: markerId } },
      update: {},
      create: { companyId, noteId: row.id, userId: markerId, grantedByUserId: markerId },
    });

    if (index < 3) {
      const outcome = index === 0 ? "PENDING" : index === 1 ? "GRANTED" : "REFUSED";
      await prisma.schoolPastoralAccessRequest.create({
        data: {
          companyId,
          noteId: row.id,
          requestedByUserId: teacherProfiles[index + 1].userId,
          requestedAt: new Date(writtenAt.getTime() + 86400000),
          reason: "Form teacher — asked by the pupil about a related matter",
          outcome,
          decidedByUserId: outcome === "PENDING" ? null : markerId,
          decidedAt: outcome === "PENDING" ? null : new Date(writtenAt.getTime() + 2 * 86400000),
        },
      });
      pastoralRequestCount += 1;
      if (outcome === "GRANTED") {
        await prisma.schoolPastoralNoteReader.upsert({
          where: { noteId_userId: { noteId: row.id, userId: teacherProfiles[index + 1].userId } },
          update: {},
          create: {
            companyId,
            noteId: row.id,
            userId: teacherProfiles[index + 1].userId,
            grantedByUserId: markerId,
          },
        });
      }
    }
  }
  console.log(
    `  ${pastoralNoteCount} pastoral notes across all three bands, ` +
      `${pastoralRequestCount} access requests (1 pending, 1 granted, 1 refused)`,
  );

  /* ── Schemes of work and teaching resources ───────────────────────── */

  const schemeRows: Prisma.SchoolSchemeOfWorkCreateManyInput[] = [];
  for (const subject of subjects.slice(0, 6)) {
    for (let week = 1; week <= 12; week += 1) {
      schemeRows.push({
        companyId,
        subjectId: subject.id,
        termId: term.id,
        level: 4,
        weekOfTerm: week,
        topic: `${subject.name}: week ${week}`,
        objectives: "By the end of the week pupils can state, apply and check the method.",
        activities: "Exposition, worked examples, pair practice, past-paper question.",
        resourcesNote: week % 4 === 0 ? "Past paper pack in the shared drive" : null,
      });
    }
  }
  await prisma.schoolSchemeOfWork.createMany({ data: schemeRows });

  const resourceRows: Prisma.SchoolTeachingResourceCreateManyInput[] = [];
  for (let index = 0; index < subjects.length; index += 1) {
    const subject = subjects[index];
    resourceRows.push({
      companyId,
      subjectId: subject.id,
      classId: classes[index % classes.length].id,
      title: `${subject.name} — revision pack`,
      description: "Past papers and a mark scheme for the end-of-term examination.",
      // A resource is a file or a link, and the table insists on at least one.
      linkUrl: `https://example.test/resources/${subject.code.toLowerCase()}`,
      fileUrl: index % 3 === 0 ? `https://example.test/files/${subject.code.toLowerCase()}.pdf` : null,
      fileSize: index % 3 === 0 ? 482_000 + index * 1_000 : null,
      mimeType: index % 3 === 0 ? "application/pdf" : null,
      isShared: index % 5 !== 0,
      uploadedByProfileId: teacherProfiles[index % teacherProfiles.length].id,
    });
  }
  await prisma.schoolTeachingResource.createMany({ data: resourceRows });
  console.log(
    `  ${schemeRows.length} scheme-of-work weeks, ${resourceRows.length} teaching resources`,
  );

  /* ── A refund, and the import that built the roll ─────────────────── */

  // The overpayment above, handed back. `num_nonnulls(receiptId, invoiceId)`
  // must be exactly one: a refund is against the receipt or the invoice, never
  // both, because otherwise it could be counted twice.
  const overpaidReceipt = await prisma.schoolFeeReceipt.findFirst({
    where: { companyId, amountUnallocated: { gt: 0 } },
    select: { id: true, studentId: true, amountUnallocated: true },
  });
  if (overpaidReceipt) {
    await prisma.schoolFeeRefund.create({
      data: {
        companyId,
        refundNo: "SFRF-00001",
        studentId: overpaidReceipt.studentId,
        receiptId: overpaidReceipt.id,
        refundDate: new Date(termDays[termDays.length - 2]),
        method: "MOBILE_MONEY",
        reference: "ECO-88124",
        reason: "Credit returned at the guardian's request",
        amount: new Prisma.Decimal(overpaidReceipt.amountUnallocated),
        currency: "USD",
        exchangeRate: new Prisma.Decimal(1),
        baseAmount: new Prisma.Decimal(overpaidReceipt.amountUnallocated),
        status: "PAID",
        requestedById: markerId,
        paidById: markerId,
        paidAt: new Date(termDays[termDays.length - 1]),
      },
    });
    await prisma.schoolFeeReceipt.update({
      where: { id: overpaidReceipt.id },
      data: { refundedAmount: new Prisma.Decimal(overpaidReceipt.amountUnallocated) },
    });
  }

  /*
    Two import jobs: the one that opened the school, committed, and a second
    still sitting in preview with rows that will not go in. The failed rows are
    the whole point — an importer is judged on what it does with the line that
    has a missing surname, not on the 118 that were fine.
  */
  const IMPORT_ISSUES = [
    { lineNo: 7, status: "FAILED", error: "Date of birth '31/02/2013' is not a date" },
    { lineNo: 19, status: "FAILED", error: "Class 'Form 9' does not exist" },
    { lineNo: 24, status: "ANOMALY", error: "Guardian phone matches a different family" },
    { lineNo: 31, status: "SKIPPED", error: "Duplicate of STU-0031, skipped by rule" },
  ] as const;

  const committedJob = await prisma.schoolImportJob.create({
    data: {
      companyId,
      entityType: "STUDENT",
      status: "COMMITTED",
      fileName: "form-1-intake-2026.csv",
      headers: ["Student No", "First name", "Surname", "Date of birth", "Class", "Guardian", "Phone"],
      mapping: {
        "Student No": "studentNo",
        "First name": "firstName",
        Surname: "lastName",
        "Date of birth": "dateOfBirth",
        Class: "className",
        Guardian: "guardianName",
        Phone: "guardianPhone",
      },
      onDuplicate: "SKIP",
      rowsTotal: 120,
      rowsCreated: 118,
      rowsUpdated: 0,
      rowsSkipped: 2,
      rowsFailed: 0,
      notes: "Opening intake, loaded by the bursar",
      uploadedById: markerId,
      committedAt: new Date(Date.UTC(2026, 0, 14, 9, 30)),
    },
    select: { id: true },
  });

  const previewJob = await prisma.schoolImportJob.create({
    data: {
      companyId,
      entityType: "GUARDIAN",
      status: "PREVIEW",
      fileName: "guardian-contacts-update.csv",
      headers: ["Student No", "Guardian", "Relationship", "Phone", "Email"],
      mapping: {
        "Student No": "studentNo",
        Guardian: "guardianName",
        Relationship: "relationship",
        Phone: "phone",
        Email: "email",
      },
      onDuplicate: "UPDATE",
      rowsTotal: 40,
      rowsCreated: 0,
      rowsUpdated: 0,
      rowsSkipped: 1,
      rowsFailed: 2,
      notes: "Waiting on the office to fix four rows before committing",
      uploadedById: markerId,
    },
    select: { id: true },
  });

  const importRows: Prisma.SchoolImportRowCreateManyInput[] = [];
  for (let lineNo = 1; lineNo <= 40; lineNo += 1) {
    const issue = IMPORT_ISSUES.find((candidate) => candidate.lineNo === lineNo);
    importRows.push({
      companyId,
      jobId: previewJob.id,
      lineNo,
      status: issue?.status ?? "PENDING",
      rawJson: {
        "Student No": `STU-${pad(lineNo)}`,
        Guardian: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        Relationship: pick(RELATIONSHIPS),
        Phone: `+263 77 ${between(100, 999)} ${between(1000, 9999)}`,
      },
      valuesJson: { studentNo: `STU-${pad(lineNo)}` },
      issuesJson: issue ? [{ field: "row", message: issue.error }] : [],
      errorMessage: issue?.error ?? null,
    });
  }
  await prisma.schoolImportRow.createMany({ data: importRows });

  // The committed job keeps a short sample of its rows plus the artifacts they
  // produced, which is what an audit of "where did this pupil come from" reads.
  const committedRows: Prisma.SchoolImportRowCreateManyInput[] = [];
  for (let lineNo = 1; lineNo <= 12; lineNo += 1) {
    committedRows.push({
      companyId,
      jobId: committedJob.id,
      lineNo,
      status: "CREATED",
      rawJson: { "Student No": pupils[lineNo - 1]?.no ?? `STU-${pad(lineNo)}` },
      valuesJson: { studentNo: pupils[lineNo - 1]?.no ?? `STU-${pad(lineNo)}` },
      issuesJson: [],
      matchId: pupils[lineNo - 1]?.id ?? null,
      matchLabel: pupils[lineNo - 1]?.name ?? null,
    });
  }
  await prisma.schoolImportRow.createMany({ data: committedRows });

  const writtenRows = await prisma.schoolImportRow.findMany({
    where: { companyId, jobId: committedJob.id },
    select: { id: true, matchId: true },
  });
  await prisma.schoolImportArtifact.createMany({
    data: writtenRows
      .filter((row) => row.matchId)
      .map((row, index) => ({
        companyId,
        rowId: row.id,
        artifactType: "SchoolStudent",
        artifactId: row.matchId as string,
        sequence: index,
      })),
  });

  // The entry file that went to the board, and what was in it when it went.
  await prisma.schoolExamEntryFileRun.create({
    data: {
      companyId,
      seriesId: liveSeries.id,
      builtByUserId: markerId,
      builtAt: new Date(Date.UTC(2026, 8, 1, 16, 45)),
      entryCount,
      candidateCount: candidates.length,
      notes: "First submission to ZIMSEC — late entries to follow",
    },
  });
  console.log(
    `  1 refund, 2 import jobs (${importRows.length + committedRows.length} rows, 4 with issues), 1 exam entry file run`,
  );

  /* ── Sign-in card ─────────────────────────────────────────────────── */

  console.log("\nSign in as:");
  console.log(`  ADMIN    head@${SLUG}.test`);
  console.log(`  TEACHER  ${teacherProfiles[0].email}`);
  console.log(`  STUDENT  student@${SLUG}.test    (${portalStudent.name}, ${portalStudent.no})`);
  console.log(`  PARENT   parent@${SLUG}.test`);
  console.log(`  password ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
