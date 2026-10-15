import { prisma } from "@/lib/prisma";
import { VANE_ACTIONS } from "@/lib/vane/actions/registry";

/**
 * Remind families (the PageVaneSchool board): the fee reminder Vane drafted
 * as a `schools.fees.remind` action (`lib/vane/actions/schools.ts`), read for
 * the page. The words are the school's, with [family], [pupil] and [amount]
 * for each to read their own; the person changes them and unticks families
 * here, then Send approves the action, which sends each family its own notice
 * in the parents' portal as them.
 */

export type ReminderFamily = {
  studentId: string;
  /** "The Moyo family". */
  family: string;
  /** "Rumbidzai, Form 3B". */
  pupil: string;
  /** What Vane read the family owes on this term's fees. */
  owed: number;
  /** How it reaches them: "Portal", or why it cannot. */
  goesBy: string;
  reachable: boolean;
};

const money = (amount: number) => `$${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "USD 1,420.00" as a number: the amount Vane wrote for the family. */
export function amountOf(words: string): number {
  const figure = Number(words.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(figure) ? Math.round(figure * 100) / 100 : 0;
}

/** How each of these pupils' families is reached today: the parents' portal, or why not. */
async function reachOf(companyId: string, studentIds: string[]) {
  const students = await prisma.schoolStudent.findMany({
    where: { companyId, id: { in: studentIds } },
    select: { id: true, guardianLinks: { select: { guardian: { select: { userId: true } } } } },
  });
  return new Map(
    students.map((student) => {
      const reachable = student.guardianLinks.some((link) => Boolean(link.guardian.userId));
      return [student.id, { reachable, goesBy: reachable ? "Portal" : student.guardianLinks.length ? "No portal account" : "No guardian on record" }];
    }),
  );
}

export type RemindersPage = {
  /** Vane's reminder waiting for a person, or null when none waits. */
  draft: null | {
    actionId: string;
    status: "proposed" | "failed";
    /** Why the last send did not go, when it failed. */
    failed: string | null;
    term: string;
    subject: string;
    message: string;
    leaveOut: string[];
    /** Why Vane left a family unticked, by studentId. */
    leftOutWhy: Record<string, string>;
    families: ReminderFamily[];
    total: number;
    finding: { fact: string; rest: string };
  };
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The finding over the list: how many families, what they owe between them, and who Vane left unticked. */
export function remindersFinding(families: ReminderFamily[], leaveOut: string[], why: string | null): { fact: string; rest: string } {
  const total = families.reduce((sum, family) => sum + family.owed, 0);
  const unticked = families.filter((family) => leaveOut.includes(family.studentId)).length;
  const fact = `${plural(families.length, "family has", "families have")} paid nothing this term, ${money(total)} between them.`;
  const rest = [
    `Vane drafted a reminder for ${families.length === 1 ? "it" : "each"}.`,
    unticked ? `${unticked === 1 ? "1 is" : `${unticked} are`} unticked${why ? `: ${why}` : ""}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { fact, rest };
}

const remind = VANE_ACTIONS.find((action) => action.kind === "schools.fees.remind")!;

/** Remind families (`/schools/fees/remind`): the newest reminder Vane drafted that waits for a person. */
export async function remindersPage(companyId: string): Promise<RemindersPage> {
  const action = await prisma.vaneAction.findFirst({
    where: { companyId, kind: "schools.fees.remind", status: { in: ["PROPOSED", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, result: true, params: true },
  });
  if (!action) return { draft: null };
  const parsed = remind.params.safeParse(action.params);
  if (!parsed.success) return { draft: null };
  const params = parsed.data as {
    term: string;
    subject: string;
    body: string;
    families: Array<{ studentId: string; family: string; pupil: string; amount: string }>;
    leftOut?: Array<{ studentId?: string; family: string; why: string }>;
    leaveOut: string[];
  };
  const reach = await reachOf(companyId, params.families.map((family) => family.studentId));
  const families: ReminderFamily[] = params.families.map((family) => {
    const way = reach.get(family.studentId) ?? { reachable: false, goesBy: "No guardian on record" };
    return { studentId: family.studentId, family: family.family, pupil: family.pupil, owed: amountOf(family.amount), ...way };
  });
  const leftOutWhy = Object.fromEntries((params.leftOut ?? []).flatMap((row) => (row.studentId ? [[row.studentId, row.why]] : [])));
  const firstWhy = params.leftOut?.find((row) => row.studentId && params.leaveOut.includes(row.studentId))?.why ?? null;
  return {
    draft: {
      actionId: action.id,
      status: action.status === "FAILED" ? "failed" : "proposed",
      failed: action.status === "FAILED" ? action.result : null,
      term: params.term,
      subject: params.subject,
      message: params.body,
      leaveOut: params.leaveOut,
      leftOutWhy,
      families,
      total: Math.round(families.reduce((sum, family) => sum + family.owed, 0) * 100) / 100,
      finding: remindersFinding(families, params.leaveOut, firstWhy),
    },
  };
}
