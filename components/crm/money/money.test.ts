/**
 * How the money pages write figures and days: one format for a date wherever
 * it appears, and a minus that reads as a sign.
 */
import { describe, expect, it } from "vitest";

import { formatDate, formatDay, formatMoney, payable } from "./money";

describe("formatMoney", () => {
  it("groups thousands and keeps the cents", () => {
    expect(formatMoney("1050", "USD")).toBe("USD 1,050.00");
    expect(formatMoney(4689.5, "ZWG")).toBe("ZWG 4,689.50");
  });

  it("writes a negative with a true minus sign, ahead of the digits", () => {
    expect(formatMoney("-40", "USD")).toBe("USD −40.00");
  });

  it("leaves something that is not a number as it came", () => {
    expect(formatMoney("n/a", "USD")).toBe("USD n/a");
  });
});

describe("formatDate", () => {
  it("writes a log day key day first, in UTC", () => {
    expect(formatDate("2026-09-25")).toBe("25 Sept 2026");
  });

  it("writes a timestamp as the UTC calendar day it falls on", () => {
    expect(formatDate("2026-09-25T23:30:00.000Z")).toBe("25 Sept 2026");
    expect(formatDate(new Date("2026-01-03T00:00:00.000Z"))).toBe("3 Jan 2026");
  });
});

describe("formatDay", () => {
  it("names the weekday, then the day and the month", () => {
    expect(formatDay("2026-09-25")).toBe("Friday 25 September");
  });
});

describe("payable", () => {
  it("is what was approved when an approver cut it, and what was asked otherwise", () => {
    expect(payable({ amount: "400.00", approvedAmount: "350.00" })).toBe("350.00");
    expect(payable({ amount: "400.00", approvedAmount: null })).toBe("400.00");
  });
});
