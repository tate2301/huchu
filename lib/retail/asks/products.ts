import type { ReportRow } from "@/lib/reports/types";
import type { Ask } from "@/lib/workspace/ask";
import { formatCount } from "@/lib/workspace/format";

import type { ListActionRun } from "./runs";

/** A product's ⋯ › Stop selling it (20-products 5.28 `archive`). */
export function archiveAsk({ name, onHand }: { name: string; onHand: string | null }): Ask {
  const stock = onHand ? `Its ${onHand} in stock stay and still count.` : "Its stock stays and still counts.";
  return {
    title: `Stop selling ${name}?`,
    body: `It leaves every till and reorder suggestion now. ${stock} You can sell it again from its page.`,
    keep: "Keep selling it",
    go: "Stop selling it",
    fill: "action",
  };
}

/** Products › tick rows › Archive (20-products 5.28 `archivemany`). */
export function archiveManyAsk(count: number): Ask {
  if (count === 1) {
    return {
      title: "Stop selling 1 product?",
      body: "It leaves every till and reorder suggestion now. Its stock stays and still counts. You can sell it again from the Archived tab.",
      keep: "Keep selling it",
      go: "Stop selling it",
      fill: "action",
    };
  }
  return {
    title: `Stop selling ${formatCount(count)} products?`,
    body: "They leave every till and reorder suggestion now. Their stock stays and still counts. You can sell them again from the Archived tab.",
    keep: "Keep selling them",
    go: "Stop selling them",
    fill: "action",
  };
}

const nameOf = (rows: ReportRow[]) => (rows.length === 1 && rows[0]?.name ? String(rows[0].name) : null);

/** One ticked product with its row to hand reads as that product; anything else as a count. */
function stopSelling(count: number, rows: ReportRow[]): Ask {
  const name = count === 1 ? nameOf(rows) : null;
  if (name) return archiveAsk({ name, onHand: rows[0]?.onHandLabel ? String(rows[0].onHandLabel) : null });
  return archiveManyAsk(count);
}

const offTill = (count: number, rows: ReportRow[]) => {
  const name = count === 1 ? nameOf(rows) : null;
  return name ? `${name} is off every till.` : `${formatCount(count)} products are off every till.`;
};

const backOnSale = (count: number, rows: ReportRow[]) => {
  const name = count === 1 ? nameOf(rows) : null;
  return name ? `${name} is on sale again.` : `${formatCount(count)} products are on sale again.`;
};

/** The Products list's actions that post to the server (`do: { run }`). */
export const PRODUCT_LIST_RUNS: Record<string, ListActionRun> = {
  archive: { ask: stopSelling, done: offTill },
  archivemany: { ask: stopSelling, done: offTill },
  unarchive: { done: backOnSale },
};
