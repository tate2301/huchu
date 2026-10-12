import type { ReportRow } from "@/lib/reports/types";

import { binAsk } from "./frame";
import type { ListActionRun } from "./runs";

/**
 * Customers' list actions that post (CUS-02): a row's "Move to the bin", the
 * Record board's bin ask, then `POST /api/v2/retail/bin { kind: "customer", id }`.
 */

const nameOf = (rows: ReportRow[]) => (rows[0]?.name ? String(rows[0].name) : "this customer");

export const CUSTOMER_LIST_RUNS: Record<string, ListActionRun> = {
  bincustomer: {
    ask: (_count, rows) => binAsk({ title: nameOf(rows) }),
    body: (ids) => ({ kind: "customer", id: ids[0] }),
    done: (_count, rows) => `${nameOf(rows)} moved to the bin.`,
  },
};
