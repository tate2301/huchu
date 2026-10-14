import { z } from "zod";

import type { AskedQuestion } from "./jobs";

/**
 * Explain a figure on a report (PageVaneReport). A person presses Explain on
 * a figure; that press gives Vane a job of its own (kind `explain`), which the
 * worker runs like any other: Claude reads the workspace with `run_sql` and
 * answers in a sentence or two, keeping each question it asked and the rows it
 * drew. The answer shows beside the report, with the SQL and the rows.
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

/** What the person asks, in their words: "What is behind Lost, $1,458,600.00?" */
export function explainQuestion(about: Pick<ExplainAbout, "figure" | "value">): string {
  return `What is behind ${about.figure}, ${about.value}?`;
}

/** The whole instruction the worker hands Claude: the question, and the report it is about. */
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
    "If the breakdown is worth keeping as a view of its own, raise one suggestion card that says so; otherwise raise nothing.",
  ].join("\n");
}

/** Whether a job is an explanation, from its key. */
export function isExplainJob(job: { kind: string }): boolean {
  return job.kind === "explain";
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
});

const logSchema = z.array(z.object({ name: z.string(), ok: z.boolean().optional(), question: questionSchema.optional() }).passthrough());

/** Each question a job's `run_sql` calls answered, in the order they ran (`jobs.ts` keeps them on the tool log). */
export function parseQuestions(tools: unknown): AskedQuestion[] {
  const parsed = logSchema.safeParse(tools);
  if (!parsed.success) return [];
  return parsed.data.flatMap((call) => (call.question ? [call.question] : []));
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
