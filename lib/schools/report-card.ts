import { prisma } from "@/lib/prisma";

/**
 * The four things a Zimbabwean report card says that the marks alone do not.
 *
 * A card that lists subjects, scores and grades is a mark sheet with a name on
 * it. What a parent in Harare opens the envelope to find is where the child
 * came in the class, how that compares with what the class did, how many days
 * they were actually in school, and what their conduct was. Those four are the
 * report; the subject table is its evidence.
 *
 * All of it is computed from data the product already holds — published result
 * lines, submitted registers, merit entries — so none of this asks a teacher to
 * type anything they are not already typing.
 */

/** Standard competition ranking: two pupils tied on 72.4 are both 3rd, and the next is 5th. */
export type ClassPosition = {
  average: number;
  position: number;
  of: number;
};

/**
 * Where every pupil in a teaching group came, by mean mark across their own
 * subjects.
 *
 * ## Why the group is class *and* stream
 *
 * A result sheet is written per class and stream, and 4 Blue and 4 Gold sit
 * different papers with different teachers. Positioning a pupil against a
 * stream they are not taught with is a number that means nothing, so the
 * grouping here is the same one the sheet already uses. A school that does not
 * stream has `streamId` null throughout and the group is the class.
 *
 * ## Why the mean is over the pupil's own subjects
 *
 * Pupils in the same class do not all sit the same number of subjects once
 * electives are in play. Dividing each pupil's total by *their* subject count
 * rather than by the class's maximum is what stops a child who takes seven
 * subjects being ranked below one who takes five.
 */
export async function classPositions(args: {
  companyId: string;
  termId: string;
  classId: string;
  streamId: string | null;
}): Promise<Map<string, ClassPosition>> {
  const lines = await prisma.schoolResultLine.findMany({
    where: {
      companyId: args.companyId,
      sheet: {
        termId: args.termId,
        classId: args.classId,
        streamId: args.streamId,
        status: "PUBLISHED",
      },
    },
    select: { studentId: true, score: true },
  });

  const totals = new Map<string, { sum: number; count: number }>();
  for (const line of lines) {
    const entry = totals.get(line.studentId) ?? { sum: 0, count: 0 };
    entry.sum += line.score;
    entry.count += 1;
    totals.set(line.studentId, entry);
  }

  const ranked = [...totals.entries()]
    .map(([studentId, { sum, count }]) => ({ studentId, average: sum / count }))
    .sort((a, b) => b.average - a.average);

  const positions = new Map<string, ClassPosition>();
  let lastAverage: number | null = null;
  let lastPosition = 0;

  ranked.forEach((row, index) => {
    // Round before comparing: 72.349999 and 72.35 are the same mark on a card
    // that prints one decimal place, and a card that shows two pupils on 72.3
    // in different positions is a card the office has to explain.
    const shown = Math.round(row.average * 10) / 10;
    const position = shown === lastAverage ? lastPosition : index + 1;
    lastAverage = shown;
    lastPosition = position;
    positions.set(row.studentId, { average: row.average, position, of: ranked.length });
  });

  return positions;
}

/** The teaching group's mean mark per subject, so a 58 can be read against it. */
export async function subjectClassAverages(args: {
  companyId: string;
  termId: string;
  classId: string;
  streamId: string | null;
}): Promise<Map<string, number>> {
  const grouped = await prisma.schoolResultLine.groupBy({
    by: ["subjectCode"],
    where: {
      companyId: args.companyId,
      sheet: {
        termId: args.termId,
        classId: args.classId,
        streamId: args.streamId,
        status: "PUBLISHED",
      },
    },
    _avg: { score: true },
  });

  const averages = new Map<string, number>();
  for (const row of grouped) {
    if (row._avg.score != null) averages.set(row.subjectCode, row._avg.score);
  }
  return averages;
}

export type TermAttendance = {
  /** Registers actually taken for this pupil's group — the denominator. */
  marked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** Present or late, over marked. Null when no register was ever submitted. */
  rate: number | null;
};

/**
 * Days in school this term.
 *
 * Counted over SUBMITTED and LOCKED registers only. A register still in DRAFT
 * is a teacher's working copy that the office has not accepted, and counting it
 * would let an unfinished morning move a number a parent is about to read.
 *
 * The denominator is registers taken, not days in the term: a school that did
 * not mark a register on a Tuesday has no evidence about that Tuesday, and
 * treating silence as attendance or as absence both invent a fact.
 */
export async function termAttendance(args: {
  companyId: string;
  termId: string;
  studentId: string;
}): Promise<TermAttendance> {
  const lines = await prisma.schoolAttendanceSessionLine.findMany({
    where: {
      companyId: args.companyId,
      studentId: args.studentId,
      session: { termId: args.termId, status: { in: ["SUBMITTED", "LOCKED"] } },
    },
    select: { status: true },
  });

  const tally = { marked: lines.length, present: 0, absent: 0, late: 0, excused: 0 };
  for (const line of lines) {
    if (line.status === "PRESENT") tally.present += 1;
    else if (line.status === "ABSENT") tally.absent += 1;
    else if (line.status === "LATE") tally.late += 1;
    else if (line.status === "EXCUSED") tally.excused += 1;
  }

  return {
    ...tally,
    rate: tally.marked === 0 ? null : (tally.present + tally.late) / tally.marked,
  };
}

export type TermConduct = {
  merits: number;
  demerits: number;
  meritPoints: number;
  demeritPoints: number;
};

/**
 * Merits and demerits this term, counted as occasions *and* as points.
 *
 * Both, because they answer different questions and a card that prints one
 * labelled as the other is worse than a card that prints neither. "Three
 * demerits" is a pattern of behaviour; "twelve demerit points" is its weight.
 *
 * Reversed entries are excluded. A merit the school took back is not a merit,
 * and a card is exactly the wrong place to relitigate one.
 */
export async function termConduct(args: {
  companyId: string;
  termId: string;
  studentId: string;
}): Promise<TermConduct> {
  const entries = await prisma.schoolMeritEntry.findMany({
    where: {
      companyId: args.companyId,
      studentId: args.studentId,
      termId: args.termId,
      reversedAt: null,
    },
    select: { kind: true, points: true },
  });

  const tally = { merits: 0, demerits: 0, meritPoints: 0, demeritPoints: 0 };
  for (const entry of entries) {
    if (entry.kind === "MERIT") {
      tally.merits += 1;
      tally.meritPoints += entry.points;
    } else {
      tally.demerits += 1;
      tally.demeritPoints += entry.points;
    }
  }
  return tally;
}

/** "5 of 42" — the phrase a Zimbabwean card prints, with the ordinal a parent reads. */
export function positionLabel(position: ClassPosition | undefined): string {
  if (!position) return "—";
  return `${ordinal(position.position)} of ${position.of}`;
}

function ordinal(n: number): string {
  // 11th, 12th and 13th are the exceptions the naive rule gets wrong.
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
