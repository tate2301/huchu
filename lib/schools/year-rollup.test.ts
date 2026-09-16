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
import { prisma } from "@/lib/prisma";
import { deleteTestCompany } from "@/lib/schools/test-support";
import { CLEARANCE_ORDER, closeLeaver, reopenLeaver } from "./leavers";
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
  await deleteTestCompany(companyId);
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

  it("puts the graduate into the leaving queue", async () => {
    // S-13.4. The roll-up is where most pupils leave, so it is where most
    // leavers have to be opened: a queue only the manual verb could fill would
    // miss the whole Form 4 cohort every November and nobody would check
    // whether their books were back.
    const studentId = await makeStudent(formSixId, termOneId);
    await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions: [{ studentId, action: "GRADUATE" }],
    });

    const leaver = await prisma.schoolLeaver.findFirstOrThrow({
      where: { studentId },
      select: { id: true, status: true, reason: true, lastDay: true, clearances: true },
    });
    // Opened, not closed: the five clearance marks are still to settle.
    expect(leaver.status).toBe("OPEN");
    // Upper Six graduates completed Upper 6, not Form 4.
    expect(leaver.reason).toBe("COMPLETED_UPPER_6");
    // The last day is the term's, which is the nearest thing the roll-up knows.
    expect(leaver.lastDay).not.toBeNull();

    /*
      And the marks are actually there.

      This assertion is the point of the test and it was the one missing. The
      sentence above — "the five clearance marks are still to settle" — was
      true of the manual verb and false here: the roll-up wrote the leaver row
      alone. `closeLeaver` refuses only while a mark is TODO, so a leaver with
      no marks has nothing outstanding and signs off unconditionally. Every
      November the whole graduating cohort could be closed without anybody
      checking a book was back or a bill was paid, and no gate could see it.
    */
    expect(leaver.clearances).toHaveLength(CLEARANCE_ORDER.length);
    expect([...leaver.clearances.map((mark) => mark.kind)].sort()).toEqual(
      [...CLEARANCE_ORDER].sort(),
    );
  });

  it("refuses to close a rolled-up leaver while a mark is still outstanding", async () => {
    // The check the missing rows were silently passing. A pupil who owes fees
    // leaves the roll-up with FEES on TODO, and the record will not close.
    const studentId = await makeStudent(formSixId, termOneId);
    await prisma.schoolFeeInvoice.create({
      data: {
        companyId,
        studentId,
        termId: termOneId,
        invoiceNo: `INV-${Date.now()}`,
        status: "ISSUED",
        issueDate: date("2026-01-10"),
        dueDate: date("2026-02-10"),
        currency: "USD",
        totalAmount: "120.00",
        balanceAmount: "120.00",
      },
    });

    await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions: [{ studentId, action: "GRADUATE" }],
    });

    const leaver = await prisma.schoolLeaver.findFirstOrThrow({
      where: { studentId },
      select: { id: true, clearances: { select: { kind: true, state: true } } },
    });
    const fees = leaver.clearances.find((mark) => mark.kind === "FEES");
    expect(fees?.state).toBe("TODO");

    await expect(
      closeLeaver({ companyId, actorId: studentId, leaverId: leaver.id }),
    ).rejects.toThrow(/outstanding/i);
  });

  it("does not open a second leaver for a pupil who already has one", async () => {
    const studentId = await makeStudent(formSixId, termOneId);
    await prisma.schoolLeaver.create({
      data: {
        companyId,
        studentId,
        lastDay: new Date("2026-11-27T00:00:00.000Z"),
        reason: "TRANSFERRED_TO_ANOTHER_SCHOOL",
        openedByUserId: studentId,
      },
    });

    await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions: [{ studentId, action: "GRADUATE" }],
    });

    // The office's own record wins. It was opened with a reason somebody chose,
    // and the roll-up's guess must not overwrite it.
    const leavers = await prisma.schoolLeaver.findMany({ where: { studentId } });
    expect(leavers).toHaveLength(1);
    expect(leavers[0].reason).toBe("TRANSFERRED_TO_ANOTHER_SCHOOL");
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

describe("a pupil who leaves, comes back, and leaves again", () => {
  it("can be recorded the second time, because the record reopens", async () => {
    /*
      `SchoolLeaver.studentId` is `@unique`, so a pupil gets one leaving record
      for the whole of their time at a school. `recordLeaver` refused a second
      departure with the words "A second departure needs the first record
      reopened" — and nothing anywhere could reopen one, so the message named a
      way out that did not exist.

      It is not a rare case: a pupil withdrawn over fees in Term 2 who comes
      back in Term 3 and then completes Form 4 has to be recorded twice, and it
      is the second record that carries their clearance, their transfer letter
      and their place on the alumni register.
    */
    const studentId = await makeStudent(formSixId, termOneId);

    await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions: [{ studentId, action: "WITHDRAW" }],
    });

    const opened = await prisma.schoolLeaver.findFirstOrThrow({
      where: { companyId, studentId },
      select: { id: true },
    });
    // Settle the marks so it can be closed at all.
    await prisma.schoolLeaverClearance.updateMany({
      where: { leaverId: opened.id },
      data: { state: "DONE" },
    });
    await closeLeaver({ companyId, actorId: studentId, leaverId: opened.id });

    const closed = await prisma.schoolLeaver.findUniqueOrThrow({
      where: { id: opened.id },
      select: { status: true },
    });
    expect(closed.status).toBe("CLOSED");
    const alumniAfterClose = await prisma.schoolAlumnus.count({
      where: { companyId, studentId },
    });
    expect(alumniAfterClose).toBe(1);

    // They come back, and later leave properly.
    await reopenLeaver({
      companyId,
      actorId: studentId,
      leaverId: opened.id,
      lastDay: date("2027-12-03"),
      reason: "COMPLETED_UPPER_6",
    });

    const reopened = await prisma.schoolLeaver.findUniqueOrThrow({
      where: { id: opened.id },
      select: { status: true, closedAt: true, reason: true, clearances: true },
    });
    expect(reopened.status).toBe("OPEN");
    expect(reopened.closedAt).toBeNull();
    expect(reopened.reason).toBe("COMPLETED_UPPER_6");
    // The marks are derived again: the pupil has been back at school since, so
    // the fees, the books and the bed are different facts now.
    expect(reopened.clearances).toHaveLength(CLEARANCE_ORDER.length);

    // Back on the roll.
    const pupil = await prisma.schoolStudent.findUniqueOrThrow({
      where: { id: studentId },
      select: { status: true },
    });
    expect(pupil.status).toBe("ACTIVE");

    /*
      And the alumni record SURVIVES.

      Reopening used to delete it so that re-closing would write a fresh one
      with the corrected year. `SchoolAlumniUpdate` cascades from the alumnus,
      so that threw away the development office's whole timeline — the degree,
      the destination, when it was last confirmed — to correct a date.
      `closeLeaver` refreshes the year on the existing row instead.
    */
    expect(await prisma.schoolAlumnus.count({ where: { companyId, studentId } })).toBe(1);
  });

  it("corrects the leaving year on the existing alumni record when it closes again", async () => {
    const studentId = await makeStudent(formSixId, termOneId);
    await applyYearRollUp({
      companyId,
      fromTermId: termOneId,
      toTermId: termTwoId,
      decisions: [{ studentId, action: "WITHDRAW" }],
    });
    const leaver = await prisma.schoolLeaver.findFirstOrThrow({
      where: { companyId, studentId },
      select: { id: true },
    });
    await prisma.schoolLeaverClearance.updateMany({
      where: { leaverId: leaver.id },
      data: { state: "DONE" },
    });
    await closeLeaver({ companyId, actorId: studentId, leaverId: leaver.id });

    const first = await prisma.schoolAlumnus.findFirstOrThrow({
      where: { companyId, studentId },
      select: { id: true, classOf: true },
    });
    // A note the development office made, which must survive all of this.
    await prisma.schoolAlumniUpdate.create({
      data: {
        companyId,
        alumnusId: first.id,
        happenedOn: date("2027-02-01"),
        summary: "Reading Accounting at UZ",
      },
    });

    await reopenLeaver({
      companyId,
      actorId: studentId,
      leaverId: leaver.id,
      lastDay: date("2029-12-07"),
      reason: "COMPLETED_UPPER_6",
    });
    await prisma.schoolLeaverClearance.updateMany({
      where: { leaverId: leaver.id },
      data: { state: "DONE" },
    });
    await closeLeaver({ companyId, actorId: studentId, leaverId: leaver.id });

    const after = await prisma.schoolAlumnus.findFirstOrThrow({
      where: { companyId, studentId },
      select: { id: true, classOf: true, updates: { select: { summary: true } } },
    });
    // Same row, corrected year, timeline intact.
    expect(after.id).toBe(first.id);
    expect(after.classOf).toBe(2029);
    expect(after.updates.map((u) => u.summary)).toContain("Reading Accounting at UZ");
  });
});
