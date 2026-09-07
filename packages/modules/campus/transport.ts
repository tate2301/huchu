import { prisma } from "@corelithzw/db/client";

/**
 * Routes, stops, riders and the register the driver keeps.
 *
 * A rider is entitled to ride; a boarding says they got on. Two different
 * facts, and the second is the one a parent rings about at four o'clock, so it
 * has its own row and its own register.
 */

export class TransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportError";
  }
}

export type TransportDirection = "MORNING" | "AFTERNOON";

/** `07:20` from minutes-from-midnight, the same convention as the periods. */
export function formatStopMinute(minute: number | null) {
  if (minute === null) return null;
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Put a child on a route.
 *
 * Capacity is counted live rather than stored, and the seat limit is a refusal
 * with a number in it — "Route 3 is full, 44 of 44" is something a transport
 * officer can act on, where "capacity exceeded" is not.
 */
export async function addRider(input: {
  companyId: string;
  routeId: string;
  studentId: string;
  termId: string;
  stopId?: string | null;
}) {
  const [route, student] = await Promise.all([
    prisma.schoolTransportRoute.findFirst({
      where: { id: input.routeId, companyId: input.companyId },
      select: { id: true, name: true, capacity: true, isActive: true },
    }),
    prisma.schoolStudent.findFirst({
      where: { id: input.studentId, companyId: input.companyId },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  if (!route) throw new TransportError("Route not found");
  if (!route.isActive) throw new TransportError(`${route.name} is not running`);
  if (!student) throw new TransportError("Student not found");

  if (input.stopId) {
    const stop = await prisma.schoolTransportStop.findFirst({
      where: { id: input.stopId, companyId: input.companyId },
      select: { routeId: true },
    });
    if (!stop) throw new TransportError("Stop not found");
    if (stop.routeId !== route.id) {
      throw new TransportError("That stop is on a different route");
    }
  }

  if (route.capacity !== null) {
    const riding = await prisma.schoolTransportRider.count({
      where: {
        companyId: input.companyId,
        routeId: route.id,
        termId: input.termId,
        endedAt: null,
      },
    });
    if (riding >= route.capacity) {
      throw new TransportError(
        `${route.name} is full — ${riding} of ${route.capacity} seats taken`,
      );
    }
  }

  try {
    return await prisma.schoolTransportRider.create({
      data: {
        companyId: input.companyId,
        routeId: route.id,
        stopId: input.stopId ?? null,
        studentId: student.id,
        termId: input.termId,
      },
      select: { id: true, routeId: true, stopId: true },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new TransportError(
        `${student.firstName} ${student.lastName} is already on a bus this term`,
      );
    }
    throw error;
  }
}

/** Take a child off the bus for the rest of the term. */
export async function endRidership(input: { companyId: string; riderId: string }) {
  const rider = await prisma.schoolTransportRider.findFirst({
    where: { id: input.riderId, companyId: input.companyId },
    select: { id: true, endedAt: true },
  });
  if (!rider) throw new TransportError("Rider not found");
  if (rider.endedAt) throw new TransportError("That child is already off the route");

  return prisma.schoolTransportRider.update({
    where: { id: rider.id },
    data: { endedAt: new Date() },
    select: { id: true, endedAt: true },
  });
}

/**
 * The driver's register for one route, one morning or afternoon.
 *
 * Built from the riders outward — a child who has not got on is a row saying so,
 * which is the only reason anybody looks at it before pulling away. Same rule
 * as the class register, the bed board and the welfare list.
 */
export async function boardingRegister(input: {
  companyId: string;
  routeId: string;
  termId: string;
  onDate: Date;
  direction: TransportDirection;
}) {
  const onDate = new Date(
    Date.UTC(
      input.onDate.getUTCFullYear(),
      input.onDate.getUTCMonth(),
      input.onDate.getUTCDate(),
    ),
  );

  const [route, riders] = await Promise.all([
    prisma.schoolTransportRoute.findFirst({
      where: { id: input.routeId, companyId: input.companyId },
      select: {
        id: true,
        code: true,
        name: true,
        driverName: true,
        vehicleReg: true,
        capacity: true,
      },
    }),
    prisma.schoolTransportRider.findMany({
      where: {
        companyId: input.companyId,
        routeId: input.routeId,
        termId: input.termId,
        endedAt: null,
      },
      select: {
        id: true,
        student: {
          select: {
            id: true,
            studentNo: true,
            firstName: true,
            lastName: true,
            currentClass: { select: { id: true, name: true } },
          },
        },
        stop: { select: { id: true, name: true, sequence: true, pickupMinute: true } },
        boardings: {
          where: { onDate, direction: input.direction },
          select: { id: true, boarded: true },
        },
      },
      // Stop order, then surname: the driver works down the route, not down an
      // alphabet.
      orderBy: [
        { stop: { sequence: "asc" } },
        { student: { lastName: "asc" } },
        { student: { firstName: "asc" } },
      ],
    }),
  ]);

  if (!route) throw new TransportError("Route not found");

  const rows = riders.map((rider) => ({
    riderId: rider.id,
    student: rider.student,
    stop: rider.stop,
    boarding: rider.boardings[0] ?? null,
  }));

  return {
    route,
    onDate,
    direction: input.direction,
    rows,
    summary: {
      expected: rows.length,
      on: rows.filter((row) => row.boarding?.boarded === true).length,
      notOn: rows.filter((row) => row.boarding?.boarded === false).length,
      unmarked: rows.filter((row) => row.boarding === null).length,
    },
  };
}

/**
 * Mark the register.
 *
 * One call for the whole bus, the same shape as the class register and the mark
 * sheet: a driver marks once and drives, and one write per child turns a lost
 * signal into a half-marked register.
 */
export async function markBoardings(input: {
  companyId: string;
  onDate: Date;
  direction: TransportDirection;
  entries: { riderId: string; boarded: boolean }[];
  recordedById?: string | null;
}) {
  const onDate = new Date(
    Date.UTC(
      input.onDate.getUTCFullYear(),
      input.onDate.getUTCMonth(),
      input.onDate.getUTCDate(),
    ),
  );

  return prisma.$transaction(
    input.entries.map((entry) =>
      prisma.schoolTransportBoarding.upsert({
        where: {
          companyId_riderId_onDate_direction: {
            companyId: input.companyId,
            riderId: entry.riderId,
            onDate,
            direction: input.direction,
          },
        },
        create: {
          companyId: input.companyId,
          riderId: entry.riderId,
          onDate,
          direction: input.direction,
          boarded: entry.boarded,
          recordedById: input.recordedById ?? null,
        },
        update: { boarded: entry.boarded, recordedById: input.recordedById ?? null },
      }),
    ),
  );
}

/**
 * What each route should be billed for this term.
 *
 * Reported rather than posted. Turning this into invoice lines belongs with the
 * fee run in Iteration 2, and a transport module that silently created charges
 * would be one nobody could reconcile.
 */
export async function transportBilling(input: { companyId: string; termId: string }) {
  const routes = await prisma.schoolTransportRoute.findMany({
    where: { companyId: input.companyId, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      termFee: true,
      capacity: true,
      riders: {
        where: { termId: input.termId, endedAt: null },
        select: {
          id: true,
          feeInvoiceId: true,
          student: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  return routes.map((route) => {
    const fee = route.termFee === null ? 0 : Number(route.termFee);
    const unbilled = route.riders.filter((rider) => !rider.feeInvoiceId);
    return {
      route: {
        id: route.id,
        code: route.code,
        name: route.name,
        termFee: fee,
        capacity: route.capacity,
      },
      riders: route.riders.length,
      unbilled: unbilled.length,
      due: Math.round(unbilled.length * fee * 100) / 100,
    };
  });
}
