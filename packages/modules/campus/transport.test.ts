/**
 * Transport: routes, riders and the driver's register.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  addRider,
  boardingRegister,
  endRidership,
  formatStopMinute,
  markBoardings,
  transportBilling,
  TransportError,
} from "./transport";

let companyId: string;
let termId: string;
let classId: string;
let routeId: string;
let smallRouteId: string;
let stopOneId: string;
let stopTwoId: string;
let studentAId: string;
let studentBId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

let counter = 0;
async function makeStudent() {
  counter += 1;
  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `T${String(counter).padStart(4, "0")}`,
      firstName: `Rider${counter}`,
      lastName: `Bus${counter}`,
      status: "ACTIVE",
      currentClassId: classId,
    },
    select: { id: true },
  });
  return student.id;
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Transport Test ${stamp}`, slug: `transport-test-${stamp}` },
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
  termId = (
    await prisma.schoolTerm.create({
      data: {
        companyId,
        academicYearId: year.id,
        code: "T1",
        name: "Term 1",
        startDate: date("2026-01-08"),
        endDate: date("2026-04-10"),
        isActive: true,
      },
    })
  ).id;
  classId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "F1", name: "Form 1", level: 1 },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.schoolTransportBoarding.deleteMany({ where: { companyId } });
  await prisma.schoolTransportRider.deleteMany({ where: { companyId } });
  await prisma.schoolTransportStop.deleteMany({ where: { companyId } });
  await prisma.schoolTransportRoute.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });

  routeId = (
    await prisma.schoolTransportRoute.create({
      data: {
        companyId,
        code: "R1",
        name: "Borrowdale",
        capacity: 40,
        termFee: 120,
        driverName: "Mr Sibanda",
      },
    })
  ).id;
  smallRouteId = (
    await prisma.schoolTransportRoute.create({
      data: { companyId, code: "R2", name: "Chitungwiza", capacity: 1 },
    })
  ).id;

  stopOneId = (
    await prisma.schoolTransportStop.create({
      data: {
        companyId,
        routeId,
        name: "Sam Levy's",
        sequence: 1,
        pickupMinute: 6 * 60 + 30,
      },
    })
  ).id;
  stopTwoId = (
    await prisma.schoolTransportStop.create({
      data: { companyId, routeId, name: "Chisipite shops", sequence: 2 },
    })
  ).id;

  studentAId = await makeStudent();
  studentBId = await makeStudent();
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("formatStopMinute", () => {
  it("reads as a wall clock", () => {
    expect(formatStopMinute(6 * 60 + 30)).toBe("06:30");
    expect(formatStopMinute(null)).toBeNull();
  });
});

describe("addRider", () => {
  it("puts a child on a route at a stop", async () => {
    const rider = await addRider({
      companyId,
      routeId,
      studentId: studentAId,
      termId,
      stopId: stopOneId,
    });
    expect(rider.stopId).toBe(stopOneId);
  });

  it("refuses a stop that belongs to another route", async () => {
    await expect(
      addRider({
        companyId,
        routeId: smallRouteId,
        studentId: studentAId,
        termId,
        stopId: stopOneId,
      }),
    ).rejects.toThrow(/different route/);
  });

  it("refuses when the bus is full, with the numbers", async () => {
    // "Route 3 is full, 1 of 1" is actionable; "capacity exceeded" is not.
    await addRider({ companyId, routeId: smallRouteId, studentId: studentAId, termId });
    await expect(
      addRider({ companyId, routeId: smallRouteId, studentId: studentBId, termId }),
    ).rejects.toThrow(/full — 1 of 1/);
  });

  it("refuses a child already on a bus this term", async () => {
    await addRider({ companyId, routeId, studentId: studentAId, termId });
    await expect(
      addRider({ companyId, routeId: smallRouteId, studentId: studentAId, termId }),
    ).rejects.toThrow(/already on a bus/);
  });

  it("refuses two live riderships for one child — MIGRATION WITNESS", async () => {
    await prisma.schoolTransportRider.create({
      data: { companyId, routeId, studentId: studentAId, termId },
    });
    await expect(
      prisma.schoolTransportRider.create({
        data: { companyId, routeId: smallRouteId, studentId: studentAId, termId },
      }),
    ).rejects.toThrow();
  });

  it("lets a child back on once their old ridership has ended", async () => {
    const rider = await addRider({ companyId, routeId, studentId: studentAId, termId });
    await endRidership({ companyId, riderId: rider.id });
    const again = await addRider({
      companyId,
      routeId: smallRouteId,
      studentId: studentAId,
      termId,
    });
    expect(again.routeId).toBe(smallRouteId);
  });

  it("refuses two stops in the same position — MIGRATION WITNESS", async () => {
    // Without this the order is whatever the database returns, and a driver's
    // list is not a route.
    await expect(
      prisma.schoolTransportStop.create({
        data: { companyId, routeId, name: "Duplicate", sequence: 1 },
      }),
    ).rejects.toThrow();
  });

  it("refuses a pick-up time outside the day — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolTransportStop.create({
        data: { companyId, routeId, name: "Impossible", sequence: 9, pickupMinute: 2000 },
      }),
    ).rejects.toThrow();
  });
});

describe("boardingRegister", () => {
  it("lists every rider in stop order, marked or not", async () => {
    // Built from the riders outward: a child who has not got on is a row, which
    // is the only reason anybody reads it before pulling away.
    await addRider({
      companyId,
      routeId,
      studentId: studentAId,
      termId,
      stopId: stopTwoId,
    });
    await addRider({
      companyId,
      routeId,
      studentId: studentBId,
      termId,
      stopId: stopOneId,
    });

    const register = await boardingRegister({
      companyId,
      routeId,
      termId,
      onDate: date("2026-03-03"),
      direction: "MORNING",
    });
    expect(register.rows).toHaveLength(2);
    expect(register.rows[0].stop?.sequence).toBe(1);
    expect(register.summary).toEqual({ expected: 2, on: 0, notOn: 0, unmarked: 2 });
  });

  it("counts who got on once the register is marked", async () => {
    const first = await addRider({
      companyId,
      routeId,
      studentId: studentAId,
      termId,
    });
    const second = await addRider({
      companyId,
      routeId,
      studentId: studentBId,
      termId,
    });

    await markBoardings({
      companyId,
      onDate: date("2026-03-03"),
      direction: "MORNING",
      entries: [
        { riderId: first.id, boarded: true },
        { riderId: second.id, boarded: false },
      ],
    });

    const register = await boardingRegister({
      companyId,
      routeId,
      termId,
      onDate: date("2026-03-03"),
      direction: "MORNING",
    });
    expect(register.summary).toEqual({ expected: 2, on: 1, notOn: 1, unmarked: 0 });
  });

  it("keeps the morning and the afternoon apart", async () => {
    const rider = await addRider({ companyId, routeId, studentId: studentAId, termId });
    await markBoardings({
      companyId,
      onDate: date("2026-03-03"),
      direction: "MORNING",
      entries: [{ riderId: rider.id, boarded: true }],
    });

    const afternoon = await boardingRegister({
      companyId,
      routeId,
      termId,
      onDate: date("2026-03-03"),
      direction: "AFTERNOON",
    });
    expect(afternoon.summary.unmarked).toBe(1);
  });

  it("corrects a mark rather than adding a second one", async () => {
    const rider = await addRider({ companyId, routeId, studentId: studentAId, termId });
    for (const boarded of [true, false]) {
      await markBoardings({
        companyId,
        onDate: date("2026-03-03"),
        direction: "MORNING",
        entries: [{ riderId: rider.id, boarded }],
      });
    }
    expect(
      await prisma.schoolTransportBoarding.count({ where: { riderId: rider.id } }),
    ).toBe(1);
  });

  it("refuses two answers for one journey — MIGRATION WITNESS", async () => {
    const rider = await addRider({ companyId, routeId, studentId: studentAId, termId });
    const data = {
      companyId,
      riderId: rider.id,
      onDate: date("2026-03-03"),
      direction: "MORNING" as const,
    };
    await prisma.schoolTransportBoarding.create({ data });
    await expect(
      prisma.schoolTransportBoarding.create({ data }),
    ).rejects.toThrow();
  });
});

describe("transportBilling", () => {
  it("reports what is due rather than posting it", async () => {
    // Turning this into invoice lines belongs with the fee run. A transport
    // module that silently created charges is one nobody can reconcile.
    await addRider({ companyId, routeId, studentId: studentAId, termId });
    await addRider({ companyId, routeId, studentId: studentBId, termId });

    const billing = await transportBilling({ companyId, termId });
    const borrowdale = billing.find((row) => row.route.code === "R1");
    expect(borrowdale?.riders).toBe(2);
    expect(borrowdale?.due).toBe(240);
  });

  it("leaves out riders already billed", async () => {
    const rider = await addRider({ companyId, routeId, studentId: studentAId, termId });
    await prisma.schoolTransportRider.update({
      where: { id: rider.id },
      data: { feeInvoiceId: "some-invoice" },
    });

    const billing = await transportBilling({ companyId, termId });
    const borrowdale = billing.find((row) => row.route.code === "R1");
    expect(borrowdale?.unbilled).toBe(0);
    expect(borrowdale?.due).toBe(0);
  });
});

describe("endRidership", () => {
  it("refuses to end a ridership twice", async () => {
    const rider = await addRider({ companyId, routeId, studentId: studentAId, termId });
    await endRidership({ companyId, riderId: rider.id });
    await expect(endRidership({ companyId, riderId: rider.id })).rejects.toThrow(
      TransportError,
    );
  });
});
