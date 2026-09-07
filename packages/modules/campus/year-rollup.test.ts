/**
 * Rolling a school into the next year.
 *
 * The one operation where a single click changes every record, so the tests
 * are mostly about what it refuses to do and what happens when somebody clicks
 * it twice.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  applyYearRollUp,
  nextClassInLadder,
  planYearRollUp,
  type RollUpDecision,
} from "./year-rollup";

let companyId: string;
let termOneId: string;
let termTwoId: string;
let formOneId: string;
let formTwoId: string;
let formSixId: string;
let unlevelledId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

let counter = 0;
async function makeStudent(classId: string, termId: string) {
  counter += 1;
  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `S${String(counter).padStart(4, "0")}`,
      firstName: `Child${counter}`,
      lastName: `Test${counter}`,
      status: "ACTIVE",
      currentClassId: classId,
    },
    select: { id: true },
  });
  await prisma.schoolEnrollment.create({
    data: { companyId, studentId: student.id, termId, classId, status: "ACTIVE" },
  });
  return student.id;
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Rollup Test ${stamp}`, slug: `rollup-test-${stamp}` },
  });
  companyId = company.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: "2026",
      name: "2026",
      startDate: date("2026-01-01"),
      endDate: date("2026-12-31"),
    },
  });
  const termOne = await prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId: year.id,
      code: "T1",
      name: "Term 1",
      startDate: date("2026-01-08"),
      endDate: date("2026-04-10"),
      isActive: true,
    },
  });
  termOneId = termOne.id;
  const termTwo = await prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId: year.id,
      code: "T2",
      name: "Term 2",
      startDate: date("2026-05-06"),
      endDate: date("2026-08-08"),
    },
  });
  termTwoId = termTwo.id;

  formOneId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "F1", name: "Form 1", level: 1 },
    })
  ).id;
  formTwoId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "F2", name: "Form 2", level: 2 },
    })
  ).id;
  formSixId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "F6", name: "Upper Six", level: 6 },
    })
  ).id;
  unlevelledId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "REM", name: "Remedial", level: null },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.schoolResultLine.deleteMany({ where: { companyId } });
  await prisma.schoolResultSheet.deleteMany({ where: { companyId } });
  await prisma.schoolEnrollment.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("nextClassInLadder", () => {
  const ladder = [
    { id: "a", code: "F1", name: "Form 1", level: 1 },
    { id: "b", code: "F2", name: "Form 2", level: 2 },
    { id: "c", code: "F4", name: "Form 4", level: 4 },
  ];

  it("finds the next level up, skipping gaps", () => {
    expect(nextClassInLadder(ladder, { level: 2 })?.name).toBe("Form 4");
  });

  it("returns nothing at the top of the school", () => {
    expect(nextClassInLadder(ladder, { level: 4 })).toBeNull();
  });

  it("refuses to guess for a class with no level", () => {
    // A school that has not filled the levels in should get "no ladder set",
    // not six hundred children moved into whichever class sorted first.
    expect(nextClassInLadder(ladder, { level: null })).toBeNull();
  });
});

describe("planYearRollUp", () => {
  it("proposes promotion up the ladder", async () => {
    await makeStudent(formOneId, termOneId);
    const plan = await planYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
    });
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].proposed).toBe("PROMOTE");
    expect(plan.rows[0].toClass?.name).toBe("Form 2");
    expect(plan.summary.PROMOTE).toBe(1);
  });

  it("proposes graduation at the top of the school", async () => {
    await makeStudent(formSixId, termOneId);
    const plan = await planYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
    });
    expect(plan.rows[0].proposed).toBe("GRADUATE");
    expect(plan.rows[0].reason).toContain("top of the school");
  });

  it("says so rather than guessing when a class has no level", async () => {
    await makeStudent(unlevelledId, termOneId);
    const plan = await planYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
    });
    expect(plan.rows[0].proposed).toBe("REPEAT");
    expect(plan.rows[0].reason).toContain("no level set");
  });

  it("flags a child below the pass mark without deciding for the head", async () => {
    // Proposing REPEAT from a mark would be the system making that decision
    // quietly. It flags and leaves it.
    const studentId = await makeStudent(formOneId, termOneId);
    const sheet = await prisma.schoolResultSheet.create({
      data: { companyId, termId: termOneId, classId: formOneId, title: "T1" },
    });
    for (const [subjectCode, score] of [
      ["MAT", 30],
      ["ENG", 36],
    ] as const) {
      await prisma.schoolResultLine.create({
        data: { companyId, sheetId: sheet.id, studentId, subjectCode, score },
      });
    }

    const plan = await planYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
    });
    expect(plan.rows[0].termAverage).toBe(33);
    expect(plan.rows[0].flagged).toBe(true);
    expect(plan.rows[0].proposed).toBe("PROMOTE");
  });

  it("marks a child who is already in the target term", async () => {
    const studentId = await makeStudent(formOneId, termOneId);
    await prisma.schoolEnrollment.create({
      data: {
        companyId,
        studentId,
        termId: termTwoId,
        classId: formTwoId,
        status: "ACTIVE",
      },
    });
    const plan = await planYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
    });
    expect(plan.rows[0].alreadyRolled).toBe(true);
  });

  it("falls back to the current year group when a term has no enrolments", async () => {
    // A school running without enrolment rows would otherwise be told there is
    // nobody to roll up, with no way to find out why.
    await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: "S9001",
        firstName: "No",
        lastName: "Enrolment",
        status: "ACTIVE",
        currentClassId: formOneId,
      },
    });

    const plan = await planYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
    });
    expect(plan.source).toBe("current-class");
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].toClass?.name).toBe("Form 2");
  });

  it("prefers enrolments when there are any", async () => {
    await makeStudent(formOneId, termOneId);
    await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: "S9002",
        firstName: "Not",
        lastName: "Enrolled",
        status: "ACTIVE",
        currentClassId: formOneId,
      },
    });

    const plan = await planYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
    });
    expect(plan.source).toBe("enrolments");
    expect(plan.rows).toHaveLength(1);
  });

  it("refuses to roll a term into itself", async () => {
    await expect(
      planYearRollUp({ companyId, fromTermId: termOneId, toTermId: termOneId }),
    ).rejects.toThrow(/same one/i);
  });
});

describe("applyYearRollUp", () => {
  it("moves the child, closes the old enrolment and updates the roll", async () => {
    const studentId = await makeStudent(formOneId, termOneId);
    const decisions: RollUpDecision[] = [
      { studentId, action: "PROMOTE", toClassId: formTwoId },
    ];

    const result = await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions,
    });
    expect(result.promoted).toBe(1);

    const student = await prisma.schoolStudent.findUniqueOrThrow({
      where: { id: studentId },
    });
    expect(student.currentClassId).toBe(formTwoId);

    const old = await prisma.schoolEnrollment.findFirstOrThrow({
      where: { studentId, termId: termOneId },
    });
    expect(old.status).toBe("COMPLETED");
    expect(old.endedAt).not.toBeNull();

    const fresh = await prisma.schoolEnrollment.findFirstOrThrow({
      where: { studentId, termId: termTwoId },
    });
    expect(fresh.classId).toBe(formTwoId);
  });

  it("does nothing the second time it is clicked", async () => {
    // The failure mode of a bulk operation is somebody clicking it again
    // because the first click looked like it did nothing.
    const studentId = await makeStudent(formOneId, termOneId);
    const decisions: RollUpDecision[] = [
      { studentId, action: "PROMOTE", toClassId: formTwoId },
    ];

    await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions,
    });
    const second = await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions,
    });

    expect(second.promoted).toBe(0);
    expect(second.skipped).toBe(1);
    expect(
      await prisma.schoolEnrollment.count({ where: { studentId, termId: termTwoId } }),
    ).toBe(1);
  });

  it("graduates a leaver off the roll entirely", async () => {
    const studentId = await makeStudent(formSixId, termOneId);
    const result = await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions: [{ studentId, action: "GRADUATE" }],
    });
    expect(result.graduated).toBe(1);

    const student = await prisma.schoolStudent.findUniqueOrThrow({
      where: { id: studentId },
    });
    expect(student.status).toBe("GRADUATED");
    expect(student.currentClassId).toBeNull();
    expect(
      await prisma.schoolEnrollment.count({ where: { studentId, termId: termTwoId } }),
    ).toBe(0);
  });

  it("keeps a repeater where they are rather than moving them", async () => {
    const studentId = await makeStudent(formOneId, termOneId);
    await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions: [{ studentId, action: "REPEAT", toClassId: formOneId }],
    });
    const student = await prisma.schoolStudent.findUniqueOrThrow({
      where: { id: studentId },
    });
    expect(student.currentClassId).toBe(formOneId);
  });

  it("reports rather than silently skipping a decision with no year group", async () => {
    const studentId = await makeStudent(formOneId, termOneId);
    const result = await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions: [{ studentId, action: "PROMOTE", toClassId: null }],
    });
    expect(result.promoted).toBe(0);
    expect(result.problems).toHaveLength(1);
  });

  it("rolls a whole cohort in one transaction", async () => {
    const ids = [] as string[];
    for (let index = 0; index < 5; index += 1) {
      ids.push(await makeStudent(formOneId, termOneId));
    }
    const result = await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions: ids.map((studentId) => ({
        studentId,
        action: "PROMOTE" as const,
        toClassId: formTwoId,
      })),
    });
    expect(result.promoted).toBe(5);
    expect(
      await prisma.schoolEnrollment.count({ where: { companyId, termId: termTwoId } }),
    ).toBe(5);
  });
});
