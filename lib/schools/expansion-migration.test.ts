/**
 * Migration witness for conduct, exams, leavers and alumni.
 *
 * `prisma/migrations/20260916090000_school_conduct_exams_leavers` ships 31
 * tables, 18 enums and four columns on `SchoolStudent`. A schema change without
 * a witness is a schema change that reaches production as a runtime error:
 * `db push` on a developer's machine makes the application work locally while
 * `migrate deploy` leaves the tables absent, and the first symptom is a query
 * against a relation that does not exist.
 *
 * So these tests assert the **database** refuses what the schema says it
 * refuses. Each one fails if somebody edits `schema.prisma` and forgets the
 * SQL, and each names the invariant rather than the index.
 *
 * Prerequisites: a real Postgres DATABASE_URL_TEST with the migrations applied.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";

let companyId: string;
let termId: string;
let studentId: string;
let secondStudentId: string;
let categoryId: string;
let boardId: string;
let seriesId: string;
let examSubjectId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Expansion Migration ${stamp}`, slug: `expansion-migration-${stamp}` },
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
      code: "T3",
      name: "Term 3",
      startDate: date("2026-09-01"),
      endDate: date("2026-12-04"),
    },
  });
  termId = term.id;

  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `EXP-${stamp}-1`,
      firstName: "Tadiwa",
      lastName: "Marange",
      status: "ACTIVE",
      // The four columns the entry file requires. Their presence is itself a
      // witness: on a database without the migration this create fails.
      certifiedName: "Tadiwa Marange",
      nationalId: `63-${stamp}`.slice(0, 20),
      birthCertificateNo: `BC-${stamp}`,
      house: "Nyanga",
    },
  });
  studentId = student.id;

  const second = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `EXP-${stamp}-2`,
      firstName: "Tariro",
      lastName: "Ncube",
      status: "ACTIVE",
    },
  });
  secondStudentId = second.id;

  const category = await prisma.schoolConductCategory.create({
    data: { companyId, code: `LATE-${stamp}`, name: "Lateness", tone: "PLAIN" },
  });
  categoryId = category.id;

  const board = await prisma.schoolExamBoard.create({
    data: { companyId, code: `ZIMSEC-${stamp}`, name: "ZIMSEC" },
  });
  boardId = board.id;

  const series = await prisma.schoolExamSeries.create({
    data: {
      companyId,
      boardId,
      name: `November ${stamp}`,
      year: 2026,
      level: "O_LEVEL",
    },
  });
  seriesId = series.id;

  const examSubject = await prisma.schoolExamSubject.create({
    data: {
      companyId,
      boardId,
      code: `4008-${stamp}`.slice(0, 20),
      name: "Mathematics",
      level: "O_LEVEL",
    },
  });
  examSubjectId = examSubject.id;
});

describe("the expansion's tables exist and hold their invariants", () => {
  it("refuses a second incident with the same reference — MIGRATION WITNESS", async () => {
    // `CI-2026-0417` is quoted on paper and read back over a telephone. Two
    // incidents under one reference is a school filing by number with two
    // identical folders.
    const reference = `CI-2026-${Date.now()}`.slice(0, 24);
    await prisma.schoolConductIncident.create({
      data: {
        companyId,
        termId,
        studentId,
        categoryId,
        reference,
        occurredAt: new Date(),
        summary: "Late again, missed registration",
        reportedByUserId: studentId,
      },
    });
    await expect(
      prisma.schoolConductIncident.create({
        data: {
          companyId,
          termId,
          studentId: secondStudentId,
          categoryId,
          reference,
          occurredAt: new Date(),
          summary: "A second thing under the same number",
          reportedByUserId: studentId,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses a second leaver for one pupil — MIGRATION WITNESS", async () => {
    // A pupil leaves once. A second departure is a re-admission followed by a
    // second leaver, which needs the first record closed first.
    await prisma.schoolLeaver.create({
      data: {
        companyId,
        studentId,
        lastDay: date("2026-11-27"),
        reason: "COMPLETED_FORM_4",
        openedByUserId: studentId,
      },
    });
    await expect(
      prisma.schoolLeaver.create({
        data: {
          companyId,
          studentId,
          lastDay: date("2026-12-04"),
          reason: "TRANSFERRED_TO_ANOTHER_SCHOOL",
          openedByUserId: studentId,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses the same subject entered twice for one candidate — MIGRATION WITNESS", async () => {
    // The fee is charged per subject entered, so a duplicate entry is a family
    // billed twice for one sitting.
    const candidate = await prisma.schoolCandidate.create({
      data: { companyId, seriesId, studentId, candidateNumber: "0138" },
    });
    await prisma.schoolExamEntry.create({
      data: { companyId, seriesId, candidateId: candidate.id, examSubjectId },
    });
    await expect(
      prisma.schoolExamEntry.create({
        data: { companyId, seriesId, candidateId: candidate.id, examSubjectId },
      }),
    ).rejects.toThrow();
  });

  it("refuses two candidate numbers the same in one series — MIGRATION WITNESS", async () => {
    // A candidate number is unique inside a centre and a series. Two pupils
    // under one number is two pupils the board cannot tell apart.
    await expect(
      prisma.schoolCandidate.create({
        data: { companyId, seriesId, studentId: secondStudentId, candidateNumber: "0138" },
      }),
    ).rejects.toThrow();
  });

  it("refuses one pupil seated twice in a sitting — MIGRATION WITNESS", async () => {
    const room = await prisma.schoolRoom.create({
      data: { companyId, code: `HALL-${Date.now()}`, name: "Main Hall", capacity: 120 },
    });
    const session = await prisma.schoolExamSession.create({
      data: { companyId, seriesId, startsAt: new Date(), label: "Tuesday morning" },
    });
    const allocation = await prisma.schoolExamRoomAllocation.create({
      data: { companyId, sessionId: session.id, roomId: room.id, capacity: 120 },
    });
    const candidate = await prisma.schoolCandidate.findFirst({
      where: { companyId, seriesId },
      select: { id: true },
    });
    await prisma.schoolExamSeat.create({
      data: {
        companyId,
        sessionId: session.id,
        allocationId: allocation.id,
        candidateId: candidate!.id,
        seatNumber: "001",
      },
    });
    await expect(
      prisma.schoolExamSeat.create({
        data: {
          companyId,
          sessionId: session.id,
          allocationId: allocation.id,
          candidateId: candidate!.id,
          seatNumber: "002",
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses one award named twice on a session — MIGRATION WITNESS", async () => {
    // `1 of 2` is the award's denominator and the register's numerator. Two
    // register lines for one award would make a pupil serve the same Friday
    // twice on paper.
    const session = await prisma.schoolDetentionSession.create({
      data: {
        companyId,
        termId,
        startsAt: date("2026-09-18"),
        endsAt: date("2026-09-18"),
        label: "Friday detention",
      },
    });
    const award = await prisma.schoolDetentionAward.create({
      data: { companyId, termId, studentId, sessionsOwed: 2 },
    });
    await prisma.schoolDetentionAttendance.create({
      data: { companyId, sessionId: session.id, awardId: award.id, studentId },
    });
    await expect(
      prisma.schoolDetentionAttendance.create({
        data: { companyId, sessionId: session.id, awardId: award.id, studentId },
      }),
    ).rejects.toThrow();
  });

  it("refuses one reader named twice on a pastoral note — MIGRATION WITNESS", async () => {
    // A note's named readers are its access-control list. Two rows for one
    // person is two grants to revoke, and revoking one would look like a
    // revocation that did not take.
    const note = await prisma.schoolPastoralNote.create({
      data: {
        companyId,
        studentId,
        authorUserId: studentId,
        body: "Nothing in this test is a real note.",
        band: "PASTORAL_TEAM_ONLY",
      },
    });
    await prisma.schoolPastoralNoteReader.create({
      data: { companyId, noteId: note.id, userId: studentId, grantedByUserId: studentId },
    });
    await expect(
      prisma.schoolPastoralNoteReader.create({
        data: { companyId, noteId: note.id, userId: studentId, grantedByUserId: studentId },
      }),
    ).rejects.toThrow();
  });

  it("refuses a second clearance of one kind on a leaver — MIGRATION WITNESS", async () => {
    // Five marks, one of each. Two `FEES` rows is two answers to one question
    // and a queue that cannot say whether the record may close.
    const leaver = await prisma.schoolLeaver.findFirst({
      where: { companyId },
      select: { id: true },
    });
    await prisma.schoolLeaverClearance.create({
      data: { companyId, leaverId: leaver!.id, kind: "FEES", state: "TODO" },
    });
    await expect(
      prisma.schoolLeaverClearance.create({
        data: { companyId, leaverId: leaver!.id, kind: "FEES", state: "DONE" },
      }),
    ).rejects.toThrow();
  });

  it("refuses two alumni rows for one pupil — MIGRATION WITNESS", async () => {
    await prisma.schoolAlumnus.create({
      data: { companyId, studentId, firstName: "Tadiwa", lastName: "Marange", classOf: 2026 },
    });
    await expect(
      prisma.schoolAlumnus.create({
        data: { companyId, studentId, firstName: "Tadiwa", lastName: "Marange", classOf: 2026 },
      }),
    ).rejects.toThrow();
  });
});
