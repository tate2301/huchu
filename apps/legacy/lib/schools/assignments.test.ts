/**
 * Homework and what came back.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  assignmentBoard,
  AssignmentError,
  lateness,
  markSubmission,
  publishAssignment,
  submitAssignment,
} from "./assignments";

let companyId: string;
let termId: string;
let classId: string;
let classSubjectId: string;
let markerUserId: string;
let studentAId: string;
let studentBId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function makeAssignment(overrides: Record<string, unknown> = {}) {
  return prisma.schoolAssignment.create({
    data: {
      companyId,
      termId,
      classSubjectId,
      title: "Read chapter four",
      isPublished: true,
      publishedAt: new Date(),
      ...overrides,
    },
    select: { id: true, dueAt: true, isPublished: true },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Homework Test ${stamp}`, slug: `homework-test-${stamp}` },
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
  const term = await prisma.schoolTerm.create({
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
  termId = term.id;

  classId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "F1", name: "Form 1", level: 1 },
    })
  ).id;
  const subject = await prisma.schoolSubject.create({
    data: { companyId, code: "ENG", name: "English" },
  });
  const user = await prisma.user.create({
    data: {
      companyId,
      email: `hw-teacher-${stamp}@test.test`,
      name: "Ms Banda",
      role: "TEACHER",
    },
  });
  markerUserId = user.id;
  const teacher = await prisma.schoolTeacherProfile.create({
    data: { companyId, userId: user.id, employeeCode: "T001" },
  });
  classSubjectId = (
    await prisma.schoolClassSubject.create({
      data: {
        companyId,
        termId,
        classId,
        subjectId: subject.id,
        teacherProfileId: teacher.id,
      },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.schoolAssignmentSubmission.deleteMany({ where: { companyId } });
  await prisma.schoolAssignment.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });

  studentAId = (
    await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: "S001",
        firstName: "Rudo",
        lastName: "Chirwa",
        status: "ACTIVE",
        currentClassId: classId,
      },
    })
  ).id;
  studentBId = (
    await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: "S002",
        firstName: "Tendai",
        lastName: "Moyo",
        status: "ACTIVE",
        currentClassId: classId,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("lateness", () => {
  it("is decided against the deadline, and there is no deadline to miss without one", () => {
    expect(lateness(null, date("2026-03-01"))).toBe("SUBMITTED");
    expect(lateness(date("2026-03-01"), date("2026-02-28"))).toBe("SUBMITTED");
    expect(lateness(date("2026-03-01"), date("2026-03-02"))).toBe("LATE");
  });
});

describe("publishAssignment", () => {
  it("sets the date when it publishes and clears it when it does not", async () => {
    const assignment = await makeAssignment({ isPublished: false, publishedAt: null });
    const published = await publishAssignment({
      companyId,
      assignmentId: assignment.id,
      publish: true,
    });
    expect(published.publishedAt).not.toBeNull();

    const withdrawn = await publishAssignment({
      companyId,
      assignmentId: assignment.id,
      publish: false,
    });
    expect(withdrawn.publishedAt).toBeNull();
  });

  it("refuses to unpublish work children have already handed in", async () => {
    const assignment = await makeAssignment();
    await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
      content: "Done",
    });
    await expect(
      publishAssignment({ companyId, assignmentId: assignment.id, publish: false }),
    ).rejects.toThrow(/already handed this in/);
  });

  it("refuses published with no date — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolAssignment.create({
        data: { companyId, termId, classSubjectId, title: "X", isPublished: true },
      }),
    ).rejects.toThrow();
  });

  it("refuses homework marked out of zero — MIGRATION WITNESS", async () => {
    // Null is how to say "not marked". Zero says it is marked and is not.
    await expect(
      prisma.schoolAssignment.create({
        data: { companyId, termId, classSubjectId, title: "X", maxScore: 0 },
      }),
    ).rejects.toThrow();
  });
});

describe("submitAssignment", () => {
  it("refuses work for homework that has not been set", async () => {
    const assignment = await makeAssignment({ isPublished: false, publishedAt: null });
    await expect(
      submitAssignment({
        companyId,
        assignmentId: assignment.id,
        studentId: studentAId,
      }),
    ).rejects.toThrow(/not been set/);
  });

  it("records late work as late rather than refusing it", async () => {
    // A school still wants the work. Lateness is a fact about it, not a reason
    // to lose it.
    const assignment = await makeAssignment({ dueAt: date("2026-03-01") });
    const submission = await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
      at: date("2026-03-05"),
    });
    expect(submission.status).toBe("LATE");
  });

  it("keeps a late submission late when the child edits it the next day", async () => {
    // Re-deciding lateness on every save would let late work become on time.
    const assignment = await makeAssignment({ dueAt: date("2026-03-01") });
    await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
      at: date("2026-03-05"),
      content: "First go",
    });
    const edited = await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
      at: date("2026-03-06"),
      content: "Better go",
    });
    expect(edited.status).toBe("LATE");
  });

  it("keeps one submission per child, not two", async () => {
    const assignment = await makeAssignment();
    for (const content of ["First", "Second"]) {
      await submitAssignment({
        companyId,
        assignmentId: assignment.id,
        studentId: studentAId,
        content,
      });
    }
    const rows = await prisma.schoolAssignmentSubmission.findMany({
      where: { assignmentId: assignment.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("Second");
  });
});

describe("markSubmission", () => {
  it("marks and hands back, recording who did it", async () => {
    const assignment = await makeAssignment({ maxScore: 10 });
    const submission = await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
    });
    const marked = await markSubmission({
      companyId,
      submissionId: submission.id,
      score: 8,
      feedback: "Good, but check your spelling",
      markedById: markerUserId,
    });
    expect(marked.status).toBe("RETURNED");

    const row = await prisma.schoolAssignmentSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });
    expect(row.markedById).toBe(markerUserId);
    expect(row.markedAt).not.toBeNull();
  });

  it("refuses a mark on homework that is not marked out of anything", async () => {
    const assignment = await makeAssignment();
    const submission = await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
    });
    await expect(
      markSubmission({
        companyId,
        submissionId: submission.id,
        score: 5,
        markedById: markerUserId,
      }),
    ).rejects.toThrow(/not marked out of anything/);
  });

  it("refuses a mark above the total", async () => {
    const assignment = await makeAssignment({ maxScore: 10 });
    const submission = await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
    });
    await expect(
      markSubmission({
        companyId,
        submissionId: submission.id,
        score: 40,
        markedById: markerUserId,
      }),
    ).rejects.toThrow(AssignmentError);
  });

  it("sends work back to be done again", async () => {
    const assignment = await makeAssignment({ maxScore: 10 });
    const submission = await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
    });
    const sent = await markSubmission({
      companyId,
      submissionId: submission.id,
      feedback: "Have another go at question three",
      markedById: markerUserId,
      sendBack: true,
    });
    expect(sent.status).toBe("RESUBMIT");
  });

  it("refuses a marker with no time against them — MIGRATION WITNESS", async () => {
    const assignment = await makeAssignment();
    const submission = await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
    });
    await expect(
      prisma.schoolAssignmentSubmission.update({
        where: { id: submission.id },
        data: { markedById: markerUserId },
      }),
    ).rejects.toThrow();
  });
});

describe("assignmentBoard", () => {
  it("shows the child who has handed in nothing", async () => {
    // The only thing a teacher opens this for on a Tuesday evening. A list of
    // submissions cannot show an absence.
    const assignment = await makeAssignment();
    await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
      content: "Done",
    });

    const board = await assignmentBoard({ companyId, assignmentId: assignment.id });
    expect(board.rows).toHaveLength(2);
    expect(board.summary.in).toBe(1);

    const missing = board.rows.find((row) => row.student.id === studentBId);
    expect(missing?.submission).toBeNull();
  });

  it("counts what is late and what has been marked", async () => {
    const assignment = await makeAssignment({ dueAt: date("2026-03-01"), maxScore: 10 });
    await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentAId,
      at: date("2026-03-05"),
    });
    const onTime = await submitAssignment({
      companyId,
      assignmentId: assignment.id,
      studentId: studentBId,
      at: date("2026-02-28"),
    });
    await markSubmission({
      companyId,
      submissionId: onTime.id,
      score: 9,
      markedById: markerUserId,
    });

    const board = await assignmentBoard({ companyId, assignmentId: assignment.id });
    expect(board.summary).toEqual({ total: 2, in: 2, late: 1, marked: 1 });
  });
});
