import type { ListActionRun } from "@/lib/retail/asks/runs";

import { named, REASON_FIELD, run } from "./words";

const SITES: [string, string] = ["site", "sites"];

/** A workspace's Sites: close and reopen, one or many. */
export const SITE_RUNS: Record<string, ListActionRun> = {
  "sites-close": run(
    (count, rows) => ({
      title: `Close ${named(count, rows, SITES)}?`,
      body: `${count === 1 ? "It leaves" : "They leave"} the workspace's lists and filters, and ${count === 1 ? "its" : "their"} tills stop and are unpaired. Sales, stock movements and reports from there are kept, and ${count === 1 ? "it" : "they"} can be reopened. A default site, one with a shift open, or a shop's site with stock left is not closed.`,
      keep: "Keep open",
      go: count === 1 ? "Close site" : "Close sites",
      fill: "bad",
      field: REASON_FIELD,
    }),
    "closed",
    SITES,
  ),
  "sites-reopen": run(
    (count, rows) => ({
      title: `Reopen ${named(count, rows, SITES)}?`,
      body: `${count === 1 ? "It is" : "They are"} back in the workspace's lists as before. Tills there stay stopped until someone pairs them again from inside the workspace.`,
      keep: "Keep closed",
      go: "Reopen",
      fill: "action",
    }),
    "reopened",
    SITES,
  ),
};
