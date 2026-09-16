import { prisma } from "@/lib/prisma";

/**
 * How a child gets home.
 *
 * Three answers, in this order: a boarder is a boarder; otherwise an open bus
 * ridership for the term names the route; otherwise they are a day scholar who
 * makes their own way.
 *
 * It is a named helper rather than three lines in a component because the
 * detention register's whole argument rests on it. `The R2 leaves at 14:10 —
 * Panashe Zvobgo and Anesu Chirwa serve Saturday 12 September at 08:00 instead`
 * is only readable as a rule, rather than as an arbitrary exception, if the
 * reader can see that six of the twelve named are boarders for whom 14:00 costs
 * nothing, four are day pupils, and two are on a bus that leaves in seven
 * minutes. Derived in one place, the same way, wherever it is drawn.
 */

export type GetsHome =
  | { kind: "boarder"; label: "Boarder" }
  /** `Bus R2` — the route code, because that is what the school says out loud. */
  | { kind: "bus"; label: string; routeId: string; routeCode: string }
  | { kind: "day"; label: "Day" };

export function getsHomeFor(student: {
  isBoarding: boolean;
  transportRiderships?: Array<{
    endedAt: Date | null;
    termId: string;
    route: { id: string; code: string } | null;
  }>;
}, termId?: string): GetsHome {
  if (student.isBoarding) return { kind: "boarder", label: "Boarder" };
  const open = (student.transportRiderships ?? []).find(
    (ride) => ride.endedAt == null && (!termId || ride.termId === termId) && ride.route,
  );
  if (open?.route) {
    return {
      kind: "bus",
      label: `Bus ${open.route.code}`,
      routeId: open.route.id,
      routeCode: open.route.code,
    };
  }
  return { kind: "day", label: "Day" };
}

/** The shape `getsHomeFor` needs, for a caller composing its own query. */
export const GETS_HOME_SELECT = {
  isBoarding: true,
  transportRiderships: {
    where: { endedAt: null },
    select: { endedAt: true, termId: true, route: { select: { id: true, code: true } } },
  },
} as const;

/**
 * How a set of pupils get home, in one pass.
 *
 * The register draws twelve rows and the alert reads all of them, so this takes
 * the whole list rather than being called per row.
 */
export async function getsHomeForMany(args: {
  companyId: string;
  studentIds: string[];
  termId?: string;
}): Promise<Map<string, GetsHome>> {
  if (args.studentIds.length === 0) return new Map();
  const students = await prisma.schoolStudent.findMany({
    where: { companyId: args.companyId, id: { in: args.studentIds } },
    select: {
      id: true,
      isBoarding: true,
      transportRiderships: {
        where: { endedAt: null, ...(args.termId ? { termId: args.termId } : {}) },
        select: { endedAt: true, termId: true, route: { select: { id: true, code: true } } },
      },
    },
  });
  return new Map(students.map((student) => [student.id, getsHomeFor(student, args.termId)]));
}
