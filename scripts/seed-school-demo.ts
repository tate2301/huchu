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

  type Pupil = { id: string; no: string; name: string; classId: string; boarding: boolean };
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
      select: { id: true },
    });

    pupils.push({
      id: student.id,
      no: studentNo,
      name: `${first} ${last}`,
      classId: schoolClass.id,
      boarding,
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
