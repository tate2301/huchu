import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * The state Vane is in (PageVaneStates), for `/vane` and the panel: paused,
 * over the monthly allowance, unable to reach the service, or unable to work
 * out its last job. Read from `VaneSettings` and `VaneJob`.
 */

type Db = Pick<PrismaClient, "vaneJob" | "vaneSettings">;

/** The start of this month, as the worker counts jobs against the allowance (`jobs.ts`). */
function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function nextMonth(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export type VaneState =
  /** Someone paused it: nothing new is read or drafted. */
  | { kind: "paused"; since: string | null }
  /** This month's jobs reached the allowance: new jobs wait for next month. */
  | { kind: "allowance"; used: number; allowance: number; resetsOn: string }
  /** It cannot reach the service: the newest job is waiting to try again. */
  | { kind: "unreachable"; lastWorkedAt: string | null; nextTry: string | null; error: string | null }
  /** The last job it finished failed: what it was, why, and what it tried. */
  | { kind: "failed"; jobId: string; label: string; error: string; tried: Array<{ name: string; ok: boolean }>; at: string };

const toolsSchema = z.array(z.object({ name: z.string(), ok: z.boolean().optional() }).passthrough());

/** The tools a job called, in order, as the worker logged them (`[{ name, ms, ok }]`). */
export function parseTools(value: unknown): Array<{ name: string; ok: boolean }> {
  const parsed = toolsSchema.safeParse(value);
  return parsed.success ? parsed.data.map((tool) => ({ name: tool.name, ok: tool.ok !== false })) : [];
}

/**
 * The one state worth saying, most pressing first: paused, then over the
 * allowance (both stop new work), then unable to reach the service, then the
 * last job failing. Null when Vane is simply working or watching.
 */
export async function vaneState(db: Db, companyId: string, now: Date = new Date()): Promise<VaneState | null> {
  const [settings, used, newest, lastFinished, lastDone] = await Promise.all([
    db.vaneSettings.findUnique({ where: { companyId }, select: { paused: true, monthlyAllowance: true, updatedAt: true } }),
    db.vaneJob.count({ where: { companyId, startedAt: { gte: monthStart(now) } } }),
    db.vaneJob.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" }, select: { status: true, error: true, runAfter: true } }),
    db.vaneJob.findFirst({
      where: { companyId, status: { in: ["DONE", "FAILED"] }, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { id: true, status: true, label: true, error: true, tools: true, finishedAt: true },
    }),
    db.vaneJob.findFirst({ where: { companyId, status: "DONE" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
  ]);
  if (settings?.paused) return { kind: "paused", since: settings.updatedAt.toISOString() };
  const allowance = settings?.monthlyAllowance ?? 5000;
  if (used >= allowance) return { kind: "allowance", used, allowance, resetsOn: nextMonth(now) };
  if (newest?.status === "WAITING") {
    return {
      kind: "unreachable",
      lastWorkedAt: lastDone?.finishedAt?.toISOString() ?? null,
      nextTry: newest.runAfter.toISOString(),
      error: newest.error,
    };
  }
  if (lastFinished?.status === "FAILED") {
    return {
      kind: "failed",
      jobId: lastFinished.id,
      label: lastFinished.label,
      error: lastFinished.error?.trim() || "It stopped without saying why.",
      tried: parseTools(lastFinished.tools),
      at: (lastFinished.finishedAt ?? now).toISOString(),
    };
  }
  return null;
}

