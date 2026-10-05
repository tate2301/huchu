import { describe, expect, it } from "vitest";

import {
  archiveAsk,
  archiveManyAsk,
  binAsk,
  cancelRequisitionAsk,
  closeShortAsk,
  LIST_ACTION_RUNS,
  removeOrderAsk,
  restorableUntil,
} from "./index";

describe("the Record board's asks", () => {
  it("bin: restorable for 30 days, said as a day and month in Harare", () => {
    const movedAt = new Date("2026-10-03T22:30:00Z"); // 4 October 00:30 in Harare
    expect(restorableUntil(movedAt).toISOString()).toBe("2026-11-02T22:30:00.000Z");
    expect(binAsk({ title: "Castle Lager 340ml", movedAt })).toEqual({
      title: "Move Castle Lager 340ml to the bin?",
      body: "It leaves every list and search today. Anything sold, paid or counted against it stays exactly as it is. You can restore it from the bin until 3 November.",
      keep: "Keep it",
      go: "Move to the bin",
      fill: "bad",
    });
  });

  it("closeshort: what is still to come, the value and the supplier", () => {
    expect(
      closeShortAsk({ ref: "PO-0003", unitsToCome: 480, linesToCome: 4, value: 240, supplier: "Delta Beverages" }),
    ).toEqual({
      title: "Close PO-0003 with what came?",
      body: "480 units across 4 lines are still to come. Closing stops expecting them: the order is done at US$240.00, Delta Beverages is billed for what was delivered, and the lines stop showing as late. You can reopen it until a bill is recorded against it.",
      keep: "Keep waiting",
      go: "Close the order",
      fill: "action",
    });
    expect(
      closeShortAsk({ ref: "PO-0004", unitsToCome: 1, linesToCome: 1, value: 12.5, supplier: "Afdis" }).body,
    ).toMatch(/^1 unit across 1 line is still to come\./);
    expect(
      closeShortAsk({ ref: "PO-0005", unitsToCome: 1200, linesToCome: 6, value: 1284.6, supplier: "Afdis" }).body,
    ).toMatch(/^1,200 units across 6 lines are still to come\. .* done at US\$1,284\.60,/);
  });

  it("removeorder and cancelreq", () => {
    expect(removeOrderAsk({ ref: "PO-0006", supplier: "Delta Beverages" })).toEqual({
      title: "Remove PO-0006?",
      body: "Nothing has come against it and it was never sent, so nothing in stock or in the books changes. It goes to the bin for 30 days; Delta Beverages is not told.",
      keep: "Keep it",
      go: "Remove the order",
      fill: "bad",
    });
    expect(
      cancelRequisitionAsk({ ref: "RQ-0002", amount: 1940, orderRef: "PO-0005", asker: "Tafara Nyathi" }),
    ).toEqual({
      title: "Cancel RQ-0002?",
      body: "US$1,940.00 for order PO-0005 is no longer asked for. Tafara Nyathi, who asked, gets a message, and the order goes back to unpaid. Nothing was paid out, so no cash moves.",
      keep: "Keep it",
      go: "Cancel the requisition",
      fill: "bad",
    });
  });
});

describe("Products' asks (20-products 5.28)", () => {
  it("archive names the product and its stock; archivemany counts them", () => {
    expect(archiveAsk({ name: "Amarula Cream 750ml", onHand: "13 bottles" })).toEqual({
      title: "Stop selling Amarula Cream 750ml?",
      body: "It leaves every till and reorder suggestion now. Its 13 bottles in stock stay and still count. You can sell it again from its page.",
      keep: "Keep selling it",
      go: "Stop selling it",
      fill: "action",
    });
    expect(archiveManyAsk(4)).toEqual({
      title: "Stop selling 4 products?",
      body: "They leave every till and reorder suggestion now. Their stock stays and still counts. You can sell them again from the Archived tab.",
      keep: "Keep selling them",
      go: "Stop selling them",
      fill: "action",
    });
  });

  it("the list's runs: one ticked row reads as that product, more as a count", () => {
    const amarula = { id: "a", name: "Amarula Cream 750ml", onHandLabel: "13 bottles" };
    const run = LIST_ACTION_RUNS.archivemany!;
    expect(run.ask!(1, [amarula]).title).toBe("Stop selling Amarula Cream 750ml?");
    expect(run.ask!(2, [amarula, { id: "b", name: "Jameson" }]).title).toBe("Stop selling 2 products?");
    // "Select all" past the page: a count, without rows.
    expect(run.ask!(1, []).title).toBe("Stop selling 1 product?");
    expect(run.done(2, [])).toBe("2 products are off every till.");
    expect(LIST_ACTION_RUNS.archive!.done(1, [amarula])).toBe("Amarula Cream 750ml is off every till.");
    expect(LIST_ACTION_RUNS.unarchive!.ask).toBeUndefined();
    expect(LIST_ACTION_RUNS.unarchive!.done(1, [{ id: "z", name: "Zambezi Lager 375ml" }])).toBe(
      "Zambezi Lager 375ml is on sale again.",
    );
    expect(LIST_ACTION_RUNS.unarchive!.done(3, [])).toBe("3 products are on sale again.");
  });
});

describe("the category asks (20-products 5.28)", () => {
  it("categorydelete names the move, or only the bin when nothing is in it", async () => {
    const { categoryDeleteAsk } = await import("./index");
    expect(categoryDeleteAsk({ name: "Spirits", products: 61, into: "Spirits and liqueurs" })).toEqual({
      title: "Delete Spirits?",
      body: "Its 61 products move to Spirits and liqueurs first, with that category's VAT and age check. Spirits stays in the bin for 30 days.",
      keep: "Keep it",
      go: "Delete category",
      fill: "bad",
    });
    expect(categoryDeleteAsk({ name: "Mixers", products: 0, into: null }).body).toBe("Mixers stays in the bin for 30 days.");
  });

  it("categorymerge", async () => {
    const { categoryMergeAsk } = await import("./index");
    expect(categoryMergeAsk({ count: 2, into: "Beer", products: 9 })).toEqual({
      title: "Merge 2 categories into Beer?",
      body: "Their 9 products move into Beer and take its VAT and age check. The others go to the bin for 30 days.",
      keep: "Keep them apart",
      go: "Merge",
      fill: "action",
    });
  });
});
