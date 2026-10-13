import type { PrismaClient, VaneItemKind } from "@prisma/client";
import { z } from "zod";

import { dayKey } from "@/lib/workspace/format";

import { monthBounds } from "./settings";

/** What For you holds and the button counts: issues and suggestions. Insights live on Reports → Insights. */
export const FOR_YOU: VaneItemKind[] = ["ISSUE", "SUGGESTION"];

/** What the Vane button, the panel's head and `/vane` show. */
export type VaneStatus = {
  /** Open For you items this person can see. */
  open: number;
  /** A job is running now. */
  working: boolean;
  /** The running job's label and progress ("Matching CBZ lines", "38 of 61 lines"). */
  now: { label: string; progress: string | null } | null;
  paused: boolean;
  /** When Vane was paused (the settings' last change while paused). */
  pausedAt: string | null;
  /** When Vane last finished a job, for "last worked at" when it cannot reach the service. */
  lastWorkedAt: string | null;
  /** The newest job could not reach the service and is waiting to try again. */
  unreachable: boolean;
  /** When the waiting job tries again. */
  nextTryAt: string | null;
  /** This month's jobs are used up: new ones wait for `resetsOn`. */
  overAllowance: { used: number; allowance: number; resetsOn: string } | null;
  /** The last job Vane finished could not be worked out: what it was, why, and the tools it tried. */
  stuck: { label: string; error: string; tried: string[]; at: string } | null;
  /** The counts beside Vane's pages in its panel. */
  counts: { working: number; plans: number; doneToday: number; muted: number };
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

/** The start of the workspace's day (Africa/Harare, which keeps no summer time: UTC+2). */
export function startOfWorkspaceDay(now: Date): Date {
  const [year, month, day] = dayKey(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - 2 * 60 * 60 * 1000);
}

const toolsSchema = z.array(z.object({ name: z.string(), ok: z.boolean().optional() }).passthrough());

/** The tools a job called, in order, each once: "run_sql", "describe_table". */
function toolsTried(value: unknown): string[] {
  const parsed = toolsSchema.safeParse(value);
  return parsed.success ? [...new Set(parsed.data.map((call) => call.name))] : [];
}

export async function vaneStatus(
  db: Pick<PrismaClient, "vaneItem" | "vaneJob" | "vanePlan" | "vaneSettings">,
  { companyId, userId, role }: { companyId: string; userId: string; role?: string | null },
  now: Date = new Date(),
): Promise<VaneStatus> {
  const { start: monthStart, next: monthNext } = monthBounds(now);
  const mine = { companyId, kind: { in: FOR_YOU }, ...audienceFilter(userId, role) };
  const [open, muted, running, last, newest, lastFinished, settings, working, plans, doneToday, used] = await Promise.all([
    db.vaneItem.count({ where: { ...mine, status: "OPEN" } }),
    db.vaneItem.count({ where: { ...mine, status: "MUTED" } }),
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
    db.vaneJob.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" }, select: { status: true, runAfter: true } }),
    db.vaneJob.findFirst({
      where: { companyId, status: { in: ["DONE", "FAILED"] }, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { status: true, label: true, error: true, tools: true, finishedAt: true },
    }),
    db.vaneSettings.findUnique({ where: { companyId }, select: { paused: true, updatedAt: true, monthlyAllowance: true } }),
    db.vaneJob.count({ where: { companyId, status: { in: ["RUNNING", "QUEUED", "WAITING"] } } }),
    db.vanePlan.count({ where: { companyId, status: "OPEN" } }),
    db.vaneJob.count({ where: { companyId, status: "DONE", finishedAt: { gte: startOfWorkspaceDay(now) } } }),
    // What holds new jobs back (`lib/vane/jobs.ts`): the jobs started this month.
    db.vaneJob.count({ where: { companyId, startedAt: { gte: monthStart } } }),
  ]);
  const paused = settings?.paused ?? false;
  const allowance = settings?.monthlyAllowance ?? 5000;
  const progress =
    running && running.progressTotal != null ? `${running.progressDone ?? 0} of ${running.progressTotal}` : null;
  const unreachable = newest?.status === "WAITING";
  return {
    open,
    working: Boolean(running) && !paused,
    now: running ? { label: running.label, progress } : null,
    paused,
    pausedAt: paused && settings ? settings.updatedAt.toISOString() : null,
    lastWorkedAt: last?.finishedAt?.toISOString() ?? null,
    unreachable,
    nextTryAt: unreachable && newest ? newest.runAfter.toISOString() : null,
    overAllowance: used >= allowance ? { used, allowance, resetsOn: monthNext.toISOString().slice(0, 10) } : null,
    stuck:
      lastFinished?.status === "FAILED" && lastFinished.finishedAt
        ? {
            label: lastFinished.label,
            error: lastFinished.error?.trim() || "It stopped without saying why.",
            tried: toolsTried(lastFinished.tools),
            at: lastFinished.finishedAt.toISOString(),
          }
        : null,
    counts: { working, plans, doneToday, muted },
  };
}
