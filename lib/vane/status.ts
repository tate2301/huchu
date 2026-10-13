import type { PrismaClient } from "@prisma/client";

/** What the Vane button and the panel's head show. */
export type VaneStatus = {
  /** Open For you items this person can see. */
  open: number;
  /** A job is running now. */
  working: boolean;
  /** The running job's label and progress ("Matching CBZ lines", "38 of 61 lines"). */
  now: { label: string; progress: string | null } | null;
  paused: boolean;
  /** When Vane last finished a job, for "last worked at" when it cannot reach the service. */
  lastWorkedAt: string | null;
  /** The newest job could not reach the service and is waiting to try again. */
  unreachable: boolean;
};

/**
 * The items a person sees: everyone's, their role's, and their own. An item
 * for another role or another person is not theirs.
 */
export function audienceFilter(userId: string, role: string | null | undefined) {
  return {
    AND: [
      { OR: [{ audienceUserId: null }, { audienceUserId: userId }] },
      { OR: [{ audienceRole: null }, ...(role ? [{ audienceRole: role }] : [])] },
    ],
  };
}

export async function vaneStatus(
  db: Pick<PrismaClient, "vaneItem" | "vaneJob" | "vaneSettings">,
  { companyId, userId, role }: { companyId: string; userId: string; role?: string | null },
): Promise<VaneStatus> {
  const [open, running, last, newest, settings] = await Promise.all([
    db.vaneItem.count({ where: { companyId, status: "OPEN", ...audienceFilter(userId, role) } }),
    db.vaneJob.findFirst({
      where: { companyId, status: "RUNNING" },
      orderBy: { startedAt: "desc" },
      select: { label: true, progressDone: true, progressTotal: true },
    }),
    db.vaneJob.findFirst({
      where: { companyId, status: "DONE" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
    db.vaneJob.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" }, select: { status: true, error: true } }),
    db.vaneSettings.findUnique({ where: { companyId }, select: { paused: true } }),
  ]);
  const progress =
    running && running.progressTotal != null
      ? `${running.progressDone ?? 0} of ${running.progressTotal}`
      : null;
  return {
    open,
    working: Boolean(running) && !settings?.paused,
    now: running ? { label: running.label, progress } : null,
    paused: settings?.paused ?? false,
    lastWorkedAt: last?.finishedAt?.toISOString() ?? null,
    unreachable: newest?.status === "WAITING",
  };
}
