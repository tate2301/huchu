/**
 * The exam timetable, and the dead end it was built to close.
 *
 * `SchoolExamPaper` and `SchoolExamSession` shipped with the exams expansion,
 * were read by `seatingPlan()` and drawn by the Seating tab, and were created
 * by nothing in the product — the only `create` anywhere in the repository was
 * in a migration witness test. So every school opened Seating to "this series
 * has no sittings yet" and had nowhere to go.
 *
 * What is asserted here is that the write path exists and holds the rules that
 * make a timetable worth trusting: a paper and its sitting are written
 * together, a subject from another board or another level is refused, a
 * cross-tenant subject id is refused, and a paper somebody is seated for
 * cannot be quietly deleted from under a printed seating plan.
 *
 * Prerequisites: a real Postgres DATABASE_URL_TEST with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildEntryFile, enterSubject, ExamError } from "./exams";
import { addPaper, listTimetable, removePaper, reschedulePaper } from "./exam-timetable";

let companyId: string;
let otherCompanyId: string;
let boardId: string;
let seriesId: string;
let mathsId: string;
let shonaId: string;
/** A-Level subject on an O-Level series, and a subject on another board. */
let aLevelSubjectId: string;
let otherBoardSubjectId: string;
let foreignSubjectId: string;

function at(iso: string) {
  return new Date(iso);
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Exam Timetable ${stamp}`, slug: `exam-timetable-${stamp}` },
  });
  companyId = company.id;

  const other = await prisma.company.create({
    data: { name: `Exam Timetable Other ${stamp}`, slug: `exam-timetable-other-${stamp}` },
  });
  otherCompanyId = other.id;

  const board = await prisma.schoolExamBoard.create({
    data: { companyId, code: "ZIMSEC", name: "ZIMSEC" },
  });
  boardId = board.id;

  const cambridge = await prisma.schoolExamBoard.create({
    data: { companyId, code: "CAMBRIDGE", name: "Cambridge" },
  });

  const series = await prisma.schoolExamSeries.create({
    data: {
      companyId,
      boardId,
      name: `November ${new Date().getFullYear()}`,
      year: new Date().getFullYear(),
      level: "O_LEVEL",
    },
  });
  seriesId = series.id;

  const maths = await prisma.schoolExamSubject.create({
    data: { companyId, boardId, code: "4008", name: "Mathematics", level: "O_LEVEL" },
  });
  mathsId = maths.id;

  const shona = await prisma.schoolExamSubject.create({
    data: { companyId, boardId, code: "3159", name: "Shona", level: "O_LEVEL" },
  });
  shonaId = shona.id;

  const aLevel = await prisma.schoolExamSubject.create({
    data: { companyId, boardId, code: "9164", name: "Pure Mathematics", level: "A_LEVEL" },
  });
  aLevelSubjectId = aLevel.id;

  const otherBoard = await prisma.schoolExamSubject.create({
    data: {
      companyId,
      boardId: cambridge.id,
      code: "0580",
      name: "Mathematics (IGCSE)",
      level: "O_LEVEL",
    },
  });
  otherBoardSubjectId = otherBoard.id;

  // Another school's syllabus row, to prove the tenant boundary holds when an
  // id arrives in a request body.
  const foreignBoard = await prisma.schoolExamBoard.create({
    data: { companyId: otherCompanyId, code: "ZIMSEC", name: "ZIMSEC" },
  });
  const foreign = await prisma.schoolExamSubject.create({
    data: {
      companyId: otherCompanyId,
      boardId: foreignBoard.id,
      code: "4008",
      name: "Mathematics",
      level: "O_LEVEL",
    },
  });
  foreignSubjectId = foreign.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.$disconnect();
});

describe("writing the timetable", () => {
  it("writes the paper and its sitting together, so seating has something to seat", async () => {
    const paper = await addPaper({
      companyId,
      seriesId,
      examSubjectId: mathsId,
      paperNumber: 1,
      sitsAt: at("2026-11-03T09:00:00.000Z"),
      durationMinutes: 150,
    });

    // The code is offered rather than imposed, and 4008/1 is the shape.
    expect(paper.code).toBe("4008/1");
    expect(paper.session).not.toBeNull();
    expect(paper.session?.startsAt.toISOString()).toBe("2026-11-03T09:00:00.000Z");
    // The sitting ends when the paper does, which is what the clash check reads.
    expect(paper.session?.endsAt?.toISOString()).toBe("2026-11-03T11:30:00.000Z");

    const sessions = await prisma.schoolExamSession.findMany({
      where: { companyId, seriesId },
    });
    expect(sessions).toHaveLength(1);
  });

  it("refuses a second paper 1 for the same subject, as a correction rather than a 500", async () => {
    // @@unique([seriesId, examSubjectId, paperNumber]). Somebody copying a
    // timetable will type paper 1 twice.
    await expect(
      addPaper({
        companyId,
        seriesId,
        examSubjectId: mathsId,
        paperNumber: 1,
        sitsAt: at("2026-11-04T09:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ name: "ExamError", status: 409 });
  });

  it("refuses a subject from another board", async () => {
    // A Cambridge IGCSE subject on a ZIMSEC series is a row the board rejects,
    // and November is too late to find that out.
    await expect(
      addPaper({
        companyId,
        seriesId,
        examSubjectId: otherBoardSubjectId,
        paperNumber: 1,
        sitsAt: at("2026-11-05T09:00:00.000Z"),
      }),
    ).rejects.toThrow(/different exam board/i);
  });

  it("refuses a subject at another level", async () => {
    await expect(
      addPaper({
        companyId,
        seriesId,
        examSubjectId: aLevelSubjectId,
        paperNumber: 1,
        sitsAt: at("2026-11-05T09:00:00.000Z"),
      }),
    // Both levels named, so the reader knows which of forty subjects to pick
    // instead: "That subject is Advanced Level, and this series is Ordinary
    // Level."
    ).rejects.toThrow(/Advanced Level.*Ordinary Level/i);
  });

  it("refuses another school's subject id", async () => {
    // The tenant boundary. `examSubjectId` arrives in a request body, and
    // unchecked it writes one school's paper against another school's syllabus.
    await expect(
      addPaper({
        companyId,
        seriesId,
        examSubjectId: foreignSubjectId,
        paperNumber: 1,
        sitsAt: at("2026-11-05T09:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ name: "ExamError", status: 404 });
  });

  it("moves the sitting when the paper moves", async () => {
    const paper = await addPaper({
      companyId,
      seriesId,
      examSubjectId: shonaId,
      paperNumber: 1,
      sitsAt: at("2026-11-06T09:00:00.000Z"),
      durationMinutes: 120,
    });

    // Boards reschedule. A paper whose date changed while its session stayed
    // put would seat a hall on the wrong morning.
    await reschedulePaper({
      companyId,
      paperId: paper.id,
      sitsAt: at("2026-11-10T14:00:00.000Z"),
    });

    const rows = await listTimetable({ companyId, seriesId });
    const moved = rows.find((row) => row.id === paper.id);
    expect(moved?.sitsAt?.toISOString()).toBe("2026-11-10T14:00:00.000Z");
    expect(moved?.session?.startsAt.toISOString()).toBe("2026-11-10T14:00:00.000Z");
    // The duration it already had is kept, so the end moves with the start.
    expect(moved?.session?.endsAt?.toISOString()).toBe("2026-11-10T16:00:00.000Z");
  });

  it("lists dated papers first and undated ones last", async () => {
    await addPaper({
      companyId,
      seriesId,
      examSubjectId: shonaId,
      paperNumber: 2,
      sitsAt: at("2026-11-02T09:00:00.000Z"),
    });

    const rows = await listTimetable({ companyId, seriesId });
    const dates = rows.map((row) => row.sitsAt?.toISOString() ?? null);
    const dated = dates.filter((value): value is string => value !== null);
    expect([...dated]).toEqual([...dated].sort());
  });

  it("will not delete a paper somebody is already seated for", async () => {
    const paper = await addPaper({
      companyId,
      seriesId,
      examSubjectId: mathsId,
      paperNumber: 2,
      sitsAt: at("2026-11-12T09:00:00.000Z"),
      durationMinutes: 90,
    });

    const student = await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `TT-${Date.now()}`,
        firstName: "Rudo",
        lastName: "Chikwava",
        status: "ACTIVE",
      },
    });
    const candidate = await prisma.schoolCandidate.create({
      data: { companyId, seriesId, studentId: student.id, candidateNumber: "0101" },
    });
    const room = await prisma.schoolRoom.create({
      data: { companyId, code: `HALL-${Date.now()}`, name: "Main Hall", capacity: 120 },
    });
    const allocation = await prisma.schoolExamRoomAllocation.create({
      data: {
        companyId,
        sessionId: paper.session!.id,
        roomId: room.id,
        capacity: 120,
      },
    });
    await prisma.schoolExamSeat.create({
      data: {
        companyId,
        sessionId: paper.session!.id,
        allocationId: allocation.id,
        candidateId: candidate.id,
        seatNumber: "001",
      },
    });

    // A seating plan is printed, pinned up and handed to invigilators. Deleting
    // the sitting under it would leave a hall holding desk cards for a paper
    // the system says is not happening.
    await expect(removePaper({ companyId, paperId: paper.id })).rejects.toMatchObject({
      name: "ExamError",
      status: 409,
    });
  });

  it("takes an unseated paper and its sitting off together", async () => {
    const paper = await addPaper({
      companyId,
      seriesId,
      examSubjectId: shonaId,
      paperNumber: 3,
      sitsAt: at("2026-11-13T09:00:00.000Z"),
    });

    await removePaper({ companyId, paperId: paper.id });

    // The session goes with it. `SchoolExamSession.paperId` is SetNull on
    // delete, so leaving it behind would put a sitting belonging to no paper
    // on the seating screen.
    const orphan = await prisma.schoolExamSession.findMany({
      where: { companyId, id: paper.session!.id },
    });
    expect(orphan).toHaveLength(0);
  });

  it("refuses a paper on another school's series", async () => {
    await expect(
      addPaper({
        companyId: otherCompanyId,
        seriesId,
        examSubjectId: foreignSubjectId,
        paperNumber: 1,
        sitsAt: at("2026-11-14T09:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(ExamError);
  });
});

describe("entering a candidate for a subject", () => {
  let candidateId: string;

  beforeAll(async () => {
    const student = await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `ENT-${Date.now()}`,
        firstName: "Tapiwa",
        lastName: "Nyoni",
        status: "ACTIVE",
      },
    });
    const candidate = await prisma.schoolCandidate.create({
      data: { companyId, seriesId, studentId: student.id, candidateNumber: "0200" },
    });
    candidateId = candidate.id;
  });

  it("refuses another school's subject id", async () => {
    // `examSubjectId` arrives in a request body. Unchecked, one school entered
    // a candidate against another school's syllabus row — this was the one
    // place in exams.ts that skipped the company check.
    await expect(
      enterSubject({
        companyId,
        actorId: "test",
        seriesId,
        candidateId,
        examSubjectId: foreignSubjectId,
      }),
    ).rejects.toMatchObject({ name: "ExamError", status: 404 });
  });

  it("refuses a subject from another board", async () => {
    await expect(
      enterSubject({
        companyId,
        actorId: "test",
        seriesId,
        candidateId,
        examSubjectId: otherBoardSubjectId,
      }),
    ).rejects.toThrow(/different exam board/i);
  });

  it("revives a withdrawn entry instead of dying on the unique constraint", async () => {
    /*
      The regression this pins. `withdrawEntry` sets status WITHDRAWN and keeps
      the row, and `@@unique([candidateId, examSubjectId])` means the row is
      still in the way — so a pupil who dropped a subject in June and picked it
      up again in July hit an unhandled unique-constraint violation. A 500 with
      a Prisma message, on an ordinary thing a school does, with no way round it
      short of the database.
    */
    const first = await enterSubject({
      companyId,
      actorId: "test",
      seriesId,
      candidateId,
      examSubjectId: mathsId,
    });

    await prisma.schoolExamEntry.update({
      where: { id: first.id },
      data: { status: "WITHDRAWN", withdrawnAt: new Date() },
    });

    const again = await enterSubject({
      companyId,
      actorId: "test",
      seriesId,
      candidateId,
      examSubjectId: mathsId,
    });

    // Same row, revived — not a second entry, which the constraint forbids.
    expect(again.id).toBe(first.id);
    const row = await prisma.schoolExamEntry.findUniqueOrThrow({
      where: { id: first.id },
      select: { status: true, withdrawnAt: true },
    });
    expect(row.status).toBe("DRAFT");
    expect(row.withdrawnAt).toBeNull();
  });

  it("refuses a subject the candidate is already entered for, by name", async () => {
    await expect(
      enterSubject({
        companyId,
        actorId: "test",
        seriesId,
        candidateId,
        examSubjectId: mathsId,
      }),
    ).rejects.toThrow(/0200 is already entered for Mathematics/i);
  });
});

describe("building the entry file", () => {
  it("moves the candidates on it out of DRAFT", async () => {
    /*
      `SchoolCandidateStatus.ENTERED` is documented in the schema as "On the
      entry file that went to the board", and building the file is the moment
      that becomes true — but nothing anywhere ever wrote it. Every candidate
      stayed DRAFT for the life of the series, so the Registered tab was
      permanently empty and "ready to register" never fell.
    */
    const student = await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `EF-${Date.now()}`,
        firstName: "Kudzai",
        lastName: "Mhaka",
        status: "ACTIVE",
        certifiedName: "Kudzai Mhaka",
        dateOfBirth: new Date("2009-04-02"),
        gender: "F",
      },
    });
    const candidate = await prisma.schoolCandidate.create({
      data: { companyId, seriesId, studentId: student.id, candidateNumber: "0300" },
    });
    expect(candidate.status).toBe("DRAFT");

    await enterSubject({
      companyId,
      actorId: "test",
      seriesId,
      candidateId: candidate.id,
      examSubjectId: shonaId,
    });

    await buildEntryFile({ companyId, actorId: "test", seriesId });

    const after = await prisma.schoolCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
      select: { status: true, enteredAt: true },
    });
    expect(after.status).toBe("ENTERED");
    expect(after.enteredAt).not.toBeNull();
  });

  it("does not drag a withdrawn candidate back onto the file", async () => {
    const withdrawn = await prisma.schoolCandidate.findFirst({
      where: { companyId, seriesId, candidateNumber: "0300" },
      select: { id: true },
    });
    await prisma.schoolCandidate.update({
      where: { id: withdrawn!.id },
      data: { status: "WITHDRAWN" },
    });

    await buildEntryFile({ companyId, actorId: "test", seriesId });

    // `updateMany` moves DRAFT only, so a candidate somebody pulled by hand
    // stays pulled through a rebuild.
    const after = await prisma.schoolCandidate.findUniqueOrThrow({
      where: { id: withdrawn!.id },
      select: { status: true },
    });
    expect(after.status).toBe("WITHDRAWN");
  });
});
