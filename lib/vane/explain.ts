import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { AskedQuestion } from "./conversation";
import { jobLine } from "./status";

/**
 * Explain a figure on a report (PageVaneReport). A person presses Explain on
 * a figure; that press gives Vane a job of its own (kind `explain`), which the
 * worker runs like any other: Claude reads the workspace with `run_sql` and
 * answers in a sentence or two, and the job's tool log keeps each question it
 * asked with the rows it drew (`conversation.ts`). The answer shows in the
 * Vane panel beside the report, with the rows and the SQL.
 *
 * A job keeps its whole instruction in its label, as every job does, and the
 * pages show its first line: here, the question in the person's words.
 *
 * Nothing about it changes the report. A card it raises ("Let's keep this
 * view") waits for a person, as every card does.
 */

/** The figure a person asked about: which report, which figure, what it read when they asked. */
export const explainAboutSchema = z.object({
  report: z.string().trim().min(1).max(120),
  /** The report's own title, as the page showed it. */
  title: z.string().trim().min(1).max(160),
  figure: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(60),
  /** The dates and choices the report was read with: `{ from: "2026-01-01" }`. */
  params: z.record(z.string(), z.string().max(200)).default({}),
});
export type ExplainAbout = z.infer<typeof explainAboutSchema>;

export const explainSchema = z.object({ about: explainAboutSchema });

/** What the person asks, in their words: "What is behind Lost, $1,458,600.00?" */
export function explainQuestion(about: Pick<ExplainAbout, "figure" | "value">): string {
  return `What is behind ${about.figure}, ${about.value}?`;
}

/** The whole instruction the worker hands Claude: the question on its first line, then the report it is about. */
export function explainRequest(about: ExplainAbout): string {
  const params = Object.entries(about.params)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
  return [
    explainQuestion(about),
    "",
    `A person asked this on the report “${about.title}” (${about.report})${params ? `, read with ${params}` : ""}, where the figure “${about.figure}” reads ${about.value}.`,
    "Find out what is behind the figure: read the rows with run_sql, and break them down the way that explains it best (by reason, owner, stage, customer or month).",
    "Answer in one or two sentences with the numbers. The last question you ran is shown under your answer as a table, so make it the breakdown, with plain column names.",
    "If the breakdown is worth keeping as a view of its own, raise one suggestion card that says so; otherwise raise nothing. Do not propose actions.",
  ].join("\n");
}

/** A person's Explain, queued for the worker as a job of its own. */
export function queueExplain(
  db: Pick<PrismaClient, "vaneJob">,
  { companyId, userId, about }: { companyId: string; userId: string; about: ExplainAbout },
) {
  return db.vaneJob.create({
    data: {
      companyId,
      key: `explain:${randomUUID()}`,
      kind: "explain",
      label: explainRequest(about),
      trigger: "PERSON",
      requestedById: userId,
    },
    select: { id: true, status: true },
  });
}

/** The breakdown under an answer: the last question that drew rows, else the last one asked. */
export function answerQuestion(questions: AskedQuestion[]): AskedQuestion | null {
  for (let index = questions.length - 1; index >= 0; index -= 1) {
    if (questions[index]!.rowCount > 0) return questions[index]!;
  }
  return questions[questions.length - 1] ?? null;
}

const questionSchema = z.object({
  sql: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  rowCount: z.number().int().nonnegative(),
  tables: z.array(z.string()).optional(),
});

const logSchema = z.array(z.object({ name: z.string(), ok: z.boolean().optional(), question: questionSchema.optional() }).passthrough());

/** Each question a job's `run_sql` calls answered, in the order they ran. */
export function parseQuestions(tools: unknown): AskedQuestion[] {
  const parsed = logSchema.safeParse(tools);
  if (!parsed.success) return [];
  return parsed.data.flatMap((call) => (call.question ? [call.question] : []));
}

/** What each tool call tried, and whether it answered. */
function parseTried(tools: unknown): Array<{ name: string; ok: boolean }> {
  const parsed = logSchema.safeParse(tools);
  return parsed.success ? parsed.data.map((call) => ({ name: call.name, ok: call.ok !== false })) : [];
}

/** "Lost reason" from `lost_reason`, `lostReason` or `Lost reason`: a column as people read it. */
export function columnWords(column: string): string {
  const spaced = column
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : column;
}

/** The tables a question read, named as people know them; the reader names them in lower case. */
const TABLE_NAMES: Record<string, string> = {
  crmdeal: "Deals",
  crmlead: "Leads",
  crmactivity: "Activity logged",
  crmpipelinestage: "Pipeline stages",
  crmtask: "Tasks",
  salesinvoice: "Invoices",
  salesquotation: "Quotes",
  customer: "Customers",
  banktransaction: "Bank lines",
  retailsale: "Sales",
  retailshift: "Till shifts",
  employee: "Employees",
};

export function tableWords(table: string): string {
  return TABLE_NAMES[table.toLowerCase()] ?? columnWords(table);
}

/** Vane's answer to a figure, as the panel shows it beside the report. */
export type VaneExplainView = {
  id: string;
  /** The question, in the person's words. */
  question: string;
  status: "queued" | "running" | "waiting" | "done" | "failed";
  result: string | null;
  error: string | null;
  /** The question its answer rests on: the SQL, its columns and the rows it drew. */
  asked: AskedQuestion | null;
  /** The tables it read, named as people know them. */
  read: string[];
  /** What it tried: each tool it called, and whether it answered. */
  tried: Array<{ name: string; ok: boolean }>;
  finishedAt: string | null;
  /** When it tries again (the service could not be reached). */
  nextTry: string | null;
};

const STATUS = { QUEUED: "queued", RUNNING: "running", WAITING: "waiting", DONE: "done", FAILED: "failed" } as const;

/** One figure this person asked Vane to explain. Null when it is not theirs, or not an explanation. */
export async function explainView(
  db: Pick<PrismaClient, "vaneJob">,
  { companyId, userId, id }: { companyId: string; userId: string; id: string },
): Promise<VaneExplainView | null> {
  const job = await db.vaneJob.findFirst({
    where: { id, companyId, kind: "explain", requestedById: userId },
    select: { id: true, label: true, status: true, result: true, error: true, tools: true, finishedAt: true, runAfter: true },
  });
  if (!job) return null;
  const questions = parseQuestions(job.tools);
  return {
    id: job.id,
    question: jobLine(job.label),
    status: STATUS[job.status],
    result: job.result?.trim() || null,
    error: job.error,
    asked: answerQuestion(questions),
    read: [...new Set(questions.flatMap((question) => question.tables ?? []).map(tableWords))],
    tried: parseTried(job.tools),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    nextTry: job.status === "WAITING" ? job.runAfter.toISOString() : null,
  };
}
