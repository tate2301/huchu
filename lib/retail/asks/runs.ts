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
  done: (count: number, rows: ReportRow[], answer?: unknown) => string;
};
