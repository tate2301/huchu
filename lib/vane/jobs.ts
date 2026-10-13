import type { PrismaClient, VaneJob } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";
import type { ScheduledJob } from "@/lib/scheduled-jobs/schedule";

import { VaneError, type MessagesClient, type Usage } from "./claude";
import { runConversation, type ToolLog } from "./conversation";
import { vaneRules } from "./prompt";
import { tablesFor } from "./reader";

/**
 * Vane's jobs (`docs/handover-core-modules.md` §3.3), run on the
 * scheduled-jobs tick (`app/api/cron/tick`).
 *
 * A job is a `VaneJob` row. The nightly run queues one per workspace that
 * has turned Vane on (it has a `VaneSettings` row and is not paused); a
 * person will queue one with "Give Vane a job". Each tick runs at most one:
 * Claude with Vane's tools, turn by turn until it stops calling them, within a
 * minute. What it cost (tokens, cache reads and writes, each tool called) is
 * kept on the job.
 *
 * When Claude cannot be reached or is busy, the job waits and is tried again
 * later; anything else fails with its message. A job whose tick died is taken
 * back after ten minutes. A workspace past its monthly allowance waits for
 * next month.
 */

/** One job's share of a tick (the route's `maxDuration` is 120 s). */
const JOB_DEADLINE_MS = 60_000;
/** A RUNNING job older than this lost its tick. */
const STALE_MS = 10 * 60_000;
/** Tries before a job that keeps meeting an unavailable Claude fails. */
const MAX_ATTEMPTS = 5;

/** The workspace's day on the shop clock, "2026-10-13": the nightly job's key. */
function shopDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Queues the day's look over the workspace for every workspace that has Vane on. */
export async function queueNightlyJobs(now: Date): Promise<string> {
  const on = await prisma.vaneSettings.findMany({ where: { paused: false }, select: { companyId: true } });
  const { count } = await prisma.vaneJob.createMany({
    data: on.map(({ companyId }) => ({
      companyId,
      key: `nightly:${shopDay(now)}`,
      kind: "nightly",
      label: "Looking over the workspace",
      trigger: "NIGHTLY" as const,
      runAfter: now,
    })),
    skipDuplicates: true,
  });
  return `${count} queued`;
}

const SYSTEM = (tables: string[]) => `${vaneRules(tables)}

When you are done, answer in one or two sentences: what you looked at and what you raised.`;

function instructionsFor(job: Pick<VaneJob, "kind" | "label">): string {
  if (job.kind === "nightly") {
    return "Look over the workspace for what needs doing today: money owed and overdue, documents waiting on someone, stock running low, anything stuck. Raise a card for each thing worth a person's attention.";
  }
  return job.label;
}

type JobOutcome = { result: string; model: string; usage: Usage; tools: ToolLog[] };

/** Runs one job's conversation with Claude to its end. Throws a `VaneError` when Claude falls short. */
async function converseJob(job: VaneJob, client: MessagesClient | undefined, deadline: number): Promise<JobOutcome> {
  const tables = [...(await tablesFor(job.companyId)).values()].map((table) => table.name).sort();
  const outcome = await runConversation({
    system: SYSTEM(tables),
    messages: [{ role: "user", content: instructionsFor(job) }],
    context: { companyId: job.companyId, jobId: job.id },
    deadline,
    client,
  });
  return { result: outcome.text, model: outcome.model, usage: outcome.usage, tools: outcome.tools };
}

/** The jobs a workspace has started this month (UTC): what counts against its allowance, chat turns included. */
export function jobsStartedThisMonthFor(db: Pick<PrismaClient, "vaneJob">, companyId: string, now: Date): Promise<number> {
  return db.vaneJob.count({ where: { companyId, startedAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } } });
}

/** Jobs left RUNNING by a tick that died go back to waiting. */
async function takeBackStale(now: Date): Promise<void> {
  const before = new Date(now.getTime() - STALE_MS);
  await prisma.vaneJob.updateMany({
    where: { status: "RUNNING", kind: { not: "chat" }, startedAt: { lt: before } },
    data: { status: "WAITING", runAfter: now, error: "Its tick stopped before it finished." },
  });
  // A chat turn belongs to the person who waited for it; one whose request died is over, not retried.
  await prisma.vaneJob.updateMany({
    where: { status: "RUNNING", kind: "chat", startedAt: { lt: before } },
    data: { status: "FAILED", finishedAt: now, error: "The chat stopped before Vane answered." },
  });
}

/** The oldest job due now in a workspace that is not paused and has allowance left this month. */
async function nextDueJob(now: Date, companyId: string | undefined): Promise<VaneJob | null> {
  const due = await prisma.vaneJob.findMany({
    where: {
      companyId,
      status: { in: ["QUEUED", "WAITING"] },
      runAfter: { lte: now },
      company: { OR: [{ vaneSettings: null }, { vaneSettings: { paused: false } }] },
    },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
    take: 10,
  });
  for (const job of due) {
    const settings = await prisma.vaneSettings.findUnique({ where: { companyId: job.companyId }, select: { monthlyAllowance: true } });
    const used = await jobsStartedThisMonthFor(prisma, job.companyId, now);
    if (used < (settings?.monthlyAllowance ?? 5000)) return job;
  }
  return null;
}

/**
 * Runs the next due job, if any, and says what happened in one line. With
 * `companyId`, only that workspace's jobs are considered.
 */
export async function runNextJob(
  now: Date,
  options: { client?: MessagesClient; deadlineMs?: number; companyId?: string } = {},
): Promise<string> {
  await takeBackStale(now);
  const job = await nextDueJob(now, options.companyId);
  if (!job) return "nothing due";

  const { count } = await prisma.vaneJob.updateMany({
    where: { id: job.id, status: job.status },
    data: { status: "RUNNING", startedAt: now, attempts: { increment: 1 }, error: null },
  });
  if (count === 0) return "nothing due";

  const deadline = Date.now() + (options.deadlineMs ?? JOB_DEADLINE_MS);
  try {
    const outcome = await converseJob(job, options.client, deadline);
    await prisma.vaneJob.update({
      where: { id: job.id },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        result: outcome.result,
        model: outcome.model,
        tokensIn: outcome.usage.input,
        tokensOut: outcome.usage.output,
        cacheReadTokens: outcome.usage.cacheRead,
        cacheWriteTokens: outcome.usage.cacheWrite,
        tools: outcome.tools,
      },
    });
    return `${job.kind} for ${job.companyId}: done`;
  } catch (error) {
    const attempts = job.attempts + 1;
    if (error instanceof VaneError && error.retryable && attempts < MAX_ATTEMPTS) {
      const waitMinutes = Math.min(60, 2 ** attempts);
      await prisma.vaneJob.update({
        where: { id: job.id },
        data: { status: "WAITING", runAfter: new Date(now.getTime() + waitMinutes * 60_000), error: error.message },
      });
      return `${job.kind} for ${job.companyId}: waiting ${waitMinutes} min (${error.code})`;
    }
    const message = error instanceof Error ? error.message : String(error);
    await prisma.vaneJob.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), error: message } });
    return `${job.kind} for ${job.companyId}: failed (${message})`;
  }
}

/** Vane's place on the scheduled-jobs tick. */
export const VANE_JOBS: ScheduledJob[] = [
  {
    // The day's look over every workspace that has Vane on.
    name: "vane-nightly",
    when: { dailyAt: "06:00" },
    run: (now) => queueNightlyJobs(now),
  },
  {
    // One Vane job a tick; listed last, so the quick jobs run first.
    name: "vane-jobs",
    when: { everyMinutes: 1 },
    run: (now) => runNextJob(now),
  },
];
