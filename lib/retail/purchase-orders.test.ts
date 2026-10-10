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
  it("is a draft until anything comes, part delivered, then received", () => {
    expect(orderStatusFor([{ ...castle, receivedQuantity: 0 }, coke], false)).toBe("DRAFT");
    expect(orderStatusFor([castle, coke], false)).toBe("PARTIAL");
    expect(orderStatusFor([{ ...castle, receivedQuantity: 48 }, { ...coke, receivedQuantity: 24 }], false)).toBe(
      "RECEIVED",
    );
  });

  it("compares quantities as numbers, not as text", () => {
    // "9" >= "14" is true as strings; 9 of 14 is still part delivered.
    expect(orderStatusFor([{ quantity: 14, receivedQuantity: 9 }], false)).toBe("PARTIAL");
  });

  it("stays closed once the shop stops waiting", () => {
    expect(orderStatusFor([castle], true)).toBe("CLOSED");
    expect(isOpenForDelivery("CLOSED")).toBe(false);
    expect(isOpenForDelivery("RECEIVED")).toBe(false);
    expect(isOpenForDelivery("PARTIAL")).toBe(true);
  });

  it("never owes a negative", () => {
    expect(outstanding({ quantity: 10, receivedQuantity: 12 }).toNumber()).toBe(0);
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
