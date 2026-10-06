import { describe, expect, it } from "vitest";

import {
  connectionWords,
  dayCloseOf,
  deviceIdProblem,
  fiscalDayLabel,
  fiscalDayTotal,
  heldReceiptWords,
  saleBeforeDayWords,
  saleWhileClosingWords,
  taxpayerNumberProblem,
  vatNumberProblem,
  whenUnreachableOf,
  zReportTotals,
} from "./fiscal-words";

// 3 October 2026, 10:00 in Harare.
const NOW = new Date("2026-10-03T08:00:00Z");
const at = (iso: string) => new Date(`${iso}+02:00`);

describe("the connection line", () => {
  it("says connected with the open day and when it opened, with its date when it opened on an earlier day", () => {
    expect(
      connectionWords({ registered: true, unreachableSince: null, activeDay: { no: 214, openedAt: at("2026-10-03T07:58:00"), status: "OPENED" }, now: NOW }),
    ).toEqual({ state: "CONNECTED", text: "Connected to ZIMRA. Day 214 open since 07:58." });
    expect(
      connectionWords({ registered: true, unreachableSince: null, activeDay: { no: 213, openedAt: at("2026-10-02T07:54:00"), status: "OPENED" }, now: NOW })
        .text,
    ).toBe("Connected to ZIMRA. Day 213 open since 2 Oct 07:54.");
  });

  it("says when no day is open, when it is not connected, and since when ZIMRA has not answered", () => {
    expect(connectionWords({ registered: true, unreachableSince: null, activeDay: null }).text).toBe(
      "Connected to ZIMRA. No fiscal day open.",
    );
    expect(connectionWords({ registered: false, unreachableSince: null, activeDay: null })).toEqual({
      state: "NOT_CONNECTED",
      text: "Not connected yet.",
    });
    expect(
      connectionWords({ registered: true, unreachableSince: at("2026-10-03T09:42:00"), activeDay: { no: 214, openedAt: NOW, status: "OPENED" } }),
    ).toEqual({ state: "UNREACHABLE", text: "ZIMRA has not answered since 09:42. Receipts are signed and wait." });
  });

  it("says a day's report waits for ZIMRA while it is closing, and that sales are not signed meanwhile", () => {
    expect(
      connectionWords({ registered: true, unreachableSince: null, activeDay: { no: 214, openedAt: NOW, status: "CLOSING" } }),
    ).toEqual({ state: "CONNECTED", text: "Day 214's report waits for ZIMRA. Sales are not signed until it is taken." });
  });
});

describe("what a till sale is told about its receipt", () => {
  it("says a held receipt is signed and waits, a sale while a report waits is not signed, nor one older than its day", () => {
    expect(heldReceiptWords(at("2026-10-03T09:42:00"))).toBe(
      "ZIMRA has not answered since 09:42. The receipt is signed and waits to be sent.",
    );
    expect(saleWhileClosingWords(214)).toBe("Day 214's report waits for ZIMRA. Sales are not signed until it is taken.");
    expect(saleBeforeDayWords("RS-0271", 215)).toBe(
      "RS-0271 was rung before day 215 opened, and ZIMRA takes no receipt dated before its day. It is not signed.",
    );
  });
});

describe("the aside's days", () => {
  it("reads today's open day, an older open one, a closing one and a closed one", () => {
    expect(fiscalDayLabel({ status: "OPENED", openedAt: at("2026-10-03T07:58:00"), closedAt: null }, NOW)).toBe("Today, open");
    expect(fiscalDayLabel({ status: "OPENED", openedAt: at("2026-10-02T07:58:00"), closedAt: null }, NOW)).toBe("2 Oct, open");
    expect(fiscalDayLabel({ status: "CLOSING", openedAt: at("2026-10-03T07:58:00"), closedAt: null }, NOW)).toBe("Today, closing");
    expect(
      fiscalDayLabel({ status: "CLOSED", openedAt: at("2026-10-02T07:54:00"), closedAt: at("2026-10-02T22:04:00") }, NOW),
    ).toBe("2 Oct, closed 22:04");
    // Closed the next morning: the close says its own date.
    expect(
      fiscalDayLabel({ status: "CLOSED", openedAt: at("2026-10-02T07:54:00"), closedAt: at("2026-10-03T07:11:00") }, NOW),
    ).toBe("2 Oct, closed 3 Oct 07:11");
  });

  it("totals a day in its currencies, dollars first, and nothing as US$0.00", () => {
    expect(fiscalDayTotal(new Map([["USD", BigInt(391220)]]))).toBe("US$3,912.20");
    expect(fiscalDayTotal(new Map([["ZWG", BigInt(120000)], ["USD", BigInt(4000)]]))).toBe("US$40.00 · ZiG 1,200.00");
    expect(fiscalDayTotal(new Map())).toBe("US$0.00");
  });

  it("reads a Z-report's sales less its credit notes, and nothing from a report without sales counters", () => {
    const report = JSON.stringify({
      counters: [
        { fiscalCounterType: "SaleByTax", fiscalCounterCurrency: "USD", fiscalCounterValueCents: "400000" },
        { fiscalCounterType: "SaleTaxByTax", fiscalCounterCurrency: "USD", fiscalCounterValueCents: "53680" },
        { fiscalCounterType: "CreditNoteByTax", fiscalCounterCurrency: "USD", fiscalCounterValueCents: "-8780" },
      ],
    });
    expect(zReportTotals(report)).toEqual(new Map([["USD", BigInt(391220)]]));
    expect(zReportTotals(JSON.stringify({ counters: [] }))).toBeNull();
    expect(zReportTotals("not json")).toBeNull();
    expect(zReportTotals(null)).toBeNull();
  });
});

describe("the device's numbers", () => {
  it("takes digits grouped with a dash, ten for the taxpayer and eight for VAT; empty is fine", () => {
    expect(deviceIdProblem("0441-2209")).toBeNull();
    expect(deviceIdProblem("12345")).toBeNull();
    expect(deviceIdProblem("")).toBeNull();
    expect(deviceIdProblem("HC-0441")).toBe("Type the device ID as ZIMRA gave it: digits, grouped with a dash if you like.");
    expect(taxpayerNumberProblem("2000118844")).toBeNull();
    expect(taxpayerNumberProblem("200011884")).toBe("A taxpayer number is ten digits.");
    expect(vatNumberProblem("10023881")).toBeNull();
    expect(vatNumberProblem("1002388")).toBe("A VAT number is eight digits.");
  });

  it("maps the two rules' words back to their values", () => {
    expect(dayCloseOf("With the last shift")).toBe("WITH_LAST_SHIFT");
    expect(dayCloseOf("By hand")).toBe("BY_HAND");
    expect(whenUnreachableOf("Stop selling")).toBe("STOP_SELLING");
    expect(whenUnreachableOf("Keep selling, sign later")).toBe("KEEP_SELLING");
    expect(whenUnreachableOf("Panic")).toBeNull();
  });
});
