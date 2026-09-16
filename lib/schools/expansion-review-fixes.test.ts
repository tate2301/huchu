/**
 * The review's findings, held down by tests.
 *
 * Each of these covers a defect found on the pull request rather than a
 * feature: a remark counted twice, a grade written for a candidate who was
 * never entered, a bursar settling the library's mark, and a pupil leaving
 * under any reason being recorded as a graduate. They are separate from the
 * feature tests deliberately — a regression here is a regression of a fix, and
 * the sentence that names it should say what went wrong the first time.
 *
 * Prerequisites: a real Postgres DATABASE_URL_TEST with the migrations applied.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { captureResults, ExamError, resultsForSeries } from "./exams";
import { clearanceDenial, statusAfterLeaving } from "./leavers";

let companyId: string;
let seriesId: string;
let otherSeriesId: string;
let candidateId: string;
let otherCandidateId: string;
let mathsId: string;
let englishId: string;

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Review Fixes ${stamp}`, slug: `review-fixes-${stamp}` },
  });
  companyId = company.id;

  const board = await prisma.schoolExamBoard.create({
    data: { companyId, code: `ZIMSEC-${stamp}`, name: "ZIMSEC" },
  });

  const series = await prisma.schoolExamSeries.create({
    data: { companyId, boardId: board.id, name: "November", year: 2026, level: "O_LEVEL" },
  });
  seriesId = series.id;

  const other = await prisma.schoolExamSeries.create({
    data: { companyId, boardId: board.id, name: "June", year: 2026, level: "O_LEVEL" },
  });
  otherSeriesId = other.id;

  const maths = await prisma.schoolExamSubject.create({
    data: {
      companyId,
      boardId: board.id,
      code: `4008-${stamp}`.slice(0, 20),
      name: "Mathematics",
      level: "O_LEVEL",
    },
  });
  mathsId = maths.id;

  const english = await prisma.schoolExamSubject.create({
    data: {
      companyId,
      boardId: board.id,
      code: `1122-${stamp}`.slice(0, 20),
      name: "English Language",
      level: "O_LEVEL",
    },
  });
  englishId = english.id;

  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `RF-${stamp}-1`,
      firstName: "Tinashe",
      lastName: "Muchemwa",
      status: "ACTIVE",
    },
  });
  const candidate = await prisma.schoolCandidate.create({
    data: { companyId, seriesId, studentId: student.id, candidateNumber: "0101" },
  });
  candidateId = candidate.id;

  // Entered for Mathematics only. English is deliberately left un-entered so a
  // grade for it has nothing behind it.
  await prisma.schoolExamEntry.create({
    data: { companyId, seriesId, candidateId, examSubjectId: mathsId, status: "ENTERED" },
  });

  const otherStudent = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `RF-${stamp}-2`,
      firstName: "Rufaro",
      lastName: "Gwatidzo",
      status: "ACTIVE",
    },
  });
  const otherCandidate = await prisma.schoolCandidate.create({
    data: {
      companyId,
      seriesId: otherSeriesId,
      studentId: otherStudent.id,
      candidateNumber: "0202",
    },
  });
  otherCandidateId = otherCandidate.id;
  await prisma.schoolExamEntry.create({
    data: {
      companyId,
      seriesId: otherSeriesId,
      candidateId: otherCandidateId,
      examSubjectId: mathsId,
      status: "ENTERED",
    },
  });
});

describe("captureResults validates what it is given", () => {
  it("refuses a grade for a subject the candidate was never entered for", async () => {
    // Otherwise a mistyped id records a sitting that did not happen, and it
    // lands in a subject's pass rate where nobody can see it came from nowhere.
    await expect(
      captureResults({
        companyId,
        actorId: candidateId,
        seriesId,
        rows: [{ candidateId, examSubjectId: englishId, grade: "C" }],
      }),
    ).rejects.toThrow(ExamError);
  });

  it("refuses a candidate who belongs to another series", async () => {
    // The foreign keys are global: the database would happily attach the June
    // resit's candidate to November's series. That is how another tenant's
    // pupil reaches this school's analytics, and how their name comes back out
    // of `resultsForSeries`.
    await expect(
      captureResults({
        companyId,
        actorId: candidateId,
        seriesId,
        rows: [{ candidateId: otherCandidateId, examSubjectId: mathsId, grade: "A" }],
      }),
    ).rejects.toThrow(/is entered for those subjects in this series/);
  });

  it("writes nothing at all when one row in the batch is a stray", async () => {
    const before = await prisma.schoolExamResult.count({ where: { companyId, seriesId } });
    await expect(
      captureResults({
        companyId,
        actorId: candidateId,
        seriesId,
        rows: [
          { candidateId, examSubjectId: mathsId, grade: "B" },
          { candidateId, examSubjectId: englishId, grade: "C" },
        ],
      }),
    ).rejects.toThrow();
    expect(await prisma.schoolExamResult.count({ where: { companyId, seriesId } })).toBe(before);
  });

  it("takes a grade for an entry that exists", async () => {
    const result = await captureResults({
      companyId,
      actorId: candidateId,
      seriesId,
      rows: [{ candidateId, examSubjectId: mathsId, grade: "D" }],
    });
    expect(result.captured).toBe(1);
  });
});

describe("a remark counts once", () => {
  it("does not record two sittings when a D is remarked to a C", async () => {
    // Both rows are kept — the first grade is what the board originally said
    // and somebody will ask — but the figures are computed over the effective
    // grade. Counting both made one candidate two, gave the subject two
    // sittings and moved its pass rate twice.
    await captureResults({
      companyId,
      actorId: candidateId,
      seriesId,
      rows: [{ candidateId, examSubjectId: mathsId, grade: "C", isRemark: true }],
    });

    const stored = await prisma.schoolExamResult.count({
      where: { companyId, seriesId, candidateId, examSubjectId: mathsId },
    });
    expect(stored).toBe(2);

    const page = await resultsForSeries({ companyId, seriesId });
    const maths = page.subjects.find((row) => row.subject === "Mathematics");
    expect(maths?.sat).toBe(1);
    // The remark wins, so the subject reads as a pass.
    expect(maths?.passes).toBe(1);
    expect(maths?.passRate).toBe(100);

    // One candidate, one grade on their statement.
    expect(page.byCandidate).toHaveLength(1);
    expect(page.byCandidate[0].grades).toHaveLength(1);
    expect(page.byCandidate[0].grades[0].grade).toBe("C");

    // And the amendment is still counted as an amendment.
    expect(page.amended).toBe(1);
  });
});

describe("leaving does not make everybody a graduate", () => {
  it("graduates only the two completion reasons", () => {
    expect(statusAfterLeaving("COMPLETED_FORM_4")).toBe("GRADUATED");
    expect(statusAfterLeaving("COMPLETED_UPPER_6")).toBe("GRADUATED");
  });

  it("withdraws every other reason", () => {
    // An expelled pupil reported as a graduate of this school is a statistic a
    // head quotes and a reference somebody writes years later.
    expect(statusAfterLeaving("EXPELLED")).toBe("WITHDRAWN");
    expect(statusAfterLeaving("TRANSFERRED_TO_ANOTHER_SCHOOL")).toBe("WITHDRAWN");
    expect(statusAfterLeaving("FEES")).toBe("WITHDRAWN");
    expect(statusAfterLeaving("MOVED_ABROAD")).toBe("WITHDRAWN");
    expect(statusAfterLeaving("WITHDRAWN_BY_GUARDIAN")).toBe("WITHDRAWN");
    expect(statusAfterLeaving("OTHER")).toBe("WITHDRAWN");
  });
});

describe("each office settles its own clearance mark", () => {
  it("lets the bursar settle the fees and nothing else", () => {
    expect(clearanceDenial("BURSAR", "FEES")).toBeNull();
    // The one that mattered: a bursar could mark the library and the bed done
    // and make a record closable without the office holding the book or the key.
    expect(clearanceDenial("BURSAR", "LIBRARY")).toMatch(/librarian|office/);
    expect(clearanceDenial("BURSAR", "BOARDING")).toMatch(/warden/);
  });

  it("lets the warden settle the bed and nothing else", () => {
    expect(clearanceDenial("WARDEN", "BOARDING")).toBeNull();
    expect(clearanceDenial("WARDEN", "FEES")).toMatch(/bursar/);
  });

  it("lets the office settle any of them", () => {
    for (const kind of ["FEES", "LIBRARY", "BOARDING", "PORTAL", "RESULTS"] as const) {
      expect(clearanceDenial("REGISTRAR", kind)).toBeNull();
      expect(clearanceDenial("SCHOOL_ADMIN", kind)).toBeNull();
    }
  });

  it("refuses a role that holds no clearance at all", () => {
    expect(clearanceDenial("TEACHER", "FEES")).not.toBeNull();
    expect(clearanceDenial(null, "FEES")).not.toBeNull();
    expect(clearanceDenial("PARENT", "PORTAL")).not.toBeNull();
  });
});
