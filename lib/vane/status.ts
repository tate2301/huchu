import type { PrismaClient, VaneItemKind } from "@prisma/client";
import { z } from "zod";

import { dayKey } from "@/lib/workspace/format";

import { monthBounds } from "./settings";
import { notStopped, stoppedTopics } from "./topics";

/**
 * A job's label as a line: a job keeps its whole instruction in its label
 * (an explained figure's question, then the report it is about), so the pages
 * show its first line.
 */
export function jobLine(label: string): string {
  return label.trim().split("\n")[0]!.trim();
}

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
  /** Who paused it, when that is known. */
  pausedBy: string | null;
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
  /** The job Vane could not work out: what stopped it, what it tried, and whether it left the rows' question ("Show the rows"). */
  stuck: { jobId: string; label: string; error: string; tried: string[]; at: string; rows: boolean } | null;
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
  db: Pick<PrismaClient, "vaneItem" | "vaneJob" | "vanePlan" | "vaneSettings" | "vaneTopicStop">,
  { companyId, userId, role }: { companyId: string; userId: string; role?: string | null },
  now: Date = new Date(),
): Promise<VaneStatus> {
  const { start: monthStart, next: monthNext } = monthBounds(now);
  const mine = { companyId, kind: { in: FOR_YOU }, ...audienceFilter(userId, role) };
  // What this person stopped for themselves is not counted as waiting for them.
  const stopped = await stoppedTopics(db, { companyId, userId });
  const [open, muted, running, last, newest, lastFinished, settings, working, plans, doneToday, used] = await Promise.all([
    db.vaneItem.count({ where: { ...mine, ...notStopped(stopped), status: "OPEN" } }),
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
    // A chat turn that failed has said why in the conversation; Vane's state is about its own jobs.
    db.vaneJob.findFirst({ where: { companyId, kind: { not: "chat" } }, orderBy: { createdAt: "desc" }, select: { status: true, runAfter: true } }),
    db.vaneJob.findFirst({
      where: { companyId, kind: { not: "chat" }, status: { in: ["DONE", "FAILED"] }, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { id: true, status: true, label: true, error: true, tools: true, finishedAt: true, problemSql: true },
    }),
    db.vaneSettings.findUnique({ where: { companyId }, select: { paused: true, updatedAt: true, monthlyAllowance: true, pausedBy: { select: { name: true } } } }),
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
    now: running ? { label: jobLine(running.label), progress } : null,
    paused,
    pausedBy: paused ? (settings?.pausedBy?.name ?? null) : null,
    pausedAt: paused && settings ? settings.updatedAt.toISOString() : null,
    lastWorkedAt: last?.finishedAt?.toISOString() ?? null,
    unreachable,
    nextTryAt: unreachable && newest ? newest.runAfter.toISOString() : null,
    overAllowance: used >= allowance ? { used, allowance, resetsOn: monthNext.toISOString().slice(0, 10) } : null,
    stuck:
      lastFinished?.status === "FAILED" && lastFinished.finishedAt
        ? {
            jobId: lastFinished.id,
            label: jobLine(lastFinished.label),
            error: lastFinished.error?.trim() || "It stopped without saying why.",
            tried: toolsTried(lastFinished.tools),
            at: lastFinished.finishedAt.toISOString(),
            rows: Boolean(lastFinished.problemSql),
          }
        : null,
    counts: { working, plans, doneToday, muted },
  };
}

/**
 * A question Vane wrote for a custom report, waiting in its builder to be kept
 * (ReportBuildVane). It is a For you suggestion whose action points at the
 * report (`/reports/c/<id>` or its builder) and which carries the SQL it wrote.
 * Vane only drafts it: a person keeps it, and it is saved when they publish.
 */
export type ReportSuggestion = {
  id: string;
  /** The question's name, as the builder lists questions ("by fitter"). */
  name: string;
  /** Why, and the closing "let's …". */
  note: string;
  sql: string;
};

/** The report a Vane action points at, by id, or null when it points elsewhere. */
export function reportTarget(action: unknown): string | null {
  const target = action && typeof action === "object" ? (action as { target?: unknown }).target : null;
  if (typeof target !== "string") return null;
  const match = /^\/reports\/c\/([^/?#]+)(?:\/edit)?(?:[?#].*)?$/.exec(target);
  return match ? decodeURIComponent(match[1]!) : null;
}

/** An open suggestion as the builder shows it, when it is one for this report. */
export function toReportSuggestion(
  item: { id: string; headline: string; body: string; sql: string | null; action: unknown },
  reportId: string,
): ReportSuggestion | null {
  if (!item.sql?.trim() || reportTarget(item.action) !== reportId) return null;
  return { id: item.id, name: item.headline.trim(), note: item.body.trim(), sql: item.sql };
}

/** The open suggestions for one custom report that this person can see, newest first. */
export async function reportSuggestions(
  db: Pick<PrismaClient, "vaneItem">,
  { companyId, userId, role, reportId }: { companyId: string; userId: string; role?: string | null; reportId: string },
): Promise<ReportSuggestion[]> {
  const items = await db.vaneItem.findMany({
    where: { companyId, status: "OPEN", kind: "SUGGESTION", sql: { not: null }, ...audienceFilter(userId, role) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, headline: true, body: true, sql: true, action: true },
  });
  return items.flatMap((item) => {
    const suggestion = toReportSuggestion(item, reportId);
    return suggestion ? [suggestion] : [];
  });
}
