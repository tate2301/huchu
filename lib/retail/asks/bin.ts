import type { ReportRow } from "@/lib/reports/types";
import type { Ask } from "@/lib/workspace/ask";
import { formatCount } from "@/lib/workspace/format";

import type { ListActionRun } from "./runs";

/**
 * Setup › Bin's actions (80-admin 5.10, W-63). A bin row's id is
 * `<kind>:<id>` ("product:3f2…"), because one list holds every kind; the
 * endpoints take `{ items: [{ kind, id }] }`.
 */

/** "product:3f2…" → `{ kind: "product", id: "3f2…" }`. */
export function binItem(rowId: string): { kind: string; id: string } {
  const at = rowId.indexOf(":");
  return { kind: rowId.slice(0, at), id: rowId.slice(at + 1) };
}

const nameOf = (count: number, rows: ReportRow[]) => (count === 1 && rows[0]?.what ? String(rows[0].what) : null);

/** The bin's "Delete for good", one or several (`deleteforgood`). */
export function deleteForGoodAsk(count: number, rows: ReportRow[] = []): Ask {
  const name = nameOf(count, rows);
  if (count === 1) {
    return {
      title: `Delete ${name ?? "1 thing"} for good?`,
      body: "It cannot be restored. Anything sold, paid or counted against it stays in the records, under its old name.",
      keep: "Keep it",
      go: "Delete for good",
      fill: "bad",
    };
  }
  return {
    title: `Delete ${formatCount(count)} things for good?`,
    body: "They cannot be restored. Anything sold, paid or counted against them stays in the records, under their old names.",
    keep: "Keep them",
    go: "Delete for good",
    fill: "bad",
  };
}

type RestoreAnswer = { restored?: number; refused?: Array<{ name: string; why: string }> };

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * "Restored. It is back in every list." for one, "3 restored. They are back
 * in every list." for several; with a refusal, how many came back and why
 * the first did not ("2 restored. Spirits did not come back. There is
 * already a category called Spirits. …").
 */
export function restoredToast(count: number, answer: unknown): string | { title: string; variant: "warning" } {
  const body = (answer ?? {}) as RestoreAnswer;
  const restored = body.restored ?? count;
  const refused = body.refused ?? [];
  if (refused.length === 0) {
    return restored === 1 ? "Restored. It is back in every list." : `${formatCount(restored)} restored. They are back in every list.`;
  }
  const first = refused[0]!;
  const others = refused.length - 1;
  const title = [
    restored > 0 ? `${formatCount(restored)} restored.` : null,
    `${first.name} did not come back. ${sentence(first.why)}`,
    others > 0 ? `${formatCount(others)} more did not either.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return { title, variant: "warning" };
}

const items = (ids: string[]) => ({ items: ids.map(binItem) });

/** The bin list's actions that post to the server (`do: { run }`). */
export const BIN_LIST_RUNS: Record<string, ListActionRun> = {
  restorebin: { body: items, done: (count, _rows, answer) => restoredToast(count, answer) },
  deleteforgood: { body: items, ask: deleteForGoodAsk, done: () => "Deleted for good." },
};
