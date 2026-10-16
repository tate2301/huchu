import type { ListActionRun } from "@/lib/retail/asks/runs";

import { named, REASON_FIELD, run } from "./words";

const ITEMS: [string, string] = ["item", "items"];

/** The Library list's actions: make copies, back to draft, retire, delete. */
export const LIBRARY_RUNS: Record<string, ListActionRun> = {
  "library-duplicate": run(undefined, "copied as drafts", ITEMS),
  "library-unpublish": run(
    (count, rows) => ({
      title: `Take ${named(count, rows, ITEMS)} back to draft?`,
      body: `${count === 1 ? "It leaves" : "They leave"} every workspace's library now. Copies workspaces already made stay theirs. Publish again when ready.`,
      keep: "Keep published",
      go: "Back to draft",
      fill: "action",
    }),
    "back to draft",
    ITEMS,
  ),
  "library-retire": run(
    (count, rows) => ({
      title: `Retire ${named(count, rows, ITEMS)}?`,
      body: `${count === 1 ? "It leaves" : "They leave"} every workspace's library now, and stay${count === 1 ? "s" : ""} here on the Retired tab. Copies workspaces already made stay theirs.`,
      keep: "Keep",
      go: "Retire",
      fill: "action",
      field: { ...REASON_FIELD, needed: "Say why, so the next operator knows." },
    }),
    "retired",
    ITEMS,
  ),
  "library-delete": run(
    (count, rows) => ({
      title: `Delete ${named(count, rows, ITEMS)}?`,
      body: `${count === 1 ? "It is" : "They are"} gone from the library for good. Only drafts and retired items can be deleted; copies workspaces made stay theirs.`,
      keep: "Keep",
      go: "Delete",
      fill: "bad",
    }),
    "deleted",
    ITEMS,
  ),
};
