import type { PrismaClient } from "@prisma/client";

import { ACTION_SELECT, toActionView, type VaneActionView } from "@/lib/vane/actions/engine";
import { remindParams, type ReminderParams } from "@/lib/schools/operations";

/**
 * The fee reminders Vane drafted, on their own page (the PageVaneSchool
 * board): every family who owes, ticked unless Vane left them out and said
 * why, how each would hear, and what became of it once a person decided.
 */
export type ReminderDraft = {
  action: VaneActionView;
  params: ReminderParams;
  /** Families with nobody on the portal yet, by pupil: the notice cannot reach them. */
  unreachable: string[];
  /** Of those, the pupils with no guardian on record at all. */
  noGuardian: string[];
};

export async function readReminderDraft(
  db: Pick<PrismaClient, "vaneAction" | "schoolStudentGuardian">,
  companyId: string,
  id: string,
): Promise<ReminderDraft | null> {
  const row = await db.vaneAction.findFirst({ where: { id, companyId, kind: "schools.fees.remind" }, select: ACTION_SELECT });
  if (!row) return null;
  const parsed = remindParams.safeParse(row.params);
  if (!parsed.success) return null;
  const studentIds = parsed.data.families.map((family) => family.studentId);
  const links = await db.schoolStudentGuardian.findMany({
    where: { companyId, studentId: { in: studentIds } },
    select: { studentId: true, guardian: { select: { userId: true } } },
  });
  const reached = new Set(links.filter((link) => link.guardian.userId).map((link) => link.studentId));
  const linked = new Set(links.map((link) => link.studentId));
  return {
    action: toActionView(row),
    params: parsed.data,
    unreachable: studentIds.filter((studentId) => !reached.has(studentId)),
    noGuardian: studentIds.filter((studentId) => !linked.has(studentId)),
  };
}

/**
 * The newest fee reminder Vane drafted that still waits for a person (or
 * failed and may be sent again), for `/schools/fees/remind` and Vane's cards
 * that cannot know the action's id. Null when none waits.
 */
export async function newestReminderDraftId(db: Pick<PrismaClient, "vaneAction">, companyId: string): Promise<string | null> {
  const rows = await db.vaneAction.findMany({
    where: { companyId, kind: "schools.fees.remind", status: { in: ["PROPOSED", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, params: true },
  });
  return rows.find((row) => remindParams.safeParse(row.params).success)?.id ?? null;
}
