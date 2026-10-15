import { describe, expect, it } from "vitest";

import { shapeVaneOrders } from "./vane-orders";

const order = (over: Record<string, unknown>) => ({
  id: String(over.poNo),
  poNo: "PO-0218",
  status: "DRAFT" as const,
  madeByVane: true,
  createdById: null,
  expectedDate: null,
  createdAt: new Date("2026-10-14T07:00:00Z"),
  vendor: { name: "Delta Beverages", deliversOn: "Tuesdays" },
  lines: [
    { inventoryItemId: "castle", itemName: "Castle Lager 340 ml", lineTotal: 1000 },
    { inventoryItemId: "zambezi", itemName: "Zambezi Lager", lineTotal: 412.4 },
  ],
  receivedAt: null,
  ...over,
});

describe("orders Vane drafted", () => {
  it("say how many wait and for how many products, as the board does, above the shop's latest orders", () => {
    const view = shapeVaneOrders({
      drafts: [
        order({ poNo: "PO-0218" }),
        order({ poNo: "PO-0219", vendor: { name: "Southern Wines", deliversOn: "Thursdays" }, lines: [{ inventoryItemId: "wine", itemName: "Four Cousins", lineTotal: 628 }] }),
      ],
      others: [
        order({ poNo: "PO-0216", status: "RECEIVED", madeByVane: false, createdById: "u", receivedAt: new Date("2026-10-06T09:00:00Z") }),
        order({ poNo: "PO-0215", status: "SENT", madeByVane: false, createdById: "u", expectedDate: new Date("2026-10-08T00:00:00Z") }),
        // Vane's, but a person has taken it on: theirs now.
        order({ poNo: "PO-0214", createdById: "u", expectedDate: new Date("2026-10-20T00:00:00Z"), vendor: { name: "Delta Beverages", deliversOn: null } }),
      ],
      timeZone: "Africa/Harare",
    });
    expect(view.waiting).toBe(2);
    expect(view.finding).toEqual({
      fact: "2 orders are drafted for the 3 products running low.",
      rest: "Vane drafted one per usual supplier from Stock to reorder. They go when you send them.",
    });
    expect(view.rows.map((row) => [row.poNo, row.lines, row.value, row.stateLabel, row.delivers])).toEqual([
      ["PO-0218", "2 products", 1412.4, "Vane’s draft", "Usual, Tuesdays"],
      ["PO-0219", "1 product", 628, "Vane’s draft", "Usual, Thursdays"],
      ["PO-0216", "2 products", 1412.4, "Received", "6 Oct"],
      ["PO-0215", "2 products", 1412.4, "Sent", "8 Oct"],
      ["PO-0214", "2 products", 1412.4, "Draft", "Expected 20 Oct"],
    ]);
  });

  it("says when nothing of Vane's waits", () => {
    expect(shapeVaneOrders({ drafts: [], others: [], timeZone: "Africa/Harare" }).finding.fact).toBe("No order of Vane’s waits for you.");
  });
});
