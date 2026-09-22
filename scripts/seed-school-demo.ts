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
 *
 * ## Deterministic
 *
 * The generator is a seeded LCG, as in `seed-crm-year.ts`. Two runs produce the
 * same school, so a screenshot diff means a code change rather than fresh random
 * data. Idempotent by student/guardian number — re-running updates rather than
 * duplicating.
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
    // The four below are the boarding house, the calendar, the shelves and the
    // admissions pipeline. Hostels cascade to their rooms, beds, allocations,
    // leave requests and roll calls, so the house comes down in one statement;
    // the library and the pipeline have to be unwound child-first themselves.
    await prisma.schoolBookLoan.deleteMany({ where: { companyId } });
    await prisma.schoolBookCopy.deleteMany({ where: { companyId } });
    await prisma.schoolBook.deleteMany({ where: { companyId } });
    await prisma.schoolHostel.deleteMany({ where: { companyId } });
    await prisma.schoolCalendarEvent.deleteMany({ where: { companyId } });
    await prisma.schoolApplicationEvent.deleteMany({ where: { companyId } });
    await prisma.schoolApplication.deleteMany({ where: { companyId } });
    // Series before board, and both explicitly. `SchoolExamSeries.board` is a
    // required relation with no `onDelete`, which is Restrict — so deleting the
    // board first fails on the series hanging off it. The series takes its
    // candidates, papers, sessions and entries with it; the board then takes
    // its centres and exam subjects.
    await prisma.schoolExamSeries.deleteMany({ where: { companyId } });
    await prisma.schoolExamBoard.deleteMany({ where: { companyId } });
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
  const teacherProfiles: Array<{ id: string; name: string; email: string }> = [];

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
    teacherProfiles.push({ id: profile.id, name: `${person.first} ${person.last}`, email });
  }
  console.log(`  ${teacherProfiles.length} teachers`);

  /* ── Who teaches what ─────────────────────────────────────────────── */

  const classSubjects: Array<{ id: string; classId: string; subjectId: string }> = [];
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
      classSubjects.push({ id: row.id, classId: schoolClass.id, subjectId: subject.id });
    }
  }
  console.log(`  ${classSubjects.length} class-subject assignments`);

  /* ── The roll ─────────────────────────────────────────────────────── */

  type Pupil = {
    id: string;
    no: string;
    name: string;
    classId: string;
    boarding: boolean;
    gender: string | null;
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
      select: { id: true, gender: true },
    });

    pupils.push({
      id: student.id,
      no: studentNo,
      name: `${first} ${last}`,
      classId: schoolClass.id,
      boarding,
      // Read back rather than recomputed. On a re-run the upsert takes the
      // `update` branch, which leaves gender alone — so the row's gender is the
      // only answer that is still true the second time, and boarding places
      // children by it.
      gender: student.gender,
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

  /* ── Boarding ─────────────────────────────────────────────────────── */

  /*
    Two houses, because a single-sex house is the rule the placer enforces and
    a seed with one house never exercises it. `boarding-rules.ts` refuses a bed
    in a MALE house to a girl and refuses either to a child with no gender on
    file, so the roll's gender is what decides where a boarder sleeps here.

    Deliberately more beds than boarders. The bed board's whole claim — asserted
    in `e2e/boarding-shots.spec.ts` — is that it shows **empty** beds and not
    only who is in, and a house seeded full proves nothing. Two beds are also
    out of service with a reason written on them, because a warden's real
    question is not "is this bed free" but "why can nobody sleep in it".
  */

  const HOUSES = [
    { code: "NYA", name: "Nyangani House", policy: "MALE", emoji: "🏔️" },
    { code: "CHI", name: "Chimanimani House", policy: "FEMALE", emoji: "⛰️" },
  ] as const;

  /** Bunks down two wall runs: bay 1 is nearest the door, U and L of each. */
  const BEDS_PER_ROOM = 12;
  const ROOMS_PER_HOUSE = ["A", "B", "C", "D"];

  type Bed = { id: string; hostelId: string; roomId: string; policy: string };
  const bedsByPolicy = new Map<string, Bed[]>();

  for (const house of HOUSES) {
    const hostel = await prisma.schoolHostel.upsert({
      where: { companyId_code: { companyId, code: house.code } },
      update: { name: house.name, genderPolicy: house.policy, emoji: house.emoji },
      create: {
        companyId,
        code: house.code,
        name: house.name,
        genderPolicy: house.policy,
        capacity: ROOMS_PER_HOUSE.length * BEDS_PER_ROOM,
        emoji: house.emoji,
      },
      select: { id: true },
    });

    for (const [roomIndex, letter] of ROOMS_PER_HOUSE.entries()) {
      const room = await prisma.schoolHostelRoom.upsert({
        where: {
          companyId_hostelId_code: { companyId, hostelId: hostel.id, code: `${house.code}-${letter}` },
        },
        update: {},
        create: {
          companyId,
          hostelId: hostel.id,
          code: `${house.code}-${letter}`,
          floor: roomIndex < 2 ? "Ground" : "First",
          capacity: BEDS_PER_ROOM,
          // The last dormitory in each house is the prefects'. The placer will
          // not offer one of its beds to a pupil who is not one.
          isPrefectDorm: letter === "D",
          yearGroupIds: [],
        },
        select: { id: true, isPrefectDorm: true },
      });

      for (let bedIndex = 0; bedIndex < BEDS_PER_ROOM; bedIndex += 1) {
        const bay = Math.floor(bedIndex / 2) + 1;
        const tier = bedIndex % 2 === 0 ? "L" : "U";
        const code = `${pad(bay, 2)}${tier}`;
        // Two beds in the whole school are out of service, and both say why.
        const broken = letter === "B" && bay === 3;
        const bed = await prisma.schoolHostelBed.upsert({
          where: { companyId_roomId_code: { companyId, roomId: room.id, code } },
          update: {},
          create: {
            companyId,
            hostelId: hostel.id,
            roomId: room.id,
            code,
            bay,
            tier,
            status: broken ? "OUT_OF_SERVICE" : "AVAILABLE",
            statusReason: broken ? "Bunk ladder broken · joiner booked Thursday" : null,
          },
          select: { id: true, status: true },
        });

        if (bed.status === "AVAILABLE" && !room.isPrefectDorm) {
          const list = bedsByPolicy.get(house.policy) ?? [];
          list.push({ id: bed.id, hostelId: hostel.id, roomId: room.id, policy: house.policy });
          bedsByPolicy.set(house.policy, list);
        }
      }
    }
  }

  /*
    Place the boarders. A child whose house is full, or who has no gender on
    file, is left unplaced rather than forced somewhere — which is the state
    `/schools/boarding/allocations` exists to surface, and one the roll already
    produces on its own.
  */
  const nextBed = new Map<string, number>();
  let placed = 0;
  let unplaced = 0;

  for (const pupil of pupils) {
    if (!pupil.boarding) continue;
    const policy = pupil.gender === "M" ? "MALE" : pupil.gender === "F" ? "FEMALE" : null;
    const available = policy ? (bedsByPolicy.get(policy) ?? []) : [];
    const cursor = policy ? (nextBed.get(policy) ?? 0) : 0;
    const bed = available[cursor];
    if (!policy || !bed) {
      unplaced += 1;
      continue;
    }
    nextBed.set(policy, cursor + 1);

    const existing = await prisma.schoolBoardingAllocation.findFirst({
      where: { companyId, studentId: pupil.id, termId: term.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.schoolBoardingAllocation.update({
        where: { id: existing.id },
        data: { hostelId: bed.hostelId, roomId: bed.roomId, bedId: bed.id, status: "ACTIVE" },
      });
    } else {
      await prisma.schoolBoardingAllocation.create({
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
      });
    }
    placed += 1;
  }

  const bedTotal = HOUSES.length * ROOMS_PER_HOUSE.length * BEDS_PER_ROOM;
  console.log(
    `  boarding: ${HOUSES.length} houses, ${bedTotal} beds, ${placed} placed` +
      (unplaced > 0 ? `, ${unplaced} boarder(s) unplaced` : ""),
  );

  /* ── The calendar ─────────────────────────────────────────────────── */

  /*
    A school year is not 365 teaching days, and the product's claim — tested in
    `e2e/calendar-shots.spec.ts` — is that a public holiday reads as "Not a
    school day" on the register rather than as six missing registers somebody
    has to explain. That claim needs a closed day on the calendar to be about.

    Dates are Zimbabwe's 2026 public holidays plus the school's own fixtures.
    `isTeachingDay` is the load-bearing field: it is what closes the school.
  */

  const CALENDAR: Array<{
    title: string;
    kind: "HOLIDAY" | "PUBLIC_HOLIDAY" | "HALF_TERM" | "EXAM" | "EVENT" | "STAFF_ONLY";
    start: [number, number, number];
    end?: [number, number, number];
    teaching: boolean;
    notes?: string;
  }> = [
    { title: "Independence Day", kind: "PUBLIC_HOLIDAY", start: [2026, 3, 18], teaching: false },
    { title: "Workers' Day", kind: "PUBLIC_HOLIDAY", start: [2026, 4, 1], teaching: false },
    { title: "Africa Day", kind: "PUBLIC_HOLIDAY", start: [2026, 4, 25], teaching: false },
    { title: "Heroes' Day", kind: "PUBLIC_HOLIDAY", start: [2026, 7, 10], teaching: false },
    { title: "Defence Forces Day", kind: "PUBLIC_HOLIDAY", start: [2026, 7, 11], teaching: false },
    {
      title: "Staff development day",
      kind: "STAFF_ONLY",
      start: [2026, 8, 28],
      teaching: false,
      notes: "Marking moderation and Term 3 schemes of work. No pupils on site.",
    },
    {
      title: "Founders' Day",
      kind: "EVENT",
      start: [2026, 8, 25],
      teaching: true,
      notes: "Chapel at 08:00, shortened lessons, house photographs after break.",
    },
    { title: "Inter-house athletics", kind: "EVENT", start: [2026, 9, 9], teaching: true },
    {
      title: "Parents' evening — Forms 1 and 2",
      kind: "EVENT",
      start: [2026, 9, 2],
      teaching: true,
      notes: "16:00–19:00 in the hall. Booked through the parent portal.",
    },
    {
      title: "Half term",
      kind: "HALF_TERM",
      start: [2026, 9, 16],
      end: [2026, 9, 19],
      teaching: false,
    },
    {
      title: "End-of-term examinations",
      kind: "EXAM",
      start: [2026, 10, 23],
      end: [2026, 11, 4],
      teaching: true,
      notes: "Normal registers. Timetable suspended for examination classes.",
    },
    { title: "Prize giving", kind: "EVENT", start: [2026, 10, 13], teaching: true },
    { title: "Unity Day", kind: "PUBLIC_HOLIDAY", start: [2026, 11, 22], teaching: false },
    { title: "Christmas Day", kind: "PUBLIC_HOLIDAY", start: [2026, 11, 25], teaching: false },
  ];

  const utc = ([year, month, day]: [number, number, number]) =>
    new Date(Date.UTC(year, month, day));

  let calendarCount = 0;
  for (const entry of CALENDAR) {
    const startDate = utc(entry.start);
    const endDate = entry.end ? utc(entry.end) : startDate;
    // No natural key on the model, so match on what identifies the day to a
    // reader: this school, this title, this start.
    const existing = await prisma.schoolCalendarEvent.findFirst({
      where: { companyId, title: entry.title, startDate },
      select: { id: true },
    });
    const data = {
      title: entry.title,
      kind: entry.kind,
      startDate,
      endDate,
      isTeachingDay: entry.teaching,
      notes: entry.notes ?? null,
    };
    if (existing) {
      await prisma.schoolCalendarEvent.update({ where: { id: existing.id }, data });
    } else {
      await prisma.schoolCalendarEvent.create({ data: { companyId, ...data } });
    }
    calendarCount += 1;
  }
  console.log(
    `  calendar: ${calendarCount} events — ` +
      `${CALENDAR.filter((entry) => !entry.teaching).length} days the school is shut`,
  );

  /* ── The library ──────────────────────────────────────────────────── */

  /*
    Set texts and the shelves around them. Two copies of most titles, because a
    library with one copy of everything never shows the state that matters —
    one out, one in — and `e2e/library-shots.spec.ts` looks for exactly that: a
    title with a copy nobody has out, next to a loan that is late and carrying
    a fine estimate.
  */

  const BOOKS = [
    { isbn: "9780435905255", title: "Things Fall Apart", author: "Chinua Achebe", category: "Literature in English", shelf: "823 ACH" },
    { isbn: "9780949932792", title: "Nervous Conditions", author: "Tsitsi Dangarembga", category: "Literature in English", shelf: "823 DAN" },
    { isbn: "9781779220837", title: "The House of Hunger", author: "Dambudzo Marechera", category: "Literature in English", shelf: "823 MAR" },
    { isbn: "9780521189057", title: "Cambridge O Level Mathematics", author: "Audrey Simpson", category: "Mathematics", shelf: "510 SIM" },
    { isbn: "9781444176421", title: "Cambridge O Level Physics", author: "Heather Kennett", category: "Sciences", shelf: "530 KEN" },
    { isbn: "9780198399063", title: "Complete Chemistry for Cambridge O Level", author: "RoseMarie Gallagher", category: "Sciences", shelf: "540 GAL" },
    { isbn: "9781107614956", title: "Biology for Cambridge O Level", author: "Mary Jones", category: "Sciences", shelf: "570 JON" },
    { isbn: "9780582558656", title: "Shona Grammar for Schools", author: "Herbert Chimhundu", category: "Shona", shelf: "496 CHI" },
    { isbn: "9781868309641", title: "A History of Zimbabwe", author: "Alois Mlambo", category: "History", shelf: "968 MLA" },
    { isbn: "9780195788945", title: "Atlas of Southern Africa", author: null, category: "Geography", shelf: "912 ATL" },
    { isbn: "9781444191646", title: "Principles of Accounts", author: "Frank Wood", category: "Commercials", shelf: "657 WOO" },
    { isbn: "9780140449136", title: "Things a Prefect Should Know", author: null, category: "General", shelf: "371 GEN" },
  ];

  const borrowers = pupils.filter((pupil) => pupil.no !== "STU-0008").slice(0, 14);
  let copyCount = 0;
  let loanCount = 0;
  let overdueLoans = 0;
  const TODAY = new Date(Date.UTC(2026, 8, 22));
  const daysFrom = (days: number) =>
    new Date(TODAY.getTime() + days * 24 * 60 * 60 * 1000);

  for (const [bookIndex, entry] of BOOKS.entries()) {
    const book = await prisma.schoolBook.findFirst({
      where: { companyId, title: entry.title },
      select: { id: true },
    });
    const bookId =
      book?.id ??
      (
        await prisma.schoolBook.create({
          data: {
            companyId,
            isbn: entry.isbn,
            title: entry.title,
            author: entry.author,
            publisher: null,
            category: entry.category,
            shelfMark: entry.shelf,
          },
          select: { id: true },
        })
      ).id;

    // Three copies of a set text, two of everything else — and never all of
    // them out, so the shelf always has a row that offers "Lend it".
    const copies = entry.category === "Literature in English" ? 3 : 2;
    for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
      const copyCode = `ACC-${pad(bookIndex * 5 + copyIndex + 1)}`;
      const copy = await prisma.schoolBookCopy.upsert({
        where: { companyId_copyCode: { companyId, copyCode } },
        update: {},
        create: {
          companyId,
          bookId,
          copyCode,
          condition: copyIndex === 0 ? "Good" : "Fair",
        },
        select: { id: true },
      });
      copyCount += 1;

      // Only the first copy of a title ever goes out, so the second is always
      // on the shelf.
      if (copyIndex !== 0 || bookIndex >= borrowers.length) continue;

      const borrower = borrowers[bookIndex];
      // Four of the loans are late, and one of those is late by a month — the
      // row the librarian is chasing and the fine the page has to estimate.
      const late = bookIndex % 3 === 0;
      const borrowedAt = daysFrom(late ? (bookIndex === 0 ? -38 : -24) : -6);
      const dueAt = daysFrom(late ? (bookIndex === 0 ? -24 : -10) : 8);

      const existingLoan = await prisma.schoolBookLoan.findFirst({
        where: { companyId, copyId: copy.id, returnedAt: null },
        select: { id: true },
      });
      if (existingLoan) {
        await prisma.schoolBookLoan.update({
          where: { id: existingLoan.id },
          data: { studentId: borrower.id, borrowedAt, dueAt },
        });
      } else {
        await prisma.schoolBookLoan.create({
          data: {
            companyId,
            copyId: copy.id,
            studentId: borrower.id,
            borrowedAt,
            dueAt,
            issuedById: markerId,
          },
        });
      }
      loanCount += 1;
      if (late) overdueLoans += 1;
    }
  }
  console.log(
    `  library: ${BOOKS.length} titles, ${copyCount} copies, ` +
      `${loanCount} out — ${overdueLoans} overdue`,
  );

  /* ── Admissions ───────────────────────────────────────────────────── */

  /*
    A pipeline with somebody at every stage, because the board groups by stage
    and a stage with nobody in it is a heading nobody can read a count off.

    The row that matters most is the **lapsed offer**: an offer whose expiry has
    passed and which nothing has moved. `e2e/admissions-shots.spec.ts` looks for
    the board shouting about it, and an admissions office that is not shouted at
    loses the place to a family that gave up waiting.
  */

  const APPLICANTS: Array<{
    first: string;
    last: string;
    stage: "ENQUIRY" | "APPLIED" | "ASSESSMENT" | "WAITLISTED" | "OFFERED" | "ACCEPTED";
    score?: number;
    offerDays?: number;
    source: string;
    previous: string | null;
  }> = [
    { first: "Anotida", last: "Chirume", stage: "ENQUIRY", source: "Website", previous: "Mufakose Primary" },
    { first: "Tanyaradzwa", last: "Bere", stage: "ENQUIRY", source: "Walk-in", previous: null },
    { first: "Kudakwashe", last: "Mudenda", stage: "APPLIED", source: "Referral", previous: "Chitungwiza Primary" },
    { first: "Nyaradzo", last: "Chapeyama", stage: "APPLIED", source: "Website", previous: "Avondale Primary" },
    { first: "Tinotenda", last: "Mashava", stage: "ASSESSMENT", score: 74, source: "Referral", previous: "Borrowdale Primary" },
    { first: "Ruvarashe", last: "Zimuto", stage: "ASSESSMENT", score: 81, source: "Website", previous: "Hatfield Primary" },
    { first: "Mufaro", last: "Ndlovu", stage: "ASSESSMENT", score: 63, source: "Walk-in", previous: "Glen View Primary" },
    { first: "Tapiwanashe", last: "Guvamombe", stage: "WAITLISTED", score: 55, source: "Website", previous: "Kuwadzana Primary" },
    // The lapsed one. Offered in July, expired in August, nobody answered.
    { first: "Makanaka", last: "Chiwara", stage: "OFFERED", score: 88, offerDays: -34, source: "Referral", previous: "Highlands Primary" },
    { first: "Tavonga", last: "Muchemwa", stage: "OFFERED", score: 79, offerDays: 12, source: "Website", previous: "Belvedere Primary" },
    { first: "Nokutenda", last: "Sibanda", stage: "ACCEPTED", score: 85, offerDays: 9, source: "Referral", previous: "Mount Pleasant Primary" },
  ];

  const entryClass = classes[0];
  let applicationCount = 0;

  for (const [index, applicant] of APPLICANTS.entries()) {
    const applicationNo = `APP-2027-${pad(index + 1, 3)}`;
    const appliedAt = daysFrom(-90 + index * 4);
    const data = {
      firstName: applicant.first,
      lastName: applicant.last,
      dateOfBirth: new Date(Date.UTC(2013, (index * 3) % 12, ((index * 7) % 27) + 1)),
      gender: index % 2 === 0 ? "F" : "M",
      guardianName: `${pick(FIRST_NAMES)} ${applicant.last}`,
      guardianPhone: `+2637${between(10, 79)}${between(100000, 999999)}`,
      guardianEmail: `${applicant.last.toLowerCase()}.family@example.test`,
      previousSchool: applicant.previous,
      source: applicant.source,
      appliedForClassId: entryClass.id,
      intendedTermId: term.id,
      stage: applicant.stage,
      assessmentScore: applicant.score === undefined ? null : new Prisma.Decimal(applicant.score),
      assessmentAt: applicant.score === undefined ? null : daysFrom(-60 + index * 3),
      offeredAt: applicant.offerDays === undefined ? null : daysFrom(applicant.offerDays - 21),
      offerExpiresAt: applicant.offerDays === undefined ? null : daysFrom(applicant.offerDays),
      notes:
        applicant.offerDays !== undefined && applicant.offerDays < 0
          ? "Offer letter sent by email and WhatsApp. No answer on either."
          : null,
    };

    const application = await prisma.schoolApplication.upsert({
      where: { companyId_applicationNo: { companyId, applicationNo } },
      update: data,
      create: { companyId, applicationNo, ...data, createdAt: appliedAt },
      select: { id: true },
    });

    // The trail, so "who turned her down in March" has an answer. One row per
    // stage the application has actually been through.
    const STAGES = ["ENQUIRY", "APPLIED", "ASSESSMENT", "WAITLISTED", "OFFERED", "ACCEPTED"] as const;
    const reached = STAGES.slice(0, STAGES.indexOf(applicant.stage) + 1).filter(
      (stage) => stage !== "WAITLISTED" || applicant.stage === "WAITLISTED",
    );
    await prisma.schoolApplicationEvent.deleteMany({
      where: { companyId, applicationId: application.id },
    });
    await prisma.schoolApplicationEvent.createMany({
      data: reached.map((stage, stageIndex) => ({
        companyId,
        applicationId: application.id,
        fromStage: stageIndex === 0 ? null : reached[stageIndex - 1],
        toStage: stage,
        actorUserId: markerId,
        actedAt: new Date(appliedAt.getTime() + stageIndex * 9 * 24 * 60 * 60 * 1000),
      })),
    });
    applicationCount += 1;
  }
  console.log(
    `  admissions: ${applicationCount} applications across ` +
      `${new Set(APPLICANTS.map((applicant) => applicant.stage)).size} stages ` +
      "(one offer already lapsed)",
  );

  /* ── Public examinations ──────────────────────────────────────────── */

  /*
    A ZIMSEC November sitting, with Form 4 entered for it.

    ## The page this data feeds cannot be reached yet, and that is not the seed

    `schools.exams` is billable, and `getCompanyFeatureMap` resolves a billable
    feature as `requested && subscriptionEntitled.has(key)` — a per-company flag
    alone is never enough. Entitlement comes from a tier or an addon bundle, and
    **no tier and no bundle in `feature-catalog.ts` carries `schools.exams`**:
    `ADDON_SCHOOLS_SUITE` lists the other eleven `schools.*` keys and not this
    one. So `/schools/exams` redirects to `/access-blocked` for every tenant
    there is, including this ENTERPRISE one, and will keep doing so until the
    catalogue puts the key in something sellable. Read on 2026-09-22.

    The flag is written anyway, because it is the half of the answer this seed
    legitimately owns — the same flag `provisionSchool` writes for the eleven —
    and because the day the catalogue carries the key, St Mary's has the module
    on and a sitting already in it rather than an empty screen. The data below
    is written for the same reason: `e2e/boarding-shots.spec.ts` sat skipped for
    a month waiting for a boarding house, and a seed that waits for the feature
    is how that happens again.

    The entry deadline is the consequential date. `SchoolExamSeries` says so in
    its own docstring — a missed ZIMSEC deadline costs a pupil a year, with no
    appeal — so it is seeded close enough to today that the series screen draws
    its alert, which is the state worth showing.
  */

  const examsFeature = await prisma.platformFeature.findUnique({
    where: { key: "schools.exams" },
    select: { id: true },
  });
  if (examsFeature) {
    await prisma.companyFeatureFlag.upsert({
      where: {
        companyId_featureId: { companyId, featureId: examsFeature.id },
      },
      update: { isEnabled: true },
      create: { companyId, featureId: examsFeature.id, isEnabled: true },
    });
  }

  const board = await prisma.schoolExamBoard.upsert({
    where: { companyId_code: { companyId, code: "ZIMSEC" } },
    update: { name: "Zimbabwe School Examinations Council" },
    create: {
      companyId,
      code: "ZIMSEC",
      name: "Zimbabwe School Examinations Council",
    },
    select: { id: true },
  });

  // The centre number is the board's, not ours — it is what a school quotes
  // on the telephone when something has gone wrong with an entry.
  const centre = await prisma.schoolExamCentre.upsert({
    where: { companyId_boardId_number: { companyId, boardId: board.id, number: "025419" } },
    update: { name: company.name },
    create: { companyId, boardId: board.id, number: "025419", name: company.name },
    select: { id: true },
  });

  /** ZIMSEC syllabus codes, against the school's own subject codes. */
  const SYLLABUS: Array<{ subject: string; code: string; name: string; papers: number }> = [
    { subject: "ENG", code: "1122", name: "English Language", papers: 2 },
    { subject: "MAT", code: "4008", name: "Mathematics", papers: 2 },
    { subject: "SHO", code: "3159", name: "Shona", papers: 2 },
    { subject: "COM", code: "4003", name: "Combined Science", papers: 2 },
    { subject: "BIO", code: "4025", name: "Biology", papers: 2 },
    { subject: "CHE", code: "4027", name: "Chemistry", papers: 2 },
    { subject: "PHY", code: "4023", name: "Physics", papers: 2 },
    { subject: "GEO", code: "4022", name: "Geography", papers: 2 },
    { subject: "HIS", code: "2167", name: "History", papers: 2 },
    { subject: "ACC", code: "7112", name: "Principles of Accounts", papers: 2 },
    { subject: "BST", code: "7115", name: "Business Studies", papers: 2 },
    { subject: "AGR", code: "5035", name: "Agriculture", papers: 2 },
    { subject: "CSC", code: "4021", name: "Computer Science", papers: 2 },
  ];

  const examSubjects = new Map<string, string>();
  for (const entry of SYLLABUS) {
    const schoolSubject = subjects.find((subject) => subject.code === entry.subject);
    const examSubject = await prisma.schoolExamSubject.upsert({
      where: {
        companyId_boardId_code_level: {
          companyId,
          boardId: board.id,
          code: entry.code,
          level: "O_LEVEL",
        },
      },
      update: { name: entry.name, subjectId: schoolSubject?.id ?? null },
      create: {
        companyId,
        boardId: board.id,
        subjectId: schoolSubject?.id ?? null,
        code: entry.code,
        name: entry.name,
        level: "O_LEVEL",
      },
      select: { id: true },
    });
    examSubjects.set(entry.subject, examSubject.id);
  }

  const existingSeries = await prisma.schoolExamSeries.findFirst({
    where: { companyId, name: "November 2026", year: 2026, level: "O_LEVEL" },
    select: { id: true },
  });
  const seriesData = {
    boardId: board.id,
    centreId: centre.id,
    name: "November 2026",
    year: 2026,
    level: "O_LEVEL" as const,
    status: "ENTRIES_OPEN" as const,
    cohortLevel: 4,
    entriesOpenAt: daysFrom(-31),
    // Eleven days out, so the deadline reads as the thing to act on.
    entriesCloseAt: daysFrom(11),
    lateEntriesCloseAt: daysFrom(25),
    startsOn: new Date(Date.UTC(2026, 10, 2)),
    endsOn: new Date(Date.UTC(2026, 10, 27)),
    resultsDueOn: new Date(Date.UTC(2027, 0, 22)),
    feePerSubject: new Prisma.Decimal(11),
    lateFeePerSubject: new Prisma.Decimal(22),
    currency: "USD",
  };
  const series = existingSeries
    ? await prisma.schoolExamSeries.update({
        where: { id: existingSeries.id },
        data: seriesData,
        select: { id: true },
      })
    : await prisma.schoolExamSeries.create({
        data: { companyId, ...seriesData },
        select: { id: true },
      });

  // The timetable. Two papers a subject, spread across the sitting, because a
  // seating plan and a clash check both need papers with dates on them.
  let paperCount = 0;
  for (const [index, entry] of SYLLABUS.entries()) {
    const examSubjectId = examSubjects.get(entry.subject);
    if (!examSubjectId) continue;
    for (let paperNumber = 1; paperNumber <= entry.papers; paperNumber += 1) {
      const sitsAt = new Date(
        Date.UTC(2026, 10, 2 + index * 2 + (paperNumber - 1), paperNumber === 1 ? 9 : 14, 0),
      );
      await prisma.schoolExamPaper.upsert({
        where: {
          seriesId_examSubjectId_paperNumber: {
            seriesId: series.id,
            examSubjectId,
            paperNumber,
          },
        },
        update: { sitsAt },
        create: {
          companyId,
          seriesId: series.id,
          examSubjectId,
          paperNumber,
          code: `${entry.code}/${paperNumber}`,
          sitsAt,
          durationMinutes: paperNumber === 1 ? 90 : 150,
        },
      });
      paperCount += 1;
    }
  }

  /*
    Form 4 sits it. Each candidate takes the five everybody takes plus three
    chosen from the rest, which is what an eight-subject O Level looks like —
    and it means the entry list is not thirteen identical rows.
  */
  const CORE = ["ENG", "MAT", "SHO", "COM", "HIS"];
  const OPTIONS = ["BIO", "CHE", "PHY", "GEO", "ACC", "BST", "AGR", "CSC"];
  const formFour = classes.find((schoolClass) => schoolClass.code === "F4");
  const candidates = formFour
    ? pupils.filter((pupil) => pupil.classId === formFour.id)
    : [];

  let candidateCount = 0;
  let entryCount = 0;
  let lateEntries = 0;

  for (const [index, pupil] of candidates.entries()) {
    const candidate = await prisma.schoolCandidate.upsert({
      where: { seriesId_studentId: { seriesId: series.id, studentId: pupil.id } },
      update: { certifiedName: pupil.name },
      create: {
        companyId,
        seriesId: series.id,
        studentId: pupil.id,
        // Four digits, allocated by the school inside the centre. Not the
        // pupil number, which is ours and means nothing to the board.
        candidateNumber: pad(1000 + index + 1),
        certifiedName: pupil.name,
        status: "ENTERED",
        enteredAt: daysFrom(-14 + (index % 7)),
      },
      select: { id: true },
    });
    candidateCount += 1;

    const chosen = [...CORE, ...OPTIONS.slice(index % 4, (index % 4) + 3)];
    for (const subjectCode of chosen) {
      const examSubjectId = examSubjects.get(subjectCode);
      if (!examSubjectId) continue;
      // Every seventh candidate got their last subject in after the deadline
      // and carries the penalty rather than the ordinary fee. A list where
      // nothing is late never shows what late costs.
      const isLate = index % 7 === 0 && subjectCode === chosen[chosen.length - 1];
      await prisma.schoolExamEntry.upsert({
        where: { candidateId_examSubjectId: { candidateId: candidate.id, examSubjectId } },
        update: { status: "ENTERED", isLate },
        create: {
          companyId,
          seriesId: series.id,
          candidateId: candidate.id,
          examSubjectId,
          status: "ENTERED",
          isLate,
          fee: new Prisma.Decimal(isLate ? 22 : 11),
          currency: "USD",
          enteredAt: daysFrom(-14 + (index % 7)),
        },
      });
      entryCount += 1;
      if (isLate) lateEntries += 1;
    }
  }

  console.log(
    `  exams: ZIMSEC November 2026, ${paperCount} papers, ` +
      `${candidateCount} candidates, ${entryCount} entries (${lateEntries} late)`,
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
