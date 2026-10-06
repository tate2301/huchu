import { describe, expect, it } from "vitest";

import {
  connectionWords,
  dayCloseOf,
  deviceIdProblem,
  fiscalDayLabel,
  fiscalDayTotal,
  taxpayerNumberProblem,
  vatNumberProblem,
  whenUnreachableOf,
  zReportTotals,
} from "./fiscal-words";

// 3 October 2026, 10:00 in Harare.
const NOW = new Date("2026-10-03T08:00:00Z");
const at = (iso: string) => new Date(`${iso}+02:00`);

describe("the connection line", () => {
  it("says connected with the open day and when it opened", () => {
    expect(connectionWords({ registered: true, unreachableSince: null, openDay: { no: 214, openedAt: at("2026-10-03T07:58:00") } })).toEqual({
      state: "CONNECTED",
      text: "Connected to ZIMRA. Day 214 open since 07:58.",
    });
  });

  it("says when no day is open, when it is not connected, and since when ZIMRA has not answered", () => {
    expect(connectionWords({ registered: true, unreachableSince: null, openDay: null }).text).toBe(
      "Connected to ZIMRA. No fiscal day open.",
    );
    expect(connectionWords({ registered: false, unreachableSince: null, openDay: null })).toEqual({
      state: "NOT_CONNECTED",
      text: "Not connected yet.",
    });
    expect(
      connectionWords({ registered: true, unreachableSince: at("2026-10-03T09:42:00"), openDay: { no: 214, openedAt: NOW } }),
    ).toEqual({ state: "UNREACHABLE", text: "ZIMRA has not answered since 09:42. Receipts are signed and wait." });
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
