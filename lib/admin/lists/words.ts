import type { ReportRow } from "@/lib/reports/types";
import type { ListActionRun } from "@/lib/retail/asks/runs";
import type { Ask } from "@/lib/workspace/ask";
import { formatCount } from "@/lib/workspace/format";

/**
 * The words around an admin list's bulk and row actions: what each asks
 * before it runs and what it says after. The server answers each with
 * `{ done, refused: [{ name, error }] }`; a run where some were refused says
 * how many went through and names the first that did not.
 */

export type BulkAnswer = { done: number; refused: Array<{ id: string; name: string; error: string }> };

export const REASON_FIELD = {
  key: "reason",
  label: "Why",
  placeholder: "What happened, and who asked",
  min: 3,
  max: 300,
  needed: "Say why, so the owner can see it in their audit log.",
} as const;

/** "Kopje Scrap Metals" for one row the page holds, else "3 workspaces". */
export function named(count: number, rows: ReportRow[], noun: [one: string, many: string]): string {
  if (count === 1 && rows[0]?.name) return String(rows[0].name);
  return `${formatCount(count)} ${count === 1 ? noun[0] : noun[1]}`;
}

/** The toast: what went through, then what did not. */
export function doneWords(answer: unknown, past: string, noun: [one: string, many: string]) {
  const { done, refused } = (answer ?? { done: 0, refused: [] }) as BulkAnswer;
  const head = `${formatCount(done)} ${done === 1 ? noun[0] : noun[1]} ${past}.`;
  if (!refused?.length) return head;
  const first = refused[0]!;
  const rest = refused.length > 1 ? ` ${formatCount(refused.length - 1)} more could not be either.` : "";
  return { title: `${head} ${first.name} could not be: ${first.error}${rest}`, variant: "warning" as const };
}

export function run(ask: ((count: number, rows: ReportRow[]) => Ask) | undefined, past: string, noun: [string, string]): ListActionRun {
  return { ask, done: (_count, _rows, answer) => doneWords(answer, past, noun) };
}
