import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma, VaneJob } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";
import type { ScheduledJob } from "@/lib/scheduled-jobs/schedule";

import { converse, VaneError, type MessagesClient, type Usage } from "./claude";
import { advancePlans } from "./plans";
import { tablesFor } from "./reader";
import { callTool, toolDefinitions } from "./tools";

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

/** Turns of Claude in one job: tool calls, then the closing answer. */
const MAX_TURNS = 12;
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

const SYSTEM = (tables: string[]) => `You are Vane, the helper inside Huchu, a business platform used by shops, mines, schools and service firms in Zimbabwe.

You read what a person in this workspace could read, notice what needs doing, and put it in front of them. You never send, pay, save, approve or change anything on your own: a person presses the button each time. The only things you write are cards on the workspace's For you list (propose_item) and plans for larger work (propose_plan).

How you work:
- Find the facts before you say anything. Look a table up with describe_table, then read it with run_sql. Every figure on a card comes from a query you ran, and the card carries that query.
- Money is in the record's currency. Dates are in the workspace's time, Africa/Harare.
- Raise a card only for something a person can act on today. Three good cards beat ten weak ones; never more than five in one job. When nothing needs doing, raise nothing and say so.
- A card's headline is the fact in one line, with its numbers ("$2,480.00 is overdue across 3 invoices"). Its body gives the reason in a sentence or two and ends with the proposal ("Let's send the three reminders."). Its button names the act ("Send the reminders").
- Plain words, short sentences. No apologies, no filler.
- If a query is refused or fails, read the message, correct the query, and go on.

When you are done, answer in one or two sentences: what you looked at and what you raised.

The tables you may read:
${tables.join(", ")}`;

/** What Claude is asked: the nightly look, or the person's whole request (the label is only its start). */
export function instructionsFor(job: Pick<VaneJob, "kind" | "label" | "request">): string {
  if (job.kind === "nightly") {
    return "Look over the workspace for what needs doing today: money owed and overdue, documents waiting on someone, stock running low, anything stuck. Raise a card for each thing worth a person's attention.";
  }
  return job.request?.trim() || job.label;
}

/** What one tool call read: each table and the rows it answered. */
type Read = { table: string; rows: number };
/**
 * A question `run_sql` answered, kept so a person can check it (the Reports
 * rule: only SQL and rows are stored): the SQL, its columns, and its first
 * rows. `rowCount` is how many came back in all.
 */
export type AskedQuestion = { sql: string; columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number };
type ToolLog = { name: string; ms: number; ok: boolean; reads?: Read[]; question?: AskedQuestion };

/** Rows kept on the job for each question: enough to show and check, not the whole answer. */
export const KEPT_ROWS = 50;

/** The question a `run_sql` call asked and what it answered, from its answer. */
export function questionOf(name: string, content: string): AskedQuestion | undefined {
  if (name !== "run_sql") return undefined;
  try {
    const answer = JSON.parse(content) as { sql?: unknown; rows?: unknown };
    if (typeof answer.sql !== "string" || !Array.isArray(answer.rows)) return undefined;
    const rows = answer.rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return { sql: answer.sql, columns, rows: rows.slice(0, KEPT_ROWS), rowCount: rows.length };
  } catch {
    return undefined;
  }
}

/** The tables a tool call read, from its answer: `run_sql`'s question and `get_record`'s record. */
export function readsOf(name: string, content: string): Read[] | undefined {
  try {
    const answer = JSON.parse(content) as Record<string, unknown>;
    if (name === "run_sql" && Array.isArray(answer.readFrom) && Array.isArray(answer.rows)) {
      const rows = answer.rows.length;
      return answer.readFrom.filter((table): table is string => typeof table === "string").map((table) => ({ table, rows }));
    }
    if (name === "get_record" && typeof answer.table === "string") {
      return [{ table: answer.table, rows: answer.record ? 1 : 0 }];
    }
  } catch {
    // An answer that is not JSON read nothing worth listing.
  }
  return undefined;
}

type JobOutcome = { result: string; model: string; usage: Usage; tools: ToolLog[] };

/** Runs one job's conversation with Claude to its end. Throws a `VaneError` when Claude falls short. */
async function converseJob(job: VaneJob, client: MessagesClient | undefined, deadline: number): Promise<JobOutcome> {
  const tables = [...(await tablesFor(job.companyId)).values()].map((table) => table.name).sort();
  const system = SYSTEM(tables);
  const tools = toolDefinitions();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: instructionsFor(job) }];
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const log: ToolLog[] = [];
  let model = "";

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const left = deadline - Date.now();
    if (left <= 5_000) throw new VaneError("unavailable", "The job ran out of time in this tick and will be tried again.");
    const { message, usage: spent } = await converse({ system, messages, tools, timeoutMs: left, client });
    model = message.model;
    usage.input += spent.input;
    usage.output += spent.output;
    usage.cacheRead += spent.cacheRead;
    usage.cacheWrite += spent.cacheWrite;

    // The response goes back unchanged, thinking included.
    messages.push({ role: "assistant", content: message.content });
    const calls = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (message.stop_reason !== "tool_use" || calls.length === 0) {
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
      return { result: text, model, usage, tools: log };
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const started = Date.now();
      const result = await callTool({ companyId: job.companyId, jobId: job.id }, call.name, call.input);
      const reads = result.ok ? readsOf(call.name, result.content) : undefined;
      const question = result.ok ? questionOf(call.name, result.content) : undefined;
      log.push({ name: call.name, ms: Date.now() - started, ok: result.ok, ...(reads ? { reads } : {}), ...(question ? { question } : {}) });
      results.push({ type: "tool_result", tool_use_id: call.id, content: result.content, is_error: !result.ok });
    }
    messages.push({ role: "user", content: results });
  }
  throw new VaneError("cut-off", `The job did not finish in ${MAX_TURNS} turns.`);
}

/** Jobs left RUNNING by a tick that died go back to waiting. */
async function takeBackStale(now: Date): Promise<void> {
  await prisma.vaneJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STALE_MS) } },
    data: { status: "WAITING", runAfter: now, error: "Its tick stopped before it finished." },
  });
}

/** The oldest job due now in a workspace that is not paused and has allowance left this month. */
async function nextDueJob(now: Date, companyId: string | undefined, jobId: string | undefined): Promise<VaneJob | null> {
  const due = await prisma.vaneJob.findMany({
    where: {
      companyId,
      id: jobId,
      status: { in: ["QUEUED", "WAITING"] },
      runAfter: { lte: now },
      company: { OR: [{ vaneSettings: null }, { vaneSettings: { paused: false } }] },
    },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
    take: 10,
  });
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (const job of due) {
    const settings = await prisma.vaneSettings.findUnique({ where: { companyId: job.companyId }, select: { monthlyAllowance: true } });
    const used = await prisma.vaneJob.count({ where: { companyId: job.companyId, startedAt: { gte: monthStart } } });
    if (used < (settings?.monthlyAllowance ?? 5000)) return job;
  }
  return null;
}

/**
 * Runs the next due job, if any, and says what happened in one line. With
 * `companyId`, only that workspace's jobs are considered; with `jobId`, only
 * that job.
 */
export async function runNextJob(
  now: Date,
  options: { client?: MessagesClient; deadlineMs?: number; companyId?: string; jobId?: string } = {},
): Promise<string> {
  await takeBackStale(now);
  const job = await nextDueJob(now, options.companyId, options.jobId);
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
        // The rows came back from JSON (the tool's answer), so they are JSON again.
        tools: outcome.tools as Prisma.InputJsonValue,
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
    // Started plans move on: a finished step job ticks its step, Vane's next step is queued as a
    // job, a person's step waits for them. Before the jobs, so a queued step can run this tick.
    name: "vane-plans",
    when: { everyMinutes: 1 },
    run: (now) => advancePlans(prisma, now),
  },
  {
    // One Vane job a tick; listed last, so the quick jobs run first.
    name: "vane-jobs",
    when: { everyMinutes: 1 },
    run: (now) => runNextJob(now),
  },
];
