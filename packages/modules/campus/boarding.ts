import { prisma } from "@corelithzw/db/client";
import { capacityRefusal, genderRefusal } from "./boarding-rules";

export {
  capacityRefusal,
  genderRefusal,
  normaliseGender,
  type GenderPolicy,
} from "./boarding-rules";

/**
 * The columns named by a unique violation, or null when it is not one.
 *
 * Read from the *message* rather than from `meta.target`. Prisma 7 does not
 * populate `target` when the driver adapter raises the error — the columns
 * arrive as `Unique constraint failed on the fields: ("bedId")` in the message
 * and, more deeply, under `meta.driverAdapterError.cause.constraint.fields`.
 * Matching `meta.target` alone silently never fires, and every lost race
 * surfaces as a 500 instead of "that bed was taken a moment ago".
 */
function uniqueViolationTarget(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { code?: string; message?: string };
  if (candidate.code !== "P2002") return null;
  return candidate.message ?? "";
}

export class AllocationRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationRefusedError";
  }
}

/**
 * Whether a bed already has somebody in it, right now.
 *
 * "Live" means ACTIVE with no end date. A bed allocated last year and ended is
 * free; a bed allocated to somebody who leaves in November is taken until then.
 */
const LIVE = { status: "ACTIVE" as const, endDate: null };

/**
 * Put a child in a bed.
 *
 * Three rules, and the third is the one that matters:
 *
 * 1. The hostel's gender policy. A child with no gender recorded is refused
 *    from a single-sex hostel rather than waved through — one blank field
 *    should not be able to put a boy in a girls' dormitory.
 * 2. Capacity, on the hostel and on the room. Counted live rather than from a
 *    denormalised total, because a total is a number that drifts.
 * 3. The bed itself, which is a **partial unique index**, not a check here.
 *    The old route read "is this bed free" and then wrote, and between those
 *    two statements is where two wardens at two desks put two girls in the same
 *    bed. The check below exists to produce a sentence; the index is what makes
 *    it impossible.
 */
export async function allocateBed(input: {
  companyId: string;
  studentId: string;
  termId: string;
  hostelId: string;
  roomId?: string | null;
  bedId?: string | null;
  startDate?: Date;
  reason?: string | null;
}) {
  const [student, hostel, room, bed] = await Promise.all([
    prisma.schoolStudent.findFirst({
      where: { id: input.studentId, companyId: input.companyId },
      select: { id: true, firstName: true, lastName: true, gender: true },
    }),
    prisma.schoolHostel.findFirst({
      where: { id: input.hostelId, companyId: input.companyId },
      select: {
        id: true,
        name: true,
        genderPolicy: true,
        capacity: true,
        isActive: true,
      },
    }),
    input.roomId
      ? prisma.schoolHostelRoom.findFirst({
          where: { id: input.roomId, companyId: input.companyId },
          select: {
            id: true,
            code: true,
            hostelId: true,
            capacity: true,
            isActive: true,
          },
        })
      : Promise.resolve(null),
    input.bedId
      ? prisma.schoolHostelBed.findFirst({
          where: { id: input.bedId, companyId: input.companyId },
          select: {
            id: true,
            code: true,
            hostelId: true,
            roomId: true,
            isActive: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!student) throw new AllocationRefusedError("Student not found");
  if (!hostel) throw new AllocationRefusedError("Hostel not found");
  if (!hostel.isActive) {
    throw new AllocationRefusedError(`${hostel.name} is closed`);
  }
  if (input.roomId && !room) throw new AllocationRefusedError("Room not found");
  if (input.bedId && !bed) throw new AllocationRefusedError("Bed not found");
  if (room && room.hostelId !== hostel.id) {
    throw new AllocationRefusedError("That room is in a different hostel");
  }
  if (bed && bed.hostelId !== hostel.id) {
    throw new AllocationRefusedError("That bed is in a different hostel");
  }
  if (room && bed && bed.roomId !== room.id) {
    throw new AllocationRefusedError("That bed is in a different room");
  }
  if (room && !room.isActive) {
    throw new AllocationRefusedError(`Room ${room.code} is out of use`);
  }
  if (bed && !bed.isActive) {
    throw new AllocationRefusedError(`Bed ${bed.code} is out of use`);
  }

  const refusal = genderRefusal(hostel, student);
  if (refusal) throw new AllocationRefusedError(refusal);

  const roomId = input.roomId ?? bed?.roomId ?? null;

  const [hostelOccupied, roomOccupied] = await Promise.all([
    prisma.schoolBoardingAllocation.count({
      where: { companyId: input.companyId, hostelId: hostel.id, ...LIVE },
    }),
    roomId
      ? prisma.schoolBoardingAllocation.count({
          where: { companyId: input.companyId, roomId, ...LIVE },
        })
      : Promise.resolve(0),
  ]);

  const hostelFull = capacityRefusal(
    { kind: "hostel", name: hostel.name, capacity: hostel.capacity },
    hostelOccupied,
  );
  if (hostelFull) throw new AllocationRefusedError(hostelFull);

  if (room) {
    const roomFull = capacityRefusal(
      { kind: "room", name: `Room ${room.code}`, capacity: room.capacity },
      roomOccupied,
    );
    if (roomFull) throw new AllocationRefusedError(roomFull);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const allocation = await tx.schoolBoardingAllocation.create({
        data: {
          companyId: input.companyId,
          studentId: input.studentId,
          termId: input.termId,
          hostelId: hostel.id,
          roomId,
          bedId: bed?.id ?? null,
          status: "ACTIVE",
          startDate: input.startDate ?? new Date(),
          reason: input.reason ?? null,
        },
        select: { id: true, bedId: true, roomId: true, hostelId: true },
      });

      await tx.schoolStudent.update({
        where: { id: input.studentId },
        data: { isBoarding: true },
      });

      if (bed) {
        await tx.schoolHostelBed.update({
          where: { id: bed.id },
          data: { status: "OCCUPIED" },
        });
      }

      return allocation;
    });
  } catch (error) {
    // The index fired, which means somebody else got there between the check
    // above and this write. Say which race was lost rather than reporting a
    // constraint name.
    //
    // Matched on both the column list and the index name. Prisma reports
    // `meta.target` as a field list for indexes it knows from the schema, and
    // as the raw constraint name for a *partial* index it does not — both of
    // these are partial, so matching only one form leaves every race surfacing
    // as a 500.
    const target = uniqueViolationTarget(error);
    if (target) {
      if (target.includes("bedId") || target.includes("live_bed")) {
        throw new AllocationRefusedError(
          `Bed ${bed?.code ?? ""} was taken a moment ago — pick another`.trim(),
        );
      }
      if (target.includes("studentId") || target.includes("live_student_term")) {
        throw new AllocationRefusedError(
          `${student.firstName} ${student.lastName} already has a bed this term`,
        );
      }
    }
    throw error;
  }
}

/**
 * End an allocation, freeing the bed.
 *
 * `endDate` rather than a delete: where a child slept last term is a question
 * schools are asked, and the partial index only counts live rows, so an ended
 * allocation stops blocking the bed without disappearing.
 */
export async function endAllocation(input: {
  companyId: string;
  allocationId: string;
  endDate?: Date;
  reason?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const allocation = await tx.schoolBoardingAllocation.findFirst({
      where: { id: input.allocationId, companyId: input.companyId },
      select: { id: true, bedId: true, studentId: true },
    });
    if (!allocation) throw new AllocationRefusedError("Allocation not found");

    await tx.schoolBoardingAllocation.update({
      where: { id: allocation.id },
      data: {
        status: "ENDED",
        endDate: input.endDate ?? new Date(),
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });

    if (allocation.bedId) {
      await tx.schoolHostelBed.update({
        where: { id: allocation.bedId },
        data: { status: "AVAILABLE" },
      });
    }

    const stillBoarding = await tx.schoolBoardingAllocation.count({
      where: { companyId: input.companyId, studentId: allocation.studentId, ...LIVE },
    });
    if (stillBoarding === 0) {
      await tx.schoolStudent.update({
        where: { id: allocation.studentId },
        data: { isBoarding: false },
      });
    }

    return { id: allocation.id };
  });
}

/**
 * The bed board: every bed in a hostel and who is in it.
 *
 * Built from the beds outward rather than from the allocations, for the same
 * reason the attendance page is built from the class ladder: a list of
 * allocations cannot show you an empty bed, which is the only thing a warden
 * with a new boarder is looking for.
 */
export async function hostelOccupancy(input: {
  companyId: string;
  hostelId: string;
}) {
  const [hostel, beds, allocations] = await Promise.all([
    prisma.schoolHostel.findFirst({
      where: { id: input.hostelId, companyId: input.companyId },
      select: { id: true, code: true, name: true, genderPolicy: true, capacity: true },
    }),
    prisma.schoolHostelBed.findMany({
      where: { companyId: input.companyId, hostelId: input.hostelId, isActive: true },
      select: {
        id: true,
        code: true,
        room: { select: { id: true, code: true, floor: true, capacity: true } },
      },
      orderBy: [{ room: { code: "asc" } }, { code: "asc" }],
    }),
    prisma.schoolBoardingAllocation.findMany({
      where: { companyId: input.companyId, hostelId: input.hostelId, ...LIVE },
      select: {
        id: true,
        bedId: true,
        student: {
          select: {
            id: true,
            studentNo: true,
            firstName: true,
            lastName: true,
            gender: true,
          },
        },
      },
    }),
  ]);

  if (!hostel) throw new AllocationRefusedError("Hostel not found");

  const byBed = new Map(
    allocations.filter((row) => row.bedId).map((row) => [row.bedId as string, row]),
  );

  return {
    hostel,
    // An allocation to the hostel with no bed chosen is a real state and would
    // vanish if the board only walked the beds.
    unbedded: allocations.filter((row) => !row.bedId).map((row) => row.student),
    beds: beds.map((bed) => {
      const occupant = byBed.get(bed.id);
      return {
        id: bed.id,
        code: bed.code,
        room: bed.room,
        allocationId: occupant?.id ?? null,
        student: occupant?.student ?? null,
      };
    }),
  };
}
