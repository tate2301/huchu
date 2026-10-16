import type { ListActionRun } from "@/lib/retail/asks/runs";

import { named, run } from "./words";

const PAYMENTS: [string, string] = ["payment", "payments"];

/** Payments: confirming the money arrived, or that it never will. */
export const PAYMENT_RUNS: Record<string, ListActionRun> = {
  "payments-confirm": run(
    (count, rows) => ({
      title: `Confirm ${named(count, rows, PAYMENTS)} as paid?`,
      body: `Only once the money shows on the statement under ${count === 1 ? "its reference" : "each reference"}. Each workspace's subscription is extended by the months its payment was for.`,
      keep: "Not yet",
      go: "Confirm as paid",
      fill: "action",
    }),
    "confirmed as paid",
    PAYMENTS,
  ),
  "payments-fail": run(
    (count, rows) => ({
      title: `Mark ${named(count, rows, PAYMENTS)} as failed?`,
      body: `Nothing is extended, and the customer can pay again. ${count === 1 ? "The reason goes" : "The reason goes on each"} on the customer's record.`,
      keep: "Keep open",
      go: "Mark as failed",
      fill: "bad",
      field: { key: "reason", label: "Why", placeholder: "Not on the statement after 48 hours", min: 3, max: 300, needed: "Say why it failed." },
    }),
    "marked as failed",
    PAYMENTS,
  ),
};
