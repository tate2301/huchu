import { prisma } from "@corelithzw/db/client";
import { resolveGradingScheme } from "./assessments";

/**
 * Moving a whole school up a year.
 *
 * The one operation in the pack where a single click changes every child's
 * record, so it is deliberately two steps: a plan somebody reads, and an apply
 * that takes the decisions back. The plan is computed and never stored — a
 * saved plan goes stale the moment a child is withdrawn, and a stale plan
 * applied in bulk is the worst outcome this story has.
 *
 * There is no new table. `SchoolEnrollment` already carries one row per student
 * per term with a unique index on exactly that, which is what makes applying
 * the same roll-up twice safe rather than doubling the school.
 */

export type RollUpAction = "PROMOTE" | "REPEAT" | "GRADUATE" | "TRANSFER" | "WITHDRAW";

export type RollUpPlanRow = {
  studentId: string;
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  fromClass: { id: string; code: string; name: string; level: number | null } | null;
  fromStream: { id: string; name: string } | null;
  proposed: RollUpAction;
  toClass: { id: string; code: string; name: string } | null;
  /** Why the plan proposes this, written for the head reading it. */
  reason: string;
  /** The term's average, where there is one. Null means nothing was marked. */
  termAverage: number | null;
  /** True when the average is below the pass mark and somebody should look. */
  flagged: boolean;
  /** Already has a row in the target term — applying again would change nothing. */
  alreadyRolled: boolean;
};

export type RollUpPlan = {
  fromTerm: { id: string; code: string; name: string };
  toTerm: { id: string; code: string; name: string };
  passMark: number;
  /**
   * Where the list of children came from. `enrolments` is the real answer;
   * `current-class` means the term has no enrolment rows and the roll was built
   * from where each child currently sits. The screen says which, because the
   * second is a weaker fact and somebody about to move six hundred records
   * should know that.
   */
  source: "enrolments" | "current-class";
  rows: RollUpPlanRow[];
  summary: Record<RollUpAction, number>;
};

/**
 * The class one level up, or null at the top of the school.
 *
 * The ladder is `SchoolClass.level`, which is the only ordering a school gives
 * us. Classes with no level cannot be promoted from, and the plan says so
 * rather than guessing — a school that has not filled the levels in gets a
 * screen full of "no ladder set" instead of six hundred children moved into
 * whichever class happened to sort first.
 */
export function nextClassInLadder(
  classes: { id: string; code: string; name: string; level: number | null }[],
  from: { level: number | null } | null,
) {
  if (!from || from.level === null) return null;
  const above = classes
    .filter((row) => row.level !== null && row.level > (from.level as number))
    .sort((a, b) => (a.level as number) - (b.level as number));
  return above[0] ?? null;
}

/**
 * What the roll-up would do, per child, without doing it.
 *
 * Everyone is proposed for promotion. Repeating is a decision a head makes
 * about a particular child, and a system that proposed it from a mark would be
 * making that decision quietly — so a child below the pass mark is *flagged*
 * with their average rather than moved into REPEAT.
 */
export async function planYearRollUp(input: {
  companyId: string;
  fromTermId: string;
  toTermId: string;
  classId?: string;
}): Promise<RollUpPlan> {
  const [fromTerm, toTerm] = await Promise.all([
    prisma.schoolTerm.findFirst({
      where: { id: input.fromTermId, companyId: input.companyId },
      select: { id: true, code: true, name: true },
    }),
    prisma.schoolTerm.findFirst({
      where: { id: input.toTermId, companyId: input.companyId },
      select: { id: true, code: true, name: true },
    }),
  ]);
  if (!fromTerm) throw new Error("The term to roll up from was not found");
  if (!toTerm) throw new Error("The term to roll up into was not found");
  if (fromTerm.id === toTerm.id) {
    throw new Error("Pick a different term to roll into — that is the same one");
  }

  const [classes, scheme] = await Promise.all([
    prisma.schoolClass.findMany({
      where: { companyId: input.companyId },
      select: { id: true, code: true, name: true, level: true },
    }),
    resolveGradingScheme(input.companyId),
  ]);

  const enrolments = await prisma.schoolEnrollment.findMany({
    where: {
      companyId: input.companyId,
      termId: input.fromTermId,
      status: "ACTIVE",
      ...(input.classId ? { classId: input.classId } : {}),
      student: { status: "ACTIVE" },
    },
    select: {
      studentId: true,
      student: {
        select: { id: true, studentNo: true, firstName: true, lastName: true },
      },
      class: { select: { id: true, code: true, name: true, level: true } },
      stream: { select: { id: true, name: true } },
    },
    orderBy: [
      { class: { level: "asc" } },
      { student: { lastName: "asc" } },
      { student: { firstName: "asc" } },
    ],
  });

  // A school that has been running without enrolment rows — every student
  // created directly with a `currentClassId`, which is how the seeded data and
  // any pre-existing tenant look — would otherwise be told there is nobody to
  // roll up, and would have no way to find out why. Fall back to where each
  // child currently sits, and say that is what happened.
  const roll =
    enrolments.length > 0
      ? enrolments
      : (
          await prisma.schoolStudent.findMany({
            where: {
              companyId: input.companyId,
              status: "ACTIVE",
              currentClassId: input.classId ?? { not: null },
            },
            select: {
              id: true,
              studentNo: true,
              firstName: true,
              lastName: true,
              currentClass: {
                select: { id: true, code: true, name: true, level: true },
              },
              currentStream: { select: { id: true, name: true } },
            },
            orderBy: [
              { currentClass: { level: "asc" } },
              { lastName: "asc" },
              { firstName: "asc" },
            ],
          })
        )
          .filter((student) => student.currentClass !== null)
          .map((student) => ({
            studentId: student.id,
            student: {
              id: student.id,
              studentNo: student.studentNo,
              firstName: student.firstName,
              lastName: student.lastName,
            },
            class: student.currentClass as {
              id: string;
              code: string;
              name: string;
              level: number | null;
            },
            stream: student.currentStream,
          }));

  const source: RollUpPlan["source"] =
    enrolments.length > 0 ? "enrolments" : "current-class";

  const studentIds = roll.map((row) => row.studentId);

  // Two queries rather than one per child: the term's marks, and whatever is
  // already sitting in the target term from a previous run.
  const [resultLines, existingTargetRows] = await Promise.all([
    prisma.schoolResultLine.findMany({
      where: {
        companyId: input.companyId,
        studentId: { in: studentIds },
        sheet: { termId: input.fromTermId },
      },
      select: { studentId: true, score: true },
    }),
    prisma.schoolEnrollment.findMany({
      where: {
        companyId: input.companyId,
        termId: input.toTermId,
        studentId: { in: studentIds },
      },
      select: { studentId: true },
    }),
  ]);

  const totals = new Map<string, { sum: number; count: number }>();
  for (const line of resultLines) {
    const entry = totals.get(line.studentId) ?? { sum: 0, count: 0 };
    entry.sum += line.score;
    entry.count += 1;
    totals.set(line.studentId, entry);
  }
  const alreadyThere = new Set(existingTargetRows.map((row) => row.studentId));

  const summary: Record<RollUpAction, number> = {
    PROMOTE: 0,
    REPEAT: 0,
    GRADUATE: 0,
    TRANSFER: 0,
    WITHDRAW: 0,
  };

  const rows: RollUpPlanRow[] = roll.map((enrolment) => {
    const next = nextClassInLadder(classes, enrolment.class);
    const totalsForStudent = totals.get(enrolment.studentId);
    const termAverage = totalsForStudent
      ? Math.round((totalsForStudent.sum / totalsForStudent.count) * 100) / 100
      : null;

    let proposed: RollUpAction;
    let reason: string;

    if (enrolment.class.level === null) {
      proposed = "REPEAT";
      reason = `${enrolment.class.name} has no level set, so there is no ladder to move up`;
    } else if (!next) {
      proposed = "GRADUATE";
      reason = `${enrolment.class.name} is the top of the school`;
    } else {
      proposed = "PROMOTE";
      reason = `${enrolment.class.name} → ${next.name}`;
    }

    summary[proposed] += 1;

    return {
      studentId: enrolment.studentId,
      student: enrolment.student,
      fromClass: enrolment.class,
      fromStream: enrolment.stream,
      proposed,
      toClass: proposed === "PROMOTE" ? next : proposed === "REPEAT" ? enrolment.class : null,
      reason,
      termAverage,
      flagged: termAverage !== null && termAverage < scheme.passMark,
      alreadyRolled: alreadyThere.has(enrolment.studentId),
    };
  });

  return { fromTerm, toTerm, passMark: scheme.passMark, source, rows, summary };
}

export type RollUpDecision = {
  studentId: string;
  action: RollUpAction;
  /** Required for PROMOTE, REPEAT and TRANSFER. */
  toClassId?: string | null;
  toStreamId?: string | null;
};

export type RollUpResult = {
  promoted: number;
  repeated: number;
  graduated: number;
  transferred: number;
  withdrawn: number;
  skipped: number;
  problems: string[];
};

/**
 * Apply the decisions. One transaction, and safe to run twice.
 *
 * Safe twice because `SchoolEnrollment` is unique on company, student and term:
 * a second run finds the row already there and counts it as skipped rather than
 * doubling the school. That is the property that matters most here — the
 * failure mode of a bulk operation is somebody clicking it again because the
 * first click looked like it did nothing.
 *
 * The previous term's enrolment is closed rather than left open, so "who is in
 * Form 2 this term" has one answer.
 */
export async function applyYearRollUp(input: {
  companyId: string;
  fromTermId: string;
  toTermId: string;
  decisions: RollUpDecision[];
  actorUserId?: string | null;
}): Promise<RollUpResult> {
  const result: RollUpResult = {
    promoted: 0,
    repeated: 0,
    graduated: 0,
    transferred: 0,
    withdrawn: 0,
    skipped: 0,
    problems: [],
  };

  return prisma.$transaction(async (tx) => {
    const existing = await tx.schoolEnrollment.findMany({
      where: {
        companyId: input.companyId,
        termId: input.toTermId,
        studentId: { in: input.decisions.map((decision) => decision.studentId) },
      },
      select: { studentId: true },
    });
    const alreadyThere = new Set(existing.map((row) => row.studentId));

    for (const decision of input.decisions) {
      if (alreadyThere.has(decision.studentId)) {
        result.skipped += 1;
        continue;
      }

      if (decision.action === "GRADUATE" || decision.action === "WITHDRAW") {
        await tx.schoolStudent.update({
          where: { id: decision.studentId },
          data: {
            status: decision.action === "GRADUATE" ? "GRADUATED" : "WITHDRAWN",
            currentClassId: null,
            currentStreamId: null,
          },
        });
        await tx.schoolEnrollment.updateMany({
          where: {
            companyId: input.companyId,
            studentId: decision.studentId,
            termId: input.fromTermId,
          },
          data: {
            status: decision.action === "GRADUATE" ? "COMPLETED" : "WITHDRAWN",
            endedAt: new Date(),
          },
        });
        if (decision.action === "GRADUATE") result.graduated += 1;
        else result.withdrawn += 1;
        continue;
      }

      if (!decision.toClassId) {
        result.problems.push(
          `${decision.studentId} has no year group to move into and was left alone`,
        );
        continue;
      }

      await tx.schoolEnrollment.create({
        data: {
          companyId: input.companyId,
          studentId: decision.studentId,
          termId: input.toTermId,
          classId: decision.toClassId,
          streamId: decision.toStreamId ?? null,
          status: "ACTIVE",
        },
      });

      await tx.schoolEnrollment.updateMany({
        where: {
          companyId: input.companyId,
          studentId: decision.studentId,
          termId: input.fromTermId,
          status: "ACTIVE",
        },
        data: {
          status: decision.action === "TRANSFER" ? "TRANSFERRED" : "COMPLETED",
          endedAt: new Date(),
        },
      });

      await tx.schoolStudent.update({
        where: { id: decision.studentId },
        data: {
          currentClassId: decision.toClassId,
          currentStreamId: decision.toStreamId ?? null,
        },
      });

      if (decision.action === "PROMOTE") result.promoted += 1;
      else if (decision.action === "REPEAT") result.repeated += 1;
      else result.transferred += 1;
    }

    return result;
  });
}
