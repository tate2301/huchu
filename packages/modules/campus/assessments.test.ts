/**
 * Assessments, marks and the roll-up onto a result sheet.
 *
 * Several of these are migration witnesses: the rules they assert are CHECK
 * constraints and partial indexes in `20260804200000_school_assessments`, and
 * they insert past the service layer so that dropping a constraint fails the
 * test rather than quietly widening what the database will accept.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migration applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  AssessmentLockedError,
  computeClassTermMarks,
  resolveGradingScheme,
  rollUpTermMarks,
  saveAssessmentScores,
  ScoreOutOfRangeError,
} from "./assessments";

let companyId: string;
let termId: string;
let classId: string;
let mathsAssignmentId: string;
let englishAssignmentId: string;
let studentAId: string;
let studentBId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function makeAssessment(input: {
  kind: "CONTINUOUS" | "EXAM" | "PRACTICAL";
  maxScore?: number;
  weight?: number;
  classSubjectId?: string;
  title?: string;
}) {
  return prisma.schoolAssessment.create({
    data: {
      companyId,
      termId,
      classSubjectId: input.classSubjectId ?? mathsAssignmentId,
      kind: input.kind,
      title: input.title ?? `${input.kind} test`,
      maxScore: input.maxScore ?? 100,
      weight: input.weight ?? 1,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Assessment Test ${stamp}`, slug: `assessment-test-${stamp}` },
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

  const schoolClass = await prisma.schoolClass.create({
    data: { companyId, code: "F1", name: "Form 1", level: 8 },
  });
  classId = schoolClass.id;

  const maths = await prisma.schoolSubject.create({
    data: { companyId, code: "MAT", name: "Mathematics" },
  });
  const english = await prisma.schoolSubject.create({
    data: { companyId, code: "ENG", name: "English" },
  });

  const user = await prisma.user.create({
    data: {
      companyId,
      email: `teacher-${stamp}@assessment.test`,
      name: "Ms Banda",
      role: "TEACHER",
    },
  });
  const teacher = await prisma.schoolTeacherProfile.create({
    data: { companyId, userId: user.id, employeeCode: "T001" },
  });

  const mathsAssignment = await prisma.schoolClassSubject.create({
    data: {
      companyId,
      termId,
      classId,
      subjectId: maths.id,
      teacherProfileId: teacher.id,
    },
  });
  mathsAssignmentId = mathsAssignment.id;
  const englishAssignment = await prisma.schoolClassSubject.create({
    data: {
      companyId,
      termId,
      classId,
      subjectId: english.id,
      teacherProfileId: teacher.id,
    },
  });
  englishAssignmentId = englishAssignment.id;

  const studentA = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: "S001",
      firstName: "Rudo",
      lastName: "Chirwa",
      currentClassId: classId,
    },
  });
  studentAId = studentA.id;
  const studentB = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: "S002",
      firstName: "Tendai",
      lastName: "Moyo",
      currentClassId: classId,
    },
  });
  studentBId = studentB.id;
});

beforeEach(async () => {
  await prisma.schoolResultLine.deleteMany({ where: { companyId } });
  await prisma.schoolResultSheet.deleteMany({ where: { companyId } });
  await prisma.schoolAssessmentScore.deleteMany({ where: { companyId } });
  await prisma.schoolAssessment.deleteMany({ where: { companyId } });
  await prisma.schoolGradingBand.deleteMany({ where: { companyId } });
  await prisma.schoolGradingScheme.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("resolveGradingScheme", () => {
  it("falls back to the built-in table for a school that has not set one up", async () => {
    // Without this a teacher entering the first marks of the year is stopped by
    // a setup screen she has no reason to know exists.
    const scheme = await resolveGradingScheme(companyId);
    expect(scheme.continuousWeight).toBe(30);
    expect(scheme.bands.length).toBeGreaterThan(0);
  });

  it("prefers the school's default scheme", async () => {
    const created = await prisma.schoolGradingScheme.create({
      data: {
        companyId,
        code: "PRIMARY",
        name: "Primary scheme",
        continuousWeight: 60,
        examWeight: 40,
        isDefault: true,
      },
    });
    await prisma.schoolGradingBand.create({
      data: {
        companyId,
        schemeId: created.id,
        grade: "P",
        minScore: 40,
        maxScore: 100,
      },
    });

    const scheme = await resolveGradingScheme(companyId);
    expect(scheme.name).toBe("Primary scheme");
    expect(scheme.continuousWeight).toBe(60);
    expect(scheme.bands).toHaveLength(1);
  });

  it("refuses a scheme whose halves do not add to 100 — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolGradingScheme.create({
        data: {
          companyId,
          code: "SHORT",
          name: "Short",
          continuousWeight: 30,
          examWeight: 60,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses a second default scheme — MIGRATION WITNESS", async () => {
    await prisma.schoolGradingScheme.create({
      data: { companyId, code: "ONE", name: "One", isDefault: true },
    });
    await expect(
      prisma.schoolGradingScheme.create({
        data: { companyId, code: "TWO", name: "Two", isDefault: true },
      }),
    ).rejects.toThrow();
  });

  it("refuses a band that runs backwards — MIGRATION WITNESS", async () => {
    const scheme = await prisma.schoolGradingScheme.create({
      data: { companyId, code: "S", name: "S" },
    });
    await expect(
      prisma.schoolGradingBand.create({
        data: {
          companyId,
          schemeId: scheme.id,
          grade: "A",
          minScore: 90,
          maxScore: 40,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("saveAssessmentScores", () => {
  it("refuses a paper worth no marks — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolAssessment.create({
        data: {
          companyId,
          termId,
          classSubjectId: mathsAssignmentId,
          kind: "EXAM",
          title: "Nothing",
          maxScore: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses an absent student who also has a score — MIGRATION WITNESS", async () => {
    const assessment = await makeAssessment({ kind: "EXAM" });
    await expect(
      prisma.schoolAssessmentScore.create({
        data: {
          companyId,
          assessmentId: assessment.id,
          studentId: studentAId,
          score: 50,
          isAbsent: true,
        },
      }),
    ).rejects.toThrow();
  });

  it("saves a page of marks in one call", async () => {
    const assessment = await makeAssessment({ kind: "CONTINUOUS", maxScore: 20 });
    await saveAssessmentScores({
      companyId,
      assessmentId: assessment.id,
      scores: [
        { studentId: studentAId, score: 15 },
        { studentId: studentBId, score: 12 },
      ],
    });

    const saved = await prisma.schoolAssessmentScore.count({
      where: { assessmentId: assessment.id },
    });
    expect(saved).toBe(2);
  });

  it("overwrites rather than duplicating when the same page is saved twice", async () => {
    const assessment = await makeAssessment({ kind: "CONTINUOUS", maxScore: 20 });
    for (const score of [10, 18]) {
      await saveAssessmentScores({
        companyId,
        assessmentId: assessment.id,
        scores: [{ studentId: studentAId, score }],
      });
    }
    const rows = await prisma.schoolAssessmentScore.findMany({
      where: { assessmentId: assessment.id },
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].score)).toBe(18);
  });

  it("refuses a mark higher than the paper is worth, rather than clamping it", async () => {
    // 75 typed into a test out of 20 is a typo. Storing 20 would put a wrong
    // mark on a report with nothing to show it had been changed.
    const assessment = await makeAssessment({ kind: "CONTINUOUS", maxScore: 20 });
    await expect(
      saveAssessmentScores({
        companyId,
        assessmentId: assessment.id,
        scores: [{ studentId: studentAId, score: 75 }],
      }),
    ).rejects.toThrow(ScoreOutOfRangeError);
  });

  it("clears the score when a child is marked absent after being marked", async () => {
    const assessment = await makeAssessment({ kind: "CONTINUOUS" });
    await saveAssessmentScores({
      companyId,
      assessmentId: assessment.id,
      scores: [{ studentId: studentAId, score: 60 }],
    });
    await saveAssessmentScores({
      companyId,
      assessmentId: assessment.id,
      scores: [{ studentId: studentAId, score: 60, isAbsent: true }],
    });
    const row = await prisma.schoolAssessmentScore.findFirstOrThrow({
      where: { assessmentId: assessment.id, studentId: studentAId },
    });
    expect(row.score).toBeNull();
    expect(row.isAbsent).toBe(true);
  });

  it("refuses marks on a locked assessment", async () => {
    const assessment = await makeAssessment({ kind: "EXAM" });
    await prisma.schoolAssessment.update({
      where: { id: assessment.id },
      data: { status: "LOCKED" },
    });
    await expect(
      saveAssessmentScores({
        companyId,
        assessmentId: assessment.id,
        scores: [{ studentId: studentAId, score: 50 }],
      }),
    ).rejects.toThrow(AssessmentLockedError);
  });
});

describe("computeClassTermMarks", () => {
  it("returns a mark per student per subject", async () => {
    const mathsExam = await makeAssessment({ kind: "EXAM" });
    const englishExam = await makeAssessment({
      kind: "EXAM",
      classSubjectId: englishAssignmentId,
    });
    await saveAssessmentScores({
      companyId,
      assessmentId: mathsExam.id,
      scores: [
        { studentId: studentAId, score: 80 },
        { studentId: studentBId, score: 40 },
      ],
    });
    await saveAssessmentScores({
      companyId,
      assessmentId: englishExam.id,
      scores: [{ studentId: studentAId, score: 60 }],
    });

    const { marks } = await computeClassTermMarks({ companyId, termId, classId });
    expect(marks).toHaveLength(3);

    const rudoMaths = marks.find(
      (mark) => mark.studentId === studentAId && mark.subject.code === "MAT",
    );
    expect(rudoMaths?.mark).toBe(80);
    expect(rudoMaths?.grade?.grade).toBe("A");
  });

  it("narrows to one subject for a teacher who only takes that one", async () => {
    const mathsExam = await makeAssessment({ kind: "EXAM" });
    const englishExam = await makeAssessment({
      kind: "EXAM",
      classSubjectId: englishAssignmentId,
    });
    for (const id of [mathsExam.id, englishExam.id]) {
      await saveAssessmentScores({
        companyId,
        assessmentId: id,
        scores: [{ studentId: studentAId, score: 70 }],
      });
    }

    const { marks } = await computeClassTermMarks({
      companyId,
      termId,
      classId,
      classSubjectId: englishAssignmentId,
    });
    expect(marks).toHaveLength(1);
    expect(marks[0].subject.code).toBe("ENG");
  });
});

describe("rollUpTermMarks", () => {
  it("writes the marks onto a result sheet, creating one if needed", async () => {
    const exam = await makeAssessment({ kind: "EXAM" });
    await saveAssessmentScores({
      companyId,
      assessmentId: exam.id,
      scores: [
        { studentId: studentAId, score: 82 },
        { studentId: studentBId, score: 47 },
      ],
    });

    const result = await rollUpTermMarks({ companyId, termId, classId });
    expect(result.linesWritten).toBe(2);

    const lines = await prisma.schoolResultLine.findMany({
      where: { sheetId: result.sheetId },
      orderBy: { score: "desc" },
    });
    expect(lines[0].score).toBe(82);
    expect(lines[0].grade).toBe("A");
    expect(lines[1].grade).toBe("D");
  });

  it("replaces the previous lines rather than adding to them", async () => {
    const exam = await makeAssessment({ kind: "EXAM" });
    await saveAssessmentScores({
      companyId,
      assessmentId: exam.id,
      scores: [{ studentId: studentAId, score: 40 }],
    });
    const first = await rollUpTermMarks({ companyId, termId, classId });

    await saveAssessmentScores({
      companyId,
      assessmentId: exam.id,
      scores: [{ studentId: studentAId, score: 90 }],
    });
    const second = await rollUpTermMarks({ companyId, termId, classId });

    expect(second.sheetId).toBe(first.sheetId);
    const lines = await prisma.schoolResultLine.findMany({
      where: { sheetId: second.sheetId },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].score).toBe(90);
  });

  it("skips a student with nothing marked rather than writing a zero", async () => {
    const exam = await makeAssessment({ kind: "EXAM" });
    await saveAssessmentScores({
      companyId,
      assessmentId: exam.id,
      scores: [
        { studentId: studentAId, score: 70 },
        { studentId: studentBId, score: null },
      ],
    });

    const result = await rollUpTermMarks({ companyId, termId, classId });
    expect(result.linesWritten).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("refuses to roll up over a sheet a head of department has approved", async () => {
    // Otherwise the moderation trail records an approval of figures that are no
    // longer the ones on the sheet.
    const exam = await makeAssessment({ kind: "EXAM" });
    await saveAssessmentScores({
      companyId,
      assessmentId: exam.id,
      scores: [{ studentId: studentAId, score: 70 }],
    });
    const first = await rollUpTermMarks({ companyId, termId, classId });
    await prisma.schoolResultSheet.update({
      where: { id: first.sheetId },
      data: { status: "SUBMITTED" },
    });

    await expect(rollUpTermMarks({ companyId, termId, classId })).rejects.toThrow(
      /submitted/i,
    );
  });
});
