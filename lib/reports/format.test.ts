import { describe, expect, it } from "vitest";

import { formatValue, withCurrency } from "./format";

describe("a report's sums", () => {
  it("say their currency as the boards write it, two decimals always", () => {
    expect(formatValue(3961200, { kind: "money", currency: "USD" })).toBe("$3,961,200.00");
    expect(formatValue(-12, { kind: "money", currency: "USD" })).toBe("−$12.00");
    expect(formatValue(1284.6, { kind: "money", currency: "ZWG" })).toBe("ZiG 1,284.60");
    expect(formatValue(5, { kind: "money", currency: "GBP" })).toBe("GBP 5.00");
    expect(formatValue(5, { kind: "money" })).toBe("5.00");
  });

  it("take the rows' currency when they share one, the workspace's when they carry none, and none when they differ", () => {
    const columns = [
      { key: "value", kind: "money" as const },
      { key: "won", kind: "money" as const, currency: "ZWG" },
      { key: "deals", kind: "number" as const },
    ];
    expect(withCurrency(columns, [{ currency: "USD" }, { currency: "USD" }], "ZWG").map((column) => column.currency)).toEqual(["USD", "ZWG", undefined]);
    expect(withCurrency(columns, [{}], "USD").map((column) => column.currency)).toEqual(["USD", "ZWG", undefined]);
    expect(withCurrency(columns, [{ currency: "USD" }, { currency: "ZWG" }], "USD").map((column) => column.currency)).toEqual([undefined, "ZWG", undefined]);
  });
});
