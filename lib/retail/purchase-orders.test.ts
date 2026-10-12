import { describe, expect, it } from "vitest";

import {
  isOpenForDelivery,
  matchDeliveryToOrder,
  orderStatusFor,
  OrderRefused,
  outstanding,
  planOrderLineEdits,
} from "./purchase-orders";

const castle = { id: "l1", itemName: "Castle Lager 340ml", inventoryItemId: "castle", quantity: 48, receivedQuantity: 24 };
const coke = { id: "l2", itemName: "Coca-Cola 500ml", inventoryItemId: "coke", quantity: 24, receivedQuantity: 0 };

describe("where an order stands", () => {
  const open = { closed: false, sent: true };

  it("is a draft until sent, sent until anything comes, part delivered, then received", () => {
    expect(orderStatusFor([{ ...castle, receivedQuantity: 0 }, coke], { closed: false, sent: false })).toBe("DRAFT");
    expect(orderStatusFor([{ ...castle, receivedQuantity: 0 }, coke], open)).toBe("SENT");
    expect(orderStatusFor([castle, coke], open)).toBe("PARTIAL");
    expect(orderStatusFor([{ ...castle, receivedQuantity: 48 }, { ...coke, receivedQuantity: 24 }], open)).toBe("RECEIVED");
  });

  it("compares quantities as numbers, not as text", () => {
    // "9" >= "14" is true as strings; 9 of 14 is still part delivered.
    expect(orderStatusFor([{ quantity: 14, receivedQuantity: 9 }], open)).toBe("PARTIAL");
  });

  it("counts a line closed short as done: closed once every line is in or closed short", () => {
    const short = { ...castle, closedShortAt: new Date("2026-10-01") };
    expect(orderStatusFor([short, coke], open)).toBe("PARTIAL");
    expect(orderStatusFor([short, { ...coke, receivedQuantity: 24 }], open)).toBe("CLOSED");
    expect(orderStatusFor([short, { ...coke, receivedQuantity: 3, closedShortAt: new Date() }], open)).toBe("CLOSED");
  });

  it("stays closed once the shop stops waiting, and is never inferred cancelled", () => {
    expect(orderStatusFor([castle], { closed: true, sent: true })).toBe("CLOSED");
    expect(orderStatusFor([{ ...coke }], open)).toBe("SENT");
  });

  it("takes a delivery while a draft, sent or part delivered, never once done", () => {
    for (const status of ["DRAFT", "SENT", "PARTIAL"] as const) expect(isOpenForDelivery(status)).toBe(true);
    for (const status of ["RECEIVED", "CLOSED", "CANCELLED"] as const) expect(isOpenForDelivery(status)).toBe(false);
  });

  it("never owes a negative, and owes nothing on a line closed short", () => {
    expect(outstanding({ quantity: 10, receivedQuantity: 12 }).toNumber()).toBe(0);
    expect(outstanding({ quantity: 240, receivedQuantity: 120, closedShortAt: new Date() }).toNumber()).toBe(0);
    expect(outstanding({ quantity: 240, receivedQuantity: 120, closedShortAt: null }).toNumber()).toBe(120);
  });
});

describe("editing an order", () => {
  it("updates named lines in place, creates new ones and removes the undelivered rest", () => {
    const plan = planOrderLineEdits([castle, coke], [
      { id: "l1", quantity: 60 },
      { quantity: 12, itemName: "Ice 2kg bag" },
    ]);
    expect(plan.update.map((row) => row.id)).toEqual(["l1"]);
    expect(plan.create).toHaveLength(1);
    expect(plan.remove).toEqual(["l2"]);
  });

  it("refuses to ask for fewer than have already come", () => {
    expect(() => planOrderLineEdits([castle], [{ id: "l1", quantity: 12 }])).toThrow(
      new OrderRefused("24 of Castle Lager 340ml have already come; the order cannot ask for fewer."),
    );
  });

  it("refuses to take a delivered line off the order", () => {
    expect(() => planOrderLineEdits([castle, coke], [{ id: "l2", quantity: 24 }])).toThrow(
      "Castle Lager 340ml has been delivered and cannot come off the order.",
    );
  });

  it("refuses a line from another order", () => {
    expect(() => planOrderLineEdits([castle], [{ id: "elsewhere", quantity: 1 }])).toThrow(OrderRefused);
  });
});

describe("a delivery against an order", () => {
  it("fills the line it names, or the first line of the same product still owing", () => {
    expect(
      matchDeliveryToOrder([castle, coke], [
        { inventoryItemId: "coke", quantity: 24 },
        { inventoryItemId: "castle", quantity: 10, purchaseOrderLineId: "l1" },
      ]),
    ).toEqual(["l2", "l1"]);
  });

  it("books a product the order did not have without touching the order", () => {
    expect(matchDeliveryToOrder([castle], [{ inventoryItemId: "ice", quantity: 5 }])).toEqual([null]);
  });

  it("refuses more than is still owed, counting earlier lines of the same delivery", () => {
    expect(() =>
      matchDeliveryToOrder([castle], [
        { inventoryItemId: "castle", quantity: 20 },
        { inventoryItemId: "castle", quantity: 5, purchaseOrderLineId: "l1" },
      ]),
    ).toThrow("Only 4 of Castle Lager 340ml are still to come on this order.");
  });

  it("fills a line ordered by name with whatever product is delivered against it", () => {
    const named = { id: "l3", itemName: "Mixers, assorted", inventoryItemId: null, quantity: 6, receivedQuantity: 0 };
    expect(matchDeliveryToOrder([named], [{ inventoryItemId: "tonic", quantity: 6, purchaseOrderLineId: "l3" }])).toEqual([
      "l3",
    ]);
  });
});
