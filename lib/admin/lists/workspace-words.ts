import type { ListActionRun } from "@/lib/retail/asks/runs";

import { named, REASON_FIELD, run } from "./words";

const WORKSPACES: [string, string] = ["workspace", "workspaces"];

/** The Workspaces list's actions: suspend, reinstate, sign everyone out, close, reopen, delete for good. */
export const WORKSPACE_RUNS: Record<string, ListActionRun> = {
  "workspaces-suspend": run(
    (count, rows) => ({
      title: `Suspend ${named(count, rows, WORKSPACES)}?`,
      body: `Nobody can sign in or use ${count === 1 ? "it" : "them"} until reinstated, and everyone is signed out now. The data stays as it is. The owner sees your reason in their audit log.`,
      keep: "Keep open",
      go: "Suspend",
      fill: "bad",
      field: REASON_FIELD,
    }),
    "suspended",
    WORKSPACES,
  ),
  "workspaces-reinstate": run(
    (count, rows) => ({
      title: `Reinstate ${named(count, rows, WORKSPACES)}?`,
      body: `Its members can sign in again at once. ${count === 1 ? "Its" : "Their"} standing goes back to what the subscription says.`,
      keep: "Keep suspended",
      go: "Reinstate",
      fill: "action",
      field: REASON_FIELD,
    }),
    "reinstated",
    WORKSPACES,
  ),
  "workspaces-sign-out": run(
    (count, rows) => ({
      title: `Sign everyone out of ${named(count, rows, WORKSPACES)}?`,
      body: "Every member's browsers and tills end on their next click, and so does anyone from support signed in as them. They sign in again with their password or an emailed code.",
      keep: "Keep them signed in",
      go: "Sign everyone out",
      fill: "action",
      field: REASON_FIELD,
    }),
    "signed out",
    WORKSPACES,
  ),
  "workspaces-close": run(
    (count, rows) => ({
      title: `Close ${named(count, rows, WORKSPACES)}?`,
      body: `Nobody gets in again until an owner reopens ${count === 1 ? "it" : "them"}. Everyone is signed out now. The data is kept; deleting it for good is a separate step on the Closed tab.`,
      keep: "Keep open",
      go: "Close",
      fill: "bad",
      field: REASON_FIELD,
    }),
    "closed",
    WORKSPACES,
  ),
  "workspaces-reopen": run(
    (count, rows) => ({
      title: `Reopen ${named(count, rows, WORKSPACES)}?`,
      body: `Its members can sign in again, and ${count === 1 ? "its" : "their"} standing goes back to what the subscription says.`,
      keep: "Keep closed",
      go: "Reopen",
      fill: "action",
      field: REASON_FIELD,
    }),
    "reopened",
    WORKSPACES,
  ),
  "workspaces-delete": run(
    (count, rows) => {
      const what = named(count, rows, WORKSPACES);
      return {
        title: `Delete ${what} for good?`,
        body: `Every record ${count === 1 ? "it holds" : "they hold"} — members, sales, stock, payroll, documents — is deleted now, and the address is freed. This cannot be undone. The audit log keeps a line saying who deleted ${count === 1 ? "it" : "them"} and why.`,
        keep: "Keep",
        go: "Delete for good",
        fill: "bad",
        field: REASON_FIELD,
        typed: { label: `Type “delete ${count === 1 ? "1 workspace" : `${count} workspaces`}” to go ahead`, text: `delete ${count === 1 ? "1 workspace" : `${count} workspaces`}` },
      };
    },
    "deleted for good",
    WORKSPACES,
  ),
};
