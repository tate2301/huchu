import type { PrismaClient, VaneItemKind } from "@prisma/client";

import { notStopped } from "./stops";

/** What the Vane button and the panel's head show. */
/** What For you holds and the button counts: issues and suggestions. Insights live on Reports → Insights. */
export const FOR_YOU: VaneItemKind[] = ["ISSUE", "SUGGESTION"];

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
  db: Pick<PrismaClient, "vaneItem" | "vaneJob" | "vaneSettings" | "vaneCardChoice">,
  { companyId, userId, role }: { companyId: string; userId: string; role?: string | null },
): Promise<VaneStatus> {
  const stopped = await notStopped(db, companyId, userId);
  const [open, running, last, newest, settings] = await Promise.all([
    db.vaneItem.count({ where: { companyId, status: "OPEN", kind: { in: FOR_YOU }, ...audienceFilter(userId, role), ...stopped } }),
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
