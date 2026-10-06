import type { ReportRow } from "@/lib/reports/types";
import type { Ask } from "@/lib/workspace/ask";

/**
 * A list action that posts the ticked ids (`ListAction` `do: { run }`): the
 * ask before it, when it needs one, and the toast after. Worked out from how
 * many were ticked and the rows the page holds for them (none past the page
 * after "Select all"), and for the toast, what the server answered.
 */
export type ListActionRun = {
  ask?: (count: number, rows: ReportRow[]) => Ask;
  /** The toast; a warning when the server refused some of it ("2 restored. … cannot come back first."). */
  done: (count: number, rows: ReportRow[], answer?: unknown) => string | { title: string; variant: "warning" };
  /** The POST body, when the endpoint takes more than `{ ids }` (the bin's `{ items: [{ kind, id }] }`). */
  body?: (ids: string[], rows: ReportRow[]) => unknown;
  /** Something to show once it is done, from the answer: the PINs WhatsApp did not take. Only "keep" is offered. */
  after?: (answer: unknown) => Ask | null;
};
