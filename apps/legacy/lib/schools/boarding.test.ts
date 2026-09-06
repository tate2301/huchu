/**
 * Bed allocation.
 *
 * The gender and capacity rules are application checks, because what a warden
 * needs is the sentence. The rule that two people cannot be put in one bed is a
 * partial unique index, because a check cannot survive two wardens at two desks
 * — and the MIGRATION WITNESS tests insert past the service layer to prove it.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  allocateBed,
  AllocationRefusedError,
  capacityRefusal,
  endAllocation,
  genderRefusal,
  hostelOccupancy,
  normaliseGender,
} from "./boarding";

let companyId: string;
let termId: string;
let boysHostelId: string;
let mixedHostelId: string;
let roomId: string;
let bedOneId: string;
let bedTwoId: string;
let boyId: string;
let girlId: string;
let unknownId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

let counter = 0;
async function makeStudent(gender: string | null) {
  counter += 1;
  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `B${String(counter).padStart(4, "0")}`,
      firstName: `Child${counter}`,
      lastName: `Boarder${counter}`,
      gender,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return student.id;
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Boarding Test ${stamp}`, slug: `boarding-test-${stamp}` },
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

  const boys = await prisma.schoolHostel.create({
    data: {
      companyId,
      code: "BOYS",
      name: "Rhodes House",
      genderPolicy: "MALE",
      capacity: 2,
    },
  });
  boysHostelId = boys.id;
  const mixed = await prisma.schoolHostel.create({
    data: { companyId, code: "MIX", name: "Sanatorium annexe", genderPolicy: "MIXED" },
  });
  mixedHostelId = mixed.id;

  const room = await prisma.schoolHostelRoom.create({
    data: { companyId, hostelId: boysHostelId, code: "R1", capacity: 2 },
  });
  roomId = room.id;
  bedOneId = (
    await prisma.schoolHostelBed.create({
      data: { companyId, hostelId: boysHostelId, roomId, code: "B1" },
    })
  ).id;
  bedTwoId = (
    await prisma.schoolHostelBed.create({
      data: { companyId, hostelId: boysHostelId, roomId, code: "B2" },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.schoolBoardingAllocation.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });
  boyId = await makeStudent("M");
  girlId = await makeStudent("Female");
  unknownId = await makeStudent(null);
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("normaliseGender", () => {
  it("reads the shapes the column actually holds", () => {
    // The column has never been constrained. A comparison against "FEMALE"
    // alone would let a girl recorded as "F" into a boys' hostel.
    expect(normaliseGender("M")).toBe("MALE");
    expect(normaliseGender("male")).toBe("MALE");
    expect(normaliseGender(" Female ")).toBe("FEMALE");
    expect(normaliseGender("girl")).toBe("FEMALE");
    expect(normaliseGender("")).toBeNull();
    expect(normaliseGender("prefer not to say")).toBeNull();
  });
});

describe("genderRefusal", () => {
  const boys = { name: "Rhodes House", genderPolicy: "MALE" };

  it("lets the right child in", () => {
    expect(
      genderRefusal(boys, { firstName: "A", lastName: "B", gender: "M" }),
    ).toBeNull();
  });

  it("keeps the wrong child out", () => {
    expect(
      genderRefusal(boys, { firstName: "A", lastName: "B", gender: "F" }),
    ).toContain("boys only");
  });

  it("refuses a child with no gender recorded rather than waving them through", () => {
    // One blank field should not be able to put a boy in a girls' dormitory.
    // The fix takes a warden ten seconds; the failure lasts a term.
    const refusal = genderRefusal(boys, {
      firstName: "A",
      lastName: "B",
      gender: null,
    });
    expect(refusal).toContain("no gender recorded");
  });

  it("lets anybody into a mixed hostel", () => {
    expect(
      genderRefusal(
        { name: "Annexe", genderPolicy: "MIXED" },
        { firstName: "A", lastName: "B", gender: null },
      ),
    ).toBeNull();
  });
});

describe("capacityRefusal", () => {
  it("says nothing when a place has no stated capacity", () => {
    expect(
      capacityRefusal({ kind: "hostel", name: "X", capacity: null }, 500),
    ).toBeNull();
  });

  it("refuses at the limit, not past it", () => {
    expect(capacityRefusal({ kind: "room", name: "R1", capacity: 2 }, 1)).toBeNull();
    expect(capacityRefusal({ kind: "room", name: "R1", capacity: 2 }, 2)).toContain(
      "full",
    );
  });
});

describe("allocateBed", () => {
  it("puts a boy in a boys' hostel and marks him boarding", async () => {
    const allocation = await allocateBed({
      companyId,
      studentId: boyId,
      termId,
      hostelId: boysHostelId,
      bedId: bedOneId,
    });
    expect(allocation.bedId).toBe(bedOneId);

    const student = await prisma.schoolStudent.findUniqueOrThrow({
      where: { id: boyId },
    });
    expect(student.isBoarding).toBe(true);

    const bed = await prisma.schoolHostelBed.findUniqueOrThrow({
      where: { id: bedOneId },
    });
    expect(bed.status).toBe("OCCUPIED");
  });

  it("refuses a girl a place in the boys' hostel", async () => {
    await expect(
      allocateBed({
        companyId,
        studentId: girlId,
        termId,
        hostelId: boysHostelId,
        bedId: bedOneId,
      }),
    ).rejects.toThrow(/boys only/);
  });

  it("refuses a child with no gender recorded", async () => {
    await expect(
      allocateBed({
        companyId,
        studentId: unknownId,
        termId,
        hostelId: boysHostelId,
        bedId: bedOneId,
      }),
    ).rejects.toThrow(/no gender recorded/);
  });

  it("refuses once the hostel is full", async () => {
    const second = await makeStudent("M");
    const third = await makeStudent("M");
    await allocateBed({
      companyId,
      studentId: boyId,
      termId,
      hostelId: boysHostelId,
      bedId: bedOneId,
    });
    await allocateBed({
      companyId,
      studentId: second,
      termId,
      hostelId: boysHostelId,
      bedId: bedTwoId,
    });
    await expect(
      allocateBed({ companyId, studentId: third, termId, hostelId: boysHostelId }),
    ).rejects.toThrow(/full/);
  });

  it("refuses a bed somebody is already in, with a sentence", async () => {
    const second = await makeStudent("M");
    await allocateBed({
      companyId,
      studentId: boyId,
      termId,
      hostelId: boysHostelId,
      bedId: bedOneId,
    });
    await expect(
      allocateBed({
        companyId,
        studentId: second,
        termId,
        hostelId: boysHostelId,
        bedId: bedOneId,
      }),
    ).rejects.toThrow(AllocationRefusedError);
  });

  it("refuses a second bed for the same child in the same term", async () => {
    await allocateBed({
      companyId,
      studentId: boyId,
      termId,
      hostelId: boysHostelId,
      bedId: bedOneId,
    });
    await expect(
      allocateBed({
        companyId,
        studentId: boyId,
        termId,
        hostelId: boysHostelId,
        bedId: bedTwoId,
      }),
    ).rejects.toThrow(/already has a bed/);
  });

  it("refuses two live allocations for one bed — MIGRATION WITNESS", async () => {
    // Past the service layer, which is the point: the check in `allocateBed`
    // exists to produce a sentence, and the index is what makes the race
    // impossible.
    const second = await makeStudent("M");
    await prisma.schoolBoardingAllocation.create({
      data: {
        companyId,
        studentId: boyId,
        termId,
        hostelId: boysHostelId,
        roomId,
        bedId: bedOneId,
        status: "ACTIVE",
      },
    });
    await expect(
      prisma.schoolBoardingAllocation.create({
        data: {
          companyId,
          studentId: second,
          termId,
          hostelId: boysHostelId,
          roomId,
          bedId: bedOneId,
          status: "ACTIVE",
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses a hostel gender policy it does not understand — MIGRATION WITNESS", async () => {
    // 'Girls', 'girls' and 'FEMALES' each read differently to the allocation
    // check, and an unrecognised policy looks like no policy at all.
    await expect(
      prisma.schoolHostel.create({
        data: { companyId, code: "ODD", name: "Odd", genderPolicy: "Girls" },
      }),
    ).rejects.toThrow();
  });

  it("frees the bed for the next child once an allocation ends", async () => {
    const second = await makeStudent("M");
    const first = await allocateBed({
      companyId,
      studentId: boyId,
      termId,
      hostelId: boysHostelId,
      bedId: bedOneId,
    });
    await endAllocation({ companyId, allocationId: first.id });

    const allocation = await allocateBed({
      companyId,
      studentId: second,
      termId,
      hostelId: boysHostelId,
      bedId: bedOneId,
    });
    expect(allocation.bedId).toBe(bedOneId);

    // And the child who left is no longer marked as boarding.
    const student = await prisma.schoolStudent.findUniqueOrThrow({
      where: { id: boyId },
    });
    expect(student.isBoarding).toBe(false);
  });

  it("takes anybody into a mixed hostel with no capacity set", async () => {
    const allocation = await allocateBed({
      companyId,
      studentId: unknownId,
      termId,
      hostelId: mixedHostelId,
    });
    expect(allocation.hostelId).toBe(mixedHostelId);
  });
});

describe("hostelOccupancy", () => {
  it("shows the empty beds, which is what a warden opens it for", async () => {
    await allocateBed({
      companyId,
      studentId: boyId,
      termId,
      hostelId: boysHostelId,
      bedId: bedOneId,
    });

    const board = await hostelOccupancy({ companyId, hostelId: boysHostelId });
    expect(board.beds).toHaveLength(2);
    expect(board.beds.find((bed) => bed.code === "B1")?.student?.id).toBe(boyId);
    expect(board.beds.find((bed) => bed.code === "B2")?.student).toBeNull();
  });

  it("does not lose a child allocated to the hostel with no bed chosen", async () => {
    await allocateBed({
      companyId,
      studentId: boyId,
      termId,
      hostelId: boysHostelId,
    });
    const board = await hostelOccupancy({ companyId, hostelId: boysHostelId });
    expect(board.unbedded).toHaveLength(1);
  });
});
