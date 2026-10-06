import { describe, expect, it } from "vitest";

import {
  billBalance,
  boughtPerMonth,
  deliveredValue,
  fillRate,
  lastDelivery,
  lateness,
  lateOrders,
  lineVat,
  lineValue,
  monthsSince,
  onTime,
  orderCounts,
  orderedDelivered,
  orderTotals,
  owed,
  owedNote,
  spend12,
  spendDelta,
  stillToCome,
  unitsShortThisYear,
  type FigureDelivery,
  type FigureOrder,
} from "./figures";

// 3 October 2026, 10:00 in Harare (UTC+2).
const NOW = new Date("2026-10-03T08:00:00Z");
const day = (iso: string) => new Date(`${iso}T10:00:00+02:00`);

const order = (over: Partial<FigureOrder>): FigureOrder => ({
  state: "RECEIVED",
  firstExpectedDate: day("2026-08-16"),
  lastDeliveryAt: day("2026-08-16"),
  doneAt: day("2026-08-16"),
  lines: [{ quantity: 10, receivedQuantity: 10, sentQuantity: 10, unitCost: "1.00", vatRate: 15 }],
  ...over,
});

const delivery = (iso: string, value: string, vatRate = 15): FigureDelivery => ({
  postedAt: day(iso),
  lines: [{ quantity: 1, unitCost: value, vatRate }],
});

describe("lines and orders (40-buying 3.2)", () => {
  it("values a line ex VAT and its VAT to the cent", () => {
    expect(lineValue(240, "0.86").toFixed(2)).toBe("206.40");
    expect(lineVat("206.40", 15).toFixed(2)).toBe("30.96");
    expect(lineVat("0.03", "15.5").toFixed(2)).toBe("0.00");
  });

  it("totals an order with VAT rounded per line: PO-0005's six lines", () => {
    const totals = orderTotals([
      { quantity: 24, unitCost: "13.03", vatRate: 15 },
      { quantity: 24, unitCost: "33.60", vatRate: 15 },
      { quantity: 12, unitCost: "22.15", vatRate: 15 },
      { quantity: 12, unitCost: "12.40", vatRate: 15 },
      { quantity: 12, unitCost: "7.10", vatRate: 15 },
      { quantity: 6, unitCost: "11.34", vatRate: 15 },
    ]);
    expect(totals.lines.toFixed(2)).toBe("1686.96");
    // Each line's VAT to the cent (46.91 + 120.96 + 39.87 + 22.32 + 12.78 + 10.21), not 15% of the sum (253.04).
    expect(totals.vat.toFixed(2)).toBe("253.05");
    expect(totals.total.toFixed(2)).toBe("1940.01");
  });

  it("counts ordered and delivered, the value delivered and what is still to come", () => {
    const lines = [
      { quantity: 240, receivedQuantity: 120, unitCost: "0.86", vatRate: 15 },
      { quantity: 120, receivedQuantity: 30, unitCost: "0.52", vatRate: 15, closedShort: true },
    ];
    expect(orderedDelivered(lines)).toEqual({ ordered: 360, delivered: 150 });
    expect(deliveredValue(lines).toFixed(2)).toBe("136.62");
    const partial = stillToCome({ state: "PARTIAL", lines });
    expect(partial.units).toBe(120);
    expect(partial.value.toFixed(2)).toBe("118.68");
    expect(stillToCome({ state: "DRAFT", lines: [{ quantity: 12, unitCost: "1.00", vatRate: 15 }] }).units).toBe(12);
    expect(stillToCome({ state: "CLOSED", lines }).units).toBe(0);
  });

  it("is late the Harare day after it was first expected, while something is still to come", () => {
    const sent = order({ state: "SENT", firstExpectedDate: day("2026-10-02"), lines: [{ quantity: 5, unitCost: 1, vatRate: 15 }] });
    expect(lateness(sent, NOW)).toEqual({ late: true, days: 1 });
    expect(lateness({ ...sent, firstExpectedDate: day("2026-10-03") }, NOW).late).toBe(false);
    // 23:30 on 2 October in Harare is still 2 October there, though it is 21:30 UTC.
    expect(lateness({ ...sent, firstExpectedDate: new Date("2026-10-02T21:30:00Z") }, NOW)).toEqual({ late: true, days: 1 });
    // 00:30 on 3 October in Harare is 22:30 UTC on the 2nd: due today, not late.
    expect(lateness({ ...sent, firstExpectedDate: new Date("2026-10-02T22:30:00Z") }, NOW).late).toBe(false);
    expect(lateness({ ...sent, state: "PARTIAL", lines: [{ quantity: 5, receivedQuantity: 5, unitCost: 1, vatRate: 15 }] }, NOW).late).toBe(false);
    expect(lateOrders([sent, order({})], NOW)).toBe(1);
  });
});

describe("a supplier's figures (40-buying 3.2)", () => {
  it("spend over the last 365 days with VAT, against the 365 before", () => {
    const deliveries = [delivery("2026-09-01", "100.00"), delivery("2026-02-01", "100.00"), delivery("2025-06-01", "200.00")];
    const figure = spend12(deliveries, NOW);
    expect(figure.spend.toFixed(2)).toBe("230.00");
    expect(figure.before.toFixed(2)).toBe("230.00");
    expect(figure.delta).toEqual({ text: "0%", tone: "plain" });
    expect(spendDelta("106", "100")).toEqual({ text: "+6%", tone: "ok" });
    expect(spendDelta("91", "100")).toEqual({ text: "−9%", tone: "bad" });
    expect(spendDelta("50", "0")).toEqual({ text: "New this year", tone: "plain" });
  });

  it("counts orders and the open ones, binned left out", () => {
    expect(
      orderCounts([order({ state: "DRAFT" }), order({ state: "SENT" }), order({ state: "PARTIAL" }), order({}), order({ state: "DRAFT", binned: true })]),
    ).toEqual({ orders: 4, open: 3 });
  });

  it("on time: done orders whose last delivery came by the day first expected, in points on the year before", () => {
    const orders = [
      order({ lastDeliveryAt: day("2026-08-16") }),
      order({ lastDeliveryAt: day("2026-08-18") }),
      order({ doneAt: day("2025-08-20"), firstExpectedDate: day("2025-08-16"), lastDeliveryAt: day("2025-08-16") }),
    ];
    expect(onTime(orders, NOW)).toEqual({ pct: 50, before: 100, delta: { text: "−50 pts", tone: "bad" } });
    expect(onTime([], NOW)).toEqual({ pct: null, before: null, delta: null });
  });

  it("fill rate: received over sent on done orders; deliveries with no orders 100%; nothing, none", () => {
    const orders = [
      order({ lines: [{ quantity: 240, receivedQuantity: 228, sentQuantity: 240, unitCost: 1, vatRate: 15 }] }),
      order({ lines: [{ quantity: 60, receivedQuantity: 60, sentQuantity: 60, unitCost: 1, vatRate: 15 }] }),
    ];
    expect(fillRate(orders, [], NOW)).toBe(96);
    expect(fillRate([], [delivery("2026-09-01", "10.00")], NOW)).toBe(100);
    expect(fillRate([], [], NOW)).toBeNull();
    expect(unitsShortThisYear(orders, NOW)).toBe(12);
    expect(unitsShortThisYear([order({ doneAt: day("2025-12-31"), lines: [{ quantity: 5, receivedQuantity: 1, unitCost: 1, vatRate: 15 }] })], NOW)).toBe(0);
  });

  it("last delivery, or none", () => {
    expect(lastDelivery([delivery("2026-08-13", "1"), delivery("2026-10-02", "1")])?.toISOString()).toBe(day("2026-10-02").toISOString());
    expect(lastDelivery([])).toBeNull();
  });

  it("owed: bill balances less unallocated payments and open return credits; reads 0 with no bills", () => {
    const bills = [
      { total: "216.00", amountPaid: "0", dueDate: day("2026-09-12") },
      { total: "408.00", amountPaid: "0", dueDate: day("2026-10-26") },
      { total: "300.00", amountPaid: "250.00", debitNoteTotal: "50.00", dueDate: day("2026-09-01") },
      { total: "99.00", amountPaid: "0", dueDate: day("2026-09-01"), binned: true },
    ];
    expect(billBalance(bills[2]!).toFixed(2)).toBe("0.00");
    expect(owed(bills).toFixed(2)).toBe("624.00");
    expect(owed(bills, { payments: ["600.00"], returns: ["64.00"] }).toFixed(2)).toBe("-40.00");
    expect(owed([]).toFixed(2)).toBe("0.00");
    expect(owedNote(bills)).toBe("12 Sept due");
    expect(owedNote([])).toBe("Nothing due");
  });

  it("buys per Harare month, the newest last", () => {
    const deliveries = [delivery("2026-09-30", "100.00"), delivery("2026-10-01", "10.00"), delivery("2026-08-01", "1.00")];
    // Late on 30 September UTC is 1 October in Harare.
    deliveries.push({ postedAt: new Date("2026-09-30T22:30:00Z"), lines: [{ quantity: 1, unitCost: "5.00", vatRate: 0 }] });
    const months = boughtPerMonth(deliveries, NOW, 3);
    expect(months.map((m) => [m.month, m.value.toFixed(2)])).toEqual([
      ["2026-08", "1.15"],
      ["2026-09", "115.00"],
      ["2026-10", "16.50"],
    ]);
    expect(boughtPerMonth([], NOW, 12)).toHaveLength(12);
    expect(monthsSince([delivery("2024-10-15", "1")], NOW)).toBe(25);
    expect(monthsSince([], NOW)).toBe(12);
  });
});
