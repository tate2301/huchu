import type { ReportRow } from "@/lib/reports/types";
import type { ListActionRun } from "@/lib/retail/asks/runs";
import { formatCount } from "@/lib/workspace/format";

import { named, REASON_FIELD, run } from "./words";

const MEMBERS: [string, string] = ["member", "members"];

/** "in Kopje Scrap Metals" when every row the page holds is in one workspace; else nothing. */
function inWorkspace(rows: ReportRow[]): string {
  const names = new Set(rows.map((row) => row.workspaceName).filter(Boolean));
  return names.size === 1 ? ` in ${[...names][0]}` : "";
}

/** Members' and People's actions: sign out everywhere, remove access, give it back, delete. */
export const MEMBER_RUNS: Record<string, ListActionRun> = {
  "members-sign-out": run(
    (count, rows) => ({
      title: `Sign ${named(count, rows, MEMBERS)} out everywhere?`,
      body: `Every browser and till they are signed in on${inWorkspace(rows)} ends on its next click, and so does anyone from support signed in as them. They sign in again with their password or an emailed code.`,
      keep: "Keep them signed in",
      go: "Sign out everywhere",
      fill: "action",
    }),
    "signed out everywhere",
    MEMBERS,
  ),
  "members-remove": run(
    (count, rows) => ({
      title: count === 1 ? `Remove ${named(count, rows, MEMBERS)}'s access${inWorkspace(rows)}?` : `Remove access for ${named(count, rows, MEMBERS)}${inWorkspace(rows)}?`,
      body: `${count === 1 ? "They are" : "Each is"} signed out everywhere and cannot sign in by password, emailed code or till PIN. Their records stay. You can give access back. The owner sees your reason in their audit log.`,
      keep: "Keep their access",
      go: "Remove access",
      fill: "bad",
      field: REASON_FIELD,
    }),
    "lost access",
    MEMBERS,
  ),
  "members-give-back": run(
    (count, rows) => ({
      title: `Give ${named(count, rows, MEMBERS)} access${inWorkspace(rows)} again?`,
      body: `${count === 1 ? "They" : "Each"} can sign in again at once, with the role they had.`,
      keep: "Not now",
      go: "Give access back",
      fill: "action",
    }),
    "got their access back",
    MEMBERS,
  ),
  "members-delete": run(
    (count, rows) => {
      const what = count === 1 ? "1 member" : `${formatCount(count)} members`;
      return {
        title: `Delete ${named(count, rows, MEMBERS)}${inWorkspace(rows)} for good?`,
        body: `Only someone no record points at can be deleted: no sale, report or change of theirs. Anyone who has records is left as they are, and named, so you can remove their access instead. This cannot be undone. The audit log keeps a line saying who deleted ${count === 1 ? "them" : "each"} and why.`,
        keep: "Keep",
        go: "Delete for good",
        fill: "bad",
        field: REASON_FIELD,
        typed: { label: `Type “delete ${what}” to go ahead`, text: `delete ${what}` },
      };
    },
    "deleted for good",
    MEMBERS,
  ),
};
