/**
 * MIGRATION WITNESS — `20260916140000_boarding_roll_call_sick_bay`.
 *
 * These tests exist to prove the *database* enforces what the application
 * believes, and they insert past the service layer on purpose. An application
 * check cannot survive two wardens at two desks pressing the same button on a
 * slow connection; a unique index can.
 *
 * Each test states the accident it is standing in the way of. If one of these
 * starts failing, the migration did not apply — not that the test is wrong.
 *
 * Prerequisites: DATABASE_URL_TEST pointing at a Postgres with migrations
 * applied. See `docs/_start-here/LOCAL_DEV.md`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

let companyId: string;
let hostelId: string;
let roomId: string;
let bedId: string;
let termId: string;
let yearId: string;
let userId: string;
let studentId: string;

const stamp = Date.now();

beforeAll(async () => {
  const company = await prisma.company.create({
    data: { name: `boarding-witness-${stamp}`, slug: `boarding-witness-${stamp}` },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      email: `warden-${stamp}@example.test`,
      name: "Mr T. Gwara",
      password: "not-a-real-hash",
      role: "WARDEN",
    },
  });
  userId = user.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: `Y${stamp}`,
      name: "2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });
  yearId = year.id;

  const term = await prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId: yearId,
      code: "T2",
      name: "Term 2",
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-08-01"),
      isActive: true,
    },
  });
  termId = term.id;

  const hostel = await prisma.schoolHostel.create({
    data: { companyId, code: `NYA${stamp}`, name: "Nyanga House", genderPolicy: "MALE" },
  });
  hostelId = hostel.id;

  const room = await prisma.schoolHostelRoom.create({
    data: { companyId, hostelId, code: "D1", isPrefectDorm: false, yearGroupIds: [] },
  });
  roomId = room.id;

  const bed = await prisma.schoolHostelBed.create({
    data: { companyId, hostelId, roomId, code: "04L", bay: 4, tier: "L" },
  });
  bedId = bed.id;

  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `W${stamp}`,
      firstName: "Tapiwa",
      lastName: "Moyo",
      gender: "M",
      status: "ACTIVE",
      isBoarding: true,
    },
  });
  studentId = student.id;
});

afterAll(async () => {
  // Users are not cascaded from Company, so they go first or the delete fails
  // on `User_companyId_fkey` and the tenant is left behind as litter.
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("the new columns exist and hold what the placer needs", () => {
  /**
   * The plan view draws a dormitory from bay and tier. Before this migration it
   * had to parse them out of `code`, so a school that typed "4-upper" instead
   * of "04U" got a silently misdrawn room.
   */
  it("stores a bed's bay and tier as data, not as a naming convention", async () => {
    const bed = await prisma.schoolHostelBed.findUniqueOrThrow({ where: { id: bedId } });
    expect(bed.bay).toBe(4);
    expect(bed.tier).toBe("L");
  });

  /** A broken bed with nowhere to say what is broken is a bed nobody chases. */
  it("stores why a bed is out of service", async () => {
    const updated = await prisma.schoolHostelBed.update({
      where: { id: bedId },
      data: { status: "OUT_OF_SERVICE", statusReason: "Bunk ladder broken · joiner Thursday" },
    });
    expect(updated.statusReason).toContain("joiner Thursday");
    await prisma.schoolHostelBed.update({
      where: { id: bedId },
      data: { status: "AVAILABLE", statusReason: null },
    });
  });

  it("defaults a pupil to not-a-prefect and a dormitory to not-for-prefects", async () => {
    const student = await prisma.schoolStudent.findUniqueOrThrow({ where: { id: studentId } });
    const room = await prisma.schoolHostelRoom.findUniqueOrThrow({ where: { id: roomId } });
    expect(student.isPrefect).toBe(false);
    expect(room.isPrefectDorm).toBe(false);
    expect(room.yearGroupIds).toEqual([]);
  });
});

describe("one register per house per night", () => {
  const night = new Date("2026-05-12T00:00:00.000Z");

  afterAll(async () => {
    await prisma.schoolRollCall.deleteMany({ where: { companyId } });
  });

  /**
   * THE ACCIDENT: two wardens open the roll call for the same house on the
   * same night, and the house ends up with two registers that disagree about
   * who was in the building. The application upserts on this key; the index is
   * what makes the upsert safe under a race.
   */
  it("refuses a second roll call for the same house, night and session", async () => {
    await prisma.schoolRollCall.create({
      data: { companyId, hostelId, termId, takenOn: night, session: "EVENING", takenById: userId },
    });

    await expect(
      prisma.schoolRollCall.create({
        data: {
          companyId,
          hostelId,
          termId,
          takenOn: night,
          session: "EVENING",
          takenById: userId,
        },
      }),
    ).rejects.toThrow(/Unique constraint/i);
  });

  /** Morning and evening are two counts of the same night, and both are real. */
  it("allows a morning count alongside the evening one", async () => {
    const morning = await prisma.schoolRollCall.create({
      data: { companyId, hostelId, termId, takenOn: night, session: "MORNING", takenById: userId },
    });
    expect(morning.session).toBe("MORNING");
  });
});

describe("a child appears once on a register", () => {
  let rollCallId: string;

  beforeAll(async () => {
    const rollCall = await prisma.schoolRollCall.create({
      data: {
        companyId,
        hostelId,
        termId,
        takenOn: new Date("2026-05-13T00:00:00.000Z"),
        session: "EVENING",
        takenById: userId,
      },
    });
    rollCallId = rollCall.id;
  });

  afterAll(async () => {
    await prisma.schoolRollCall.deleteMany({ where: { companyId } });
  });

  /**
   * THE ACCIDENT: a double-tap on a slow connection writes the same child
   * twice, and the register says both PRESENT and ABSENT for one pupil on one
   * night. There is no reading of that which is safe.
   */
  it("refuses the same pupil twice on one roll call", async () => {
    await prisma.schoolRollCallEntry.create({
      data: { companyId, rollCallId, studentId, bedId, status: "PRESENT" },
    });

    await expect(
      prisma.schoolRollCallEntry.create({
        data: { companyId, rollCallId, studentId, bedId, status: "ABSENT" },
      }),
    ).rejects.toThrow(/Unique constraint/i);
  });

  /**
   * An entry outlives the bed it refers to. A school that renumbers a dormitory
   * in the holidays must not lose last term's registers.
   */
  it("keeps the entry when its bed is deleted", async () => {
    const spare = await prisma.schoolHostelBed.create({
      data: { companyId, hostelId, roomId, code: `SP${stamp}`, bay: 9, tier: "U" },
    });
    const other = await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `W${stamp}b`,
        firstName: "Rudo",
        lastName: "Chirwa",
        gender: "F",
        status: "ACTIVE",
      },
    });
    const entry = await prisma.schoolRollCallEntry.create({
      data: { companyId, rollCallId, studentId: other.id, bedId: spare.id, status: "PRESENT" },
    });

    await prisma.schoolHostelBed.delete({ where: { id: spare.id } });

    const survivor = await prisma.schoolRollCallEntry.findUnique({ where: { id: entry.id } });
    expect(survivor).not.toBeNull();
    expect(survivor?.status).toBe("PRESENT");
  });
});

describe("the sick bay holds a boarder's own bed", () => {
  afterAll(async () => {
    await prisma.schoolSickBayAdmission.deleteMany({ where: { companyId } });
  });

  /**
   * THE WHOLE POINT of a separate admission record. If the sick bay were
   * modelled as another hostel, admitting a child would end their allocation
   * and the placer would hand their bed to somebody else while they are two
   * doors away with a temperature.
   */
  it("leaves the boarder's allocation ACTIVE while they are in the sick bay", async () => {
    const allocation = await prisma.schoolBoardingAllocation.create({
      data: {
        companyId,
        studentId,
        termId,
        hostelId,
        roomId,
        bedId,
        status: "ACTIVE",
        startDate: new Date("2026-05-01"),
      },
    });

    await prisma.schoolSickBayAdmission.create({
      data: {
        companyId,
        studentId,
        termId,
        reason: "Malaria — under observation",
        admittedById: userId,
      },
    });

    const held = await prisma.schoolBoardingAllocation.findUniqueOrThrow({
      where: { id: allocation.id },
    });
    expect(held.status).toBe("ACTIVE");
    expect(held.bedId).toBe(bedId);

    await prisma.schoolBoardingAllocation.delete({ where: { id: allocation.id } });
  });

  it("records a discharge without deleting the admission", async () => {
    const admission = await prisma.schoolSickBayAdmission.create({
      data: {
        companyId,
        studentId,
        termId,
        reason: "Twisted ankle",
        admittedById: userId,
      },
    });

    const discharged = await prisma.schoolSickBayAdmission.update({
      where: { id: admission.id },
      data: { dischargedAt: new Date(), dischargedTo: "Back to the house" },
    });

    expect(discharged.dischargedAt).not.toBeNull();
    expect(discharged.dischargedTo).toBe("Back to the house");
  });
});
