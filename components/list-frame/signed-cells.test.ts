import { describe, expect, it } from "vitest";

import type { ListColumn, ReportRow } from "@/lib/reports/types";

import { cellText, rowMatches, toneOf, totalText } from "./model";

/** The engine additions Movements needs (30-stock 4.1): signed counts, tones from the row, menus on row keys. */

const row = (values: Record<string, string | number | null>): ReportRow => ({ id: "r", ...values });
const change: ListColumn = { key: "change", label: "Change", kind: "number", cell: "num", sign: "gain", width: "80px" };

describe("signed counts", () => {
  it("always say which way they went", () => {
    expect(cellText(change, row({ change: 40 }))).toBe("+40");
    expect(cellText(change, row({ change: -1 }))).toBe("−1");
    expect(cellText(change, row({ change: 0 }))).toBe("0");
    expect(totalText(change, 58)).toBe("+58");
    expect(totalText({ ...change, sign: "plain" }, -41)).toBe("−41");
  });
});

describe("tones", () => {
  it("come from the row's own key when the words vary", () => {
    const movement: ListColumn = { key: "movement", label: "Movement", kind: "status", cell: "state", toneKey: "tone", width: "150px" };
    expect(toneOf(movement, row({ movement: "Count, two broken", tone: "warn" }))).toBe("warn");
    expect(toneOf(movement, row({ movement: "Sale", tone: null }))).toBeNull();
    const fixed: ListColumn = { ...movement, toneKey: undefined, tones: { Sale: "hollow" } };
    expect(toneOf(fixed, row({ movement: "Sale" }))).toBe("hollow");
  });
});

describe("row menus", () => {
  it("can ask about a row key the list does not draw", () => {
    const when = [{ column: "saleId", op: "notEmpty" as const }];
    expect(rowMatches(row({ saleId: "abc" }), [change], when)).toBe(true);
    expect(rowMatches(row({ saleId: null }), [change], when)).toBe(false);
  });
});
