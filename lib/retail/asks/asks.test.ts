import { describe, expect, it } from "vitest";

import { binAsk, cancelRequisitionAsk, closeShortAsk, removeOrderAsk, restorableUntil } from "./index";

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
