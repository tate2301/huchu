import { prisma } from "@/lib/prisma";

import { sendSchoolNotice, NoticeError } from "./notices";

/**
 * Fee reminders Vane drafts and a person sends (the PageVaneSchool board).
 * Vane drafts one reminder in the school's words for the families who have
 * paid nothing this term, with [family], [pupil] and [amount] for each to see
 * their own; it is a Vane action (`schools.fees.remind`) that waits for a
 * person. They may change the words and untick families, then send: each
 * family gets its own notice in the parents' portal, through the school's own
 * notices, as that person.
 */

export type ReminderFamily = {
  studentId: string;
  /** "The Moyo family". */
  family: string;
  /** "Rumbidzai, Form 3B". */
  pupil: string;
  /** What the family owes on this term's fees now. */
  owed: number;
  /** How it reaches them: "Portal", or why it cannot. */
  goesBy: string;
  reachable: boolean;
};

const PLACEHOLDERS = /\[(family|pupil|amount)\]/gi;

const money = (amount: number) => `$${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The reminder as one family reads it: their name, their child and what they owe. */
export function mergeReminder(template: string, family: { family: string; firstName: string; owed: number }): string {
  return template.replace(PLACEHOLDERS, (_, word: string) => {
    const key = word.toLowerCase();
    if (key === "family") return family.family;
    if (key === "pupil") return family.firstName;
    return money(family.owed);
  });
}

/** The families of these pupils as the page lists them, with what each owes on the term now. */
export async function reminderFamilies(companyId: string, termId: string, studentIds: string[]): Promise<ReminderFamily[]> {
  const [students, invoices] = await Promise.all([
    prisma.schoolStudent.findMany({
      where: { companyId, id: { in: studentIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        currentClass: { select: { name: true } },
        guardianLinks: { select: { guardian: { select: { userId: true } } } },
      },
    }),
    prisma.schoolFeeInvoice.findMany({
      where: { companyId, termId, studentId: { in: studentIds }, status: { in: ["ISSUED", "PART_PAID"] } },
      select: { studentId: true, balanceAmount: true },
    }),
  ]);
  const owed = new Map<string, number>();
  for (const invoice of invoices) owed.set(invoice.studentId, (owed.get(invoice.studentId) ?? 0) + Number(invoice.balanceAmount));
  const byId = new Map(students.map((student) => [student.id, student]));
  return studentIds.flatMap((id) => {
    const student = byId.get(id);
    if (!student) return [];
    const reachable = student.guardianLinks.some((link) => Boolean(link.guardian.userId));
    return [
      {
        studentId: id,
        family: `The ${student.lastName} family`,
        pupil: student.currentClass ? `${student.firstName}, ${student.currentClass.name}` : student.firstName,
        owed: Math.round((owed.get(id) ?? 0) * 100) / 100,
        goesBy: reachable ? "Portal" : student.guardianLinks.length ? "No portal account" : "No guardian on record",
        reachable,
      },
    ];
  });
}

export type RemindersSent = { sent: string[]; skipped: Array<{ family: string; why: string }> };

/**
 * Sends each family its own reminder, as the person who pressed Send: a
 * notice in the parents' portal with their name, child and amount. A family
 * that owes nothing now, or that no guardian's account reaches, is skipped
 * and said.
 */
export async function sendFeeReminders(
  actor: { companyId: string; userId: string },
  input: { termId: string; term: string; studentIds: string[]; message: string },
): Promise<RemindersSent> {
  const families = await reminderFamilies(actor.companyId, input.termId, input.studentIds);
  const students = await prisma.schoolStudent.findMany({
    where: { companyId: actor.companyId, id: { in: input.studentIds } },
    select: { id: true, firstName: true },
  });
  const firstName = new Map(students.map((student) => [student.id, student.firstName]));
  const sent: string[] = [];
  const skipped: RemindersSent["skipped"] = [];
  for (const family of families) {
    if (family.owed <= 0) {
      skipped.push({ family: family.family, why: "has paid since" });
      continue;
    }
    if (!family.reachable) {
      skipped.push({ family: family.family, why: family.goesBy.toLowerCase() });
      continue;
    }
    try {
      await sendSchoolNotice({
        companyId: actor.companyId,
        senderUserId: actor.userId,
        title: `Fees for ${input.term}`,
        body: mergeReminder(input.message, { family: family.family, firstName: firstName.get(family.studentId) ?? "", owed: family.owed }),
        audience: "PARENTS",
        studentIds: [family.studentId],
        severity: "INFO",
      });
      sent.push(family.family);
    } catch (error) {
      if (!(error instanceof NoticeError)) throw error;
      skipped.push({ family: family.family, why: error.message });
    }
  }
  return { sent, skipped };
}

export type RemindersPage = {
  /** Vane's reminder waiting for a person, or null when none waits. */
  draft: null | {
    actionId: string;
    status: "proposed" | "failed";
    /** Why the last send did not go, when it failed. */
    failed: string | null;
    termId: string;
    term: string;
    message: string;
    leaveOut: string[];
    leaveOutWhy: string | null;
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

const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** Remind families (`/schools/fees/remind`): the newest reminder Vane drafted that waits for a person. */
export async function remindersPage(companyId: string): Promise<RemindersPage> {
  const action = await prisma.vaneAction.findFirst({
    where: { companyId, kind: "schools.fees.remind", status: { in: ["PROPOSED", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, result: true, params: true },
  });
  if (!action) return { draft: null };
  const params = (action.params ?? {}) as Record<string, unknown>;
  const studentIds = asStrings(params.studentIds);
  const leaveOut = asStrings(params.leaveOut);
  const why = typeof params.leaveOutWhy === "string" && params.leaveOutWhy ? params.leaveOutWhy : null;
  const termId = String(params.termId ?? "");
  const families = await reminderFamilies(companyId, termId, studentIds);
  return {
    draft: {
      actionId: action.id,
      status: action.status === "FAILED" ? "failed" : "proposed",
      failed: action.status === "FAILED" ? action.result : null,
      termId,
      term: String(params.term ?? ""),
      message: String(params.message ?? ""),
      leaveOut,
      leaveOutWhy: why,
      families,
      total: Math.round(families.reduce((sum, family) => sum + family.owed, 0) * 100) / 100,
      finding: remindersFinding(families, leaveOut, why),
    },
  };
}
