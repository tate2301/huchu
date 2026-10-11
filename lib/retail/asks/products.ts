import type { ReportRow } from "@/lib/reports/types";
import type { Ask } from "@/lib/workspace/ask";
import { voidAskWords } from "@/lib/retail/vouchers/words";
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

/** A price list's rules sheet › Delete this list (PRD-05 `pricelistdelete`). */
export function priceListDeleteAsk(name: string, defaultName = "Retail"): Ask {
  return {
    title: `Delete ${name}?`,
    body: `Tills stop using it now and charge the ${defaultName} price instead. Sales keep the prices they were rung at. It stays in the bin for 30 days.`,
    keep: "Keep it",
    go: "Delete this list",
    fill: "bad",
  };
}

const listsWord = (count: number, rows: ReportRow[]) => {
  const name = count === 1 ? nameOf(rows) : null;
  return name ?? `${formatCount(count)} ${count === 1 ? "price list" : "price lists"}`;
};

/** A worksheet's "Remove from this list" (PRD-07 `removefromlist`): the list and the default it falls back to come with the rows. */
export function removeFromListAsk(count: number, list: string, defaultName: string): Ask {
  const products = count === 1 ? "1 product" : `${formatCount(count)} products`;
  return {
    title: `Remove ${products} from ${list}?`,
    body: `Tills charge ${count === 1 ? "it" : "them"} at the ${defaultName} price wherever ${list} applied. ${count === 1 ? "Its" : "Their"} price history stays.`,
    keep: count === 1 ? "Keep it" : "Keep them",
    go: `Remove from ${list}`,
    fill: "bad",
  };
}

const rowWord = (rows: ReportRow[], key: string, fallback: string) => (rows[0]?.[key] ? String(rows[0][key]) : fallback);

/** Price lists' actions that post the ticked ids (PRD-05, PRD-07). */
export const PRICE_LIST_RUNS: Record<string, ListActionRun> = {
  removefromlist: {
    ask: (count, rows) => removeFromListAsk(count, rowWord(rows, "listName", "this list"), rowWord(rows, "defaultListName", "Retail")),
    body: (ids) => ({ productIds: ids }),
    done: (count, rows) =>
      `${count === 1 ? (nameOf(rows) ?? "1 product") : `${formatCount(count)} products`} left ${rowWord(rows, "listName", "the list")}.`,
  },
  pricelistduplicate: {
    done: (count, rows) => (count === 1 && nameOf(rows) ? `${nameOf(rows)} copied. The copy is a draft.` : `${formatCount(count)} price lists copied as drafts.`),
  },
  pricelistpause: {
    done: (count, rows) => `${listsWord(count, rows)} ${count === 1 ? "is" : "are"} paused. Tills stop charging ${count === 1 ? "it" : "them"} within a minute.`,
  },
  pricelistresume: {
    done: (count, rows) => `${listsWord(count, rows)} ${count === 1 ? "is" : "are"} on. Tills pick ${count === 1 ? "it" : "them"} up within a minute.`,
  },
};

/** A bundle's "Stop selling it" (PRD-08 `bundlestop`), on its record and its edit sheet. */
export function bundleStopAsk(name: string): Ask {
  return {
    title: `Stop selling ${name}?`,
    body: "It leaves every till and is no longer offered when its items are in a sale. Its sales history stays.",
    keep: "Keep it",
    go: "Stop selling it",
    fill: "bad",
  };
}

const bundlesWord = (count: number, rows: ReportRow[]) => (count === 1 ? (nameOf(rows) ?? "1 bundle") : `${formatCount(count)} bundles and packs`);

/** Bundles and packs' actions that post the ticked ids (PRD-08). */
export const BUNDLE_LIST_RUNS: Record<string, ListActionRun> = {
  bundlepause: {
    done: (count, rows) => `${bundlesWord(count, rows)} ${count === 1 ? "is" : "are"} paused. The tills stop offering ${count === 1 ? "it" : "them"}.`,
  },
  bundleresume: {
    done: (count, rows) => `${bundlesWord(count, rows)} ${count === 1 ? "is" : "are"} on sale again.`,
  },
  bundleduplicate: {
    done: (count, rows) => (count === 1 && nameOf(rows) ? `${nameOf(rows)} copied.` : `${formatCount(count)} bundles copied.`),
  },
};

/** A promotion's "End now" (PRD-09 `promoend`), on its record, its edit sheet and its row. */
export function promotionEndAsk(code: string): Ask {
  return {
    title: `End ${code} now?`,
    body: "It stops at the next sale on every till. What it sold and gave away stays on its page. An ended promotion cannot start again; duplicate it instead.",
    keep: "Keep it running",
    go: "End it now",
    fill: "bad",
  };
}

/** Promotions › tick rows › End now (PRD-09 `promoendmany`). */
export function promotionEndManyAsk(count: number): Ask {
  if (count === 1) return { ...promotionEndAsk("1 promotion"), title: "End 1 promotion now?" };
  return {
    title: `End ${formatCount(count)} promotions now?`,
    body: "They stop at the next sale on every till. What they sold and gave away stays on their pages. An ended promotion cannot start again; duplicate it instead.",
    keep: "Keep them running",
    go: "End them now",
    fill: "bad",
  };
}

const codeOf = (rows: ReportRow[]) => (rows.length === 1 && rows[0]?.code ? String(rows[0].code) : null);
const promotionsWord = (count: number, rows: ReportRow[]) => (count === 1 ? (nameOf(rows) ?? "1 promotion") : `${formatCount(count)} promotions`);

/** Promotions' actions that post the ticked ids (PRD-09). */
export const PROMOTION_LIST_RUNS: Record<string, ListActionRun> = {
  promopause: {
    done: (count, rows) => `${promotionsWord(count, rows)} ${count === 1 ? "is" : "are"} paused. The tills stop applying ${count === 1 ? "it" : "them"}.`,
  },
  promoresume: {
    done: (count, rows) => `${promotionsWord(count, rows)} ${count === 1 ? "runs" : "run"} again.`,
  },
  promoend: {
    ask: (count, rows) => (count === 1 && codeOf(rows) ? promotionEndAsk(codeOf(rows)!) : promotionEndManyAsk(count)),
    done: (count, rows) => `${promotionsWord(count, rows)} ${count === 1 ? "has" : "have"} ended.`,
  },
  promoendmany: {
    ask: (count, rows) => (count === 1 && codeOf(rows) ? promotionEndAsk(codeOf(rows)!) : promotionEndManyAsk(count)),
    done: (count, rows) => `${promotionsWord(count, rows)} ${count === 1 ? "has" : "have"} ended.`,
  },
  promoduplicate: {
    done: (count, rows) =>
      count === 1 && nameOf(rows) ? `${nameOf(rows)} copied. The copy starts tomorrow.` : `${formatCount(count)} promotions copied. The copies start tomorrow.`,
  },
};

/**
 * A voucher's ⋯ › Void it, and Vouchers' bulk Void (PRD-10 `voidvoucher`):
 * "Void GV-0019?" / "US$7.40 left on it can no longer be spent. …", with the
 * required reason that shows in Activity.
 */
export function voidVoucherAsk(input: { code: string | null; count: number; left: string | null }): Ask {
  const one = input.count === 1;
  return {
    title: one && input.code ? `Void ${input.code}?` : `Void ${formatCount(input.count)} vouchers?`,
    body: one
      ? voidAskWords(input.left)
      : "What is left on them can no longer be spent. The books write it off, and each shows in Activity with your reason.",
    keep: one ? "Keep it" : "Keep them",
    go: one ? "Void it" : "Void them",
    fill: "bad",
    field: { key: "reason", label: "Why", placeholder: "Printed twice, for example", min: 3, max: 300, needed: "Say why you are voiding it." },
  };
}

/** Vouchers' actions that post the ticked ids (PRD-10). */
export const VOUCHER_LIST_RUNS: Record<string, ListActionRun> = {
  voidvoucher: {
    ask: (count, rows) =>
      voidVoucherAsk({
        code: codeOf(rows),
        count,
        // The money left on the one ticked, as its row reads it ("US$7.40"); a discount voucher has none.
        left: rows.length === 1 && rows[0]?.kindKey !== "DISCOUNT" && rows[0]?.left ? String(rows[0].left) : null,
      }),
    done: (count, rows, answer) => {
      const voided = (answer as { voided?: number } | null)?.voided ?? count;
      if (voided === 0) return { title: "Nothing was voided: they were voided or expired already.", variant: "warning" };
      return count === 1 && codeOf(rows) ? `${codeOf(rows)} is void.` : `${formatCount(voided)} vouchers voided.`;
    },
  },
  sendvoucher: {
    done: (_count, rows, answer) => (answer as { message?: string } | null)?.message ?? `${codeOf(rows) ?? "The voucher"} sent on WhatsApp.`,
    body: () => ({}),
  },
};
