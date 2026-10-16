import type { ListActionRun } from "@/lib/retail/asks/runs";

import { named, run } from "./words";

const OPERATORS: [string, string] = ["operator", "operators"];

/** Operators: an authenticator reset, and removing someone for good. */
export const OPERATOR_RUNS: Record<string, ListActionRun> = {
  "operators-reset-authenticator": run(
    (count, rows) => ({
      title: `Reset ${count === 1 && rows[0]?.name ? `${String(rows[0].name)}'s authenticator` : `${count} authenticators`}?`,
      body: "For a lost or replaced phone. They are signed out everywhere, and set up a new authenticator at their next sign-in with their password.",
      keep: "Not now",
      go: "Reset authenticator",
      fill: "action",
    }),
    "reset",
    OPERATORS,
  ),
  "operators-remove": run(
    (count, rows) => {
      const what = count === 1 ? "1 operator" : `${count} operators`;
      return {
        title: `Remove ${named(count, rows, OPERATORS)}?`,
        body:
          count === 1
            ? "They are signed out everywhere, any sign-in-as they have open ends, and they cannot sign in again. This cannot be undone. What they did stays in the audit log under their name."
            : "Each is signed out everywhere, any sign-in-as they have open ends, and none of them can sign in again. This cannot be undone. What they did stays in the audit log under their names.",
        keep: "Keep",
        go: "Remove",
        fill: "bad",
        field: { key: "reason", label: "Why", placeholder: "Left Corelith on 14 Oct", min: 3, max: 300, needed: "Say why, for the audit log." },
        typed: { label: `Type “remove ${what}” to go ahead`, text: `remove ${what}` },
      };
    },
    "removed",
    OPERATORS,
  ),
};
