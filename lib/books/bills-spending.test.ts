import { describe, expect, it } from "vitest";

import { dueLine, matchRows, termsWord } from "./bill-record";
import { billQuerySchema, billsFinding, comingSunday, readBillQuery } from "./bills";
import { claimFormErrors, claimPayload, voucherPayload, type ClaimForm } from "./claim-form";
import { claimsFinding, readClaimQuery } from "./claims-list";
import { orderFormErrors, orderPayload, orderTotals } from "./order-form";
import { orderTotal, ordersFinding, readOrderQuery, receivedShare, stillToCome } from "./orders";
import { paymentsOutFinding, readPaymentOutQuery } from "./payments-out";
import { periodRange } from "./period";
import { readRequisitionQuery, requisitionsFinding } from "./requisitions-list";
import { readSpendingQuery, spendingFinding } from "./spending";
import { ageLines, statementLines, suppliersFinding, suppliesOf } from "./suppliers";

describe("Bills (BkBills)", () => {
  it("opens on To pay, and reads its filters from the address", () => {
    expect(readBillQuery(new URLSearchParams())).toEqual({ view: "to-pay", q: "", supplier: null, fdms: null, period: "any", sort: "due", page: 1 });
    expect(readBillQuery(new URLSearchParams("view=debit-notes&fdms=VALID&period=this-month&page=2"))).toMatchObject({ view: "debit-notes", fdms: "VALID", period: "this-month", page: 2 });
    expect(billQuerySchema.parse({ view: "nonsense", fdms: "MAYBE" })).toMatchObject({ view: "to-pay", fdms: null });
  });

  it("says what is owed, by Sunday, and who is late", () => {
    expect(billsFinding({ amount: 8077.15, bills: 5, bySunday: 4897.15 }, [{ supplier: "Mutare Timber Works", days: 2, balance: 1859.55 }])).toEqual({
      fact: "You owe US$8,077.15 on 5 bills, US$4,897.15 by Sunday.",
      rest: "Mutare Timber Works' bill is 2 days late.",
    });
    expect(billsFinding({ amount: 0, bills: 0, bySunday: 0 }, []).fact).toBe("You owe no supplier anything.");
    expect(billsFinding({ amount: 100, bills: 2, bySunday: 0 }, [{ supplier: "A", days: 1, balance: 40 }, { supplier: "B", days: 3, balance: 60 }]).rest).toBe("2 are late, US$100.00 in all.");
  });

  it("ends the week on Sunday", () => {
    expect(comingSunday("2026-10-14")).toBe("2026-10-18");
    expect(comingSunday("2026-10-18")).toBe("2026-10-18");
  });
});

describe("one bill (BkBill)", () => {
  it("says when it is due as the board does", () => {
    expect(dueLine("overdue", "2026-10-16", "2026-10-18")).toBe("Due 16 Oct, 2 days ago");
    expect(dueLine("to-pay", "2026-10-30", "2026-10-18")).toBe("Due 30 Oct");
    expect(dueLine("to-pay", "2026-10-18", "2026-10-18")).toBe("Due today");
    expect(dueLine("paid", null, "2026-10-18")).toBe("Paid");
    expect(termsWord(null)).toBe("On delivery");
    expect(termsWord(7)).toBe("7 days");
  });

  it("matches what was ordered, received and billed, item by item, and marks a difference", () => {
    const rows = matchRows(
      [{ itemName: "Oak strip flooring, 14 mm", quantity: 40 }, { itemName: "Underlay", quantity: 40 }],
      [{ itemName: "Oak strip flooring, 14 mm", quantity: 40, day: "2026-10-12" }, { itemName: "Underlay", quantity: 38, day: "2026-10-12" }],
      [{ description: "Oak strip flooring, 14 mm", quantity: 40 }, { description: "Underlay", quantity: 40 }],
    );
    expect(rows[0]).toEqual({ item: "Oak strip flooring, 14 mm", ordered: "40", received: "40, 12 Oct", billed: "40", differs: false });
    expect(rows[1]).toMatchObject({ item: "Underlay", received: "38, 12 Oct", differs: true });
    // A bill made by hand against an order, nothing received yet: only order and bill are compared.
    expect(matchRows([{ itemName: "Fitting", quantity: 2 }], [], [{ description: "Fitting", quantity: 2 }])[0].differs).toBe(false);
  });
});

describe("Payments made (BkPaymentsOut)", () => {
  it("opens on All and reads its filters", () => {
    expect(readPaymentOutQuery(new URLSearchParams())).toMatchObject({ view: "all", period: "any", sort: "newest", page: 1 });
    expect(readPaymentOutQuery(new URLSearchParams("view=to-approve&sort=oldest"))).toMatchObject({ view: "to-approve", sort: "oldest" });
  });

  it("says what was paid this month and what waits", () => {
    expect(paymentsOutFinding(6088.9, [{ supplier: "Mutare Timber Works", amount: 1301.68 }])).toEqual({
      fact: "US$6,088.90 was paid out this month.",
      rest: "US$1,301.68 to Mutare Timber Works waits for approval.",
    });
    expect(paymentsOutFinding(0, []).fact).toBe("Nothing has been paid to suppliers this month.");
    expect(paymentsOutFinding(10, [{ supplier: "A", amount: 1 }, { supplier: null, amount: 2 }]).rest).toBe("2 payments wait for approval, US$3.00 in all.");
  });
});

describe("Purchase orders (BkOrders) and New order", () => {
  const lines = [
    { quantity: 40, receivedQuantity: 10, unitCost: 60, lineTotal: 2400, vatRate: 0 },
    { quantity: 10, receivedQuantity: 0, unitCost: 10, lineTotal: 100, vatRate: 15.5 },
  ];
  it("works out the total with VAT, what is still to come, and the share received", () => {
    expect(orderTotal(lines)).toBe(2515.5);
    expect(stillToCome(lines)).toBe(1915.5);
    expect(receivedShare(lines)).toBe(20);
    expect(receivedShare([])).toBe(0);
  });

  it("opens on Sent, and says what is on order and what waits", () => {
    expect(readOrderQuery(new URLSearchParams())).toMatchObject({ view: "sent", source: null, period: "any" });
    expect(ordersFinding(4962, [{ number: "PO-0035", amount: 2960, what: "Vinyl" }])).toEqual({ fact: "US$4,962.00 is on order and not yet received.", rest: "PO-0035, US$2,960.00 of vinyl, waits for approval." });
    expect(ordersFinding(0, []).fact).toBe("Nothing is on order.");
  });

  it("checks a new order and sends service lines without a stock item", () => {
    const form = { vendorId: "", expectedDate: "", note: "", lines: [{ itemName: "Fitter, 2 days", quantity: "2", unitCost: "45", vatRate: "0" }, { itemName: "", quantity: "1", unitCost: "", vatRate: "15.5" }] };
    expect(orderFormErrors(form)).toEqual({ vendorId: "Choose who it is ordered from." });
    expect(orderFormErrors({ ...form, vendorId: "v", lines: [{ itemName: "", quantity: "1", unitCost: "", vatRate: "0" }] })).toEqual({ lines: "Add at least one line." });
    expect(orderTotals(form.lines)).toEqual({ net: 90, tax: 0, total: 90 });
    expect(orderPayload({ ...form, vendorId: "v", note: " Before 10am " })).toEqual({ vendorId: "v", expectedDate: null, noteToSupplier: "Before 10am", lines: [{ itemName: "Fitter, 2 days", quantity: 2, unitCost: 45, vatRate: 0 }] });
  });
});

describe("Requisitions (BkRequisitions)", () => {
  it("opens on To approve", () => {
    expect(readRequisitionQuery(new URLSearchParams())).toMatchObject({ view: "to-approve", source: null, person: null });
    expect(readRequisitionQuery(new URLSearchParams("view=to-account&source=retail"))).toMatchObject({ view: "to-account", source: "retail" });
  });

  it("says what waits for this person and who has not accounted for theirs", () => {
    expect(requisitionsFinding({ count: 2, amount: 98 }, [{ name: "Simba Gondo", amount: 95 }])).toEqual({ fact: "2 requisitions wait for you, US$98.00.", rest: "Simba Gondo's US$95.00 is not accounted for yet." });
    expect(requisitionsFinding({ count: 0, amount: 0 }, []).fact).toBe("No requisition waits for you.");
    expect(requisitionsFinding({ count: 1, amount: 5 }, [{ name: "James", amount: 1 }]).rest).toBe("James' US$1.00 is not accounted for yet.");
  });
});

describe("Claims & petty cash (BkClaims) and Snap a slip (BkClaimPhone)", () => {
  it("says what waits for approval and to be paid back", () => {
    expect(claimsFinding([{ name: "Simba Gondo", amount: 23 }], [{ name: "Tinashe Moyo", amount: 36 }])).toEqual({ fact: "1 claim waits for you: Simba Gondo, US$23.00.", rest: "Tinashe Moyo's US$36.00 waits to be paid back." });
    expect(claimsFinding([], []).fact).toBe("No claim waits for you.");
    expect(readClaimQuery(new URLSearchParams("view=floats"))).toMatchObject({ view: "floats" });
  });

  const form: ClaimForm = { where: "Puma, Msasa", amount: "32.40", vat: "4.35", category: "FUEL", projectId: "", paidWith: "own", floatId: "", spentOn: "2026-10-18" };
  it("checks the slip: where, how much, VAT less than the amount, a float when paid from one", () => {
    expect(claimFormErrors(form)).toEqual({});
    expect(claimFormErrors({ ...form, where: "", amount: "0" })).toMatchObject({ where: expect.any(String), amount: expect.any(String) });
    expect(claimFormErrors({ ...form, vat: "40" }).vat).toMatch(/Less than/);
    expect(claimFormErrors({ ...form, paidWith: "float" }).floatId).toBeTruthy();
  });

  it("sends a claim for approval at once, or a voucher from the float", () => {
    expect(claimPayload(form, "USD", "https://blob/slip.jpg")).toEqual({
      currency: "USD",
      notes: "Puma, Msasa",
      send: true,
      lines: [{ category: "FUEL", description: "Puma, Msasa", spentOn: "2026-10-18", amount: 32.4, taxAmount: 4.35, projectId: null, receiptUrl: "https://blob/slip.jpg" }],
    });
    expect(voucherPayload({ ...form, paidWith: "float", floatId: "f" }, null)).toMatchObject({ action: "voucher", floatId: "f", amount: 32.4, taxAmount: 4.35, spentAt: "2026-10-18" });
  });
});

describe("Suppliers (BkSuppliers) and one supplier (BkSupplier)", () => {
  it("names what a supplier's bills are most often for, three at most", () => {
    expect(suppliesOf(["Underlay", "Oak strip", "oak strip", "Skirting", "Oak strip", "Underlay", "Glue"])).toBe("Oak strip, Underlay, Skirting");
    expect(suppliesOf([" ", ""])).toBeNull();
  });

  it("says how many are owed and how late", () => {
    expect(suppliersFinding({ suppliers: 5, amount: 8077.15 }, [{ name: "Mutare Timber Works", amount: 1859.55 }])).toEqual({ fact: "You owe 5 suppliers US$8,077.15.", rest: "Mutare Timber Works is owed US$1,859.55 that is overdue." });
    expect(suppliersFinding({ suppliers: 0, amount: 0 }, []).fact).toBe("You owe no supplier anything.");
  });

  it("ages each supplier's payables lines from their dates", () => {
    const asOf = new Date("2026-10-18T12:00:00Z");
    const rows = ageLines(
      [
        { partyId: "a", entryDate: new Date("2026-10-10T00:00:00Z"), debit: 0, credit: 100 },
        { partyId: "a", entryDate: new Date("2026-08-01T00:00:00Z"), debit: 0, credit: 50 },
        { partyId: "a", entryDate: new Date("2026-10-12T00:00:00Z"), debit: 30, credit: 0 },
        { partyId: "b", entryDate: new Date("2026-10-01T00:00:00Z"), debit: 20, credit: 20 },
      ],
      new Map([["a", "Mutare Timber Works"]]),
      asOf,
    );
    expect(rows).toEqual([{ id: "a", name: "Mutare Timber Works", current: 70, days30: 0, days60: 50, days90: 0, over90: 0, total: 120 }]);
  });

  it("runs the statement's balance from what was owed before", () => {
    const { lines, closing } = statementLines(
      [
        { day: "2026-10-12", document: "PAY-0058", detail: "Paid", href: null, billed: 0, paid: 400 },
        { day: "2026-10-09", document: "BILL-0216", detail: "Bill", href: null, billed: 1000, paid: 0 },
      ],
      200,
    );
    expect(lines.map((line) => [line.document, line.balance])).toEqual([["BILL-0216", 1200], ["PAY-0058", 800]]);
    expect(closing).toBe(800);
  });
});

describe("All spending (BkSpending)", () => {
  it("says what has gone out and what is the most", () => {
    expect(spendingFinding(6716.86, 5, { bills: 3972.4, requisitions: 200, claims: 50, "till-payouts": 64, payroll: 931.9, other: 1498.56 })).toEqual({
      fact: "US$6,716.86 has gone out this month, from 5 modules.",
      rest: "Bills are the most, US$3,972.40.",
    });
    expect(spendingFinding(0, 0, { bills: 0, requisitions: 0, claims: 0, "till-payouts": 0, payroll: 0, other: 0 }).fact).toBe("Nothing has gone out this month.");
    expect(spendingFinding(10, 1, { bills: 0, requisitions: 0, claims: 0, "till-payouts": 0, payroll: 10, other: 0 }).rest).toBe("Payroll is the most, US$10.00.");
    expect(readSpendingQuery(new URLSearchParams("view=till-payouts&from=Retail"))).toMatchObject({ view: "till-payouts", from: "Retail", month: "this" });
  });

  it("filters every list by the same periods", () => {
    expect(periodRange("any", "2026-10-18")).toBeNull();
    expect(periodRange("last-month", "2026-10-18")).toEqual({ gte: new Date("2026-09-01T00:00:00.000Z"), lt: new Date("2026-10-01T00:00:00.000Z") });
  });
});
