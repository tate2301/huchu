import { describe, expect, it } from "vitest";

import { journalRef, journalsFinding, journalState, sourceLabel, tabWhere } from "./journals";

describe("journalsFinding", () => {
  it("names the month the drafts are dated, and the ones waiting for a second person", () => {
    expect(journalsFinding([{ month: "September" }, { month: "September" }], 1)).toEqual({
      fact: "2 September journals are still drafts.",
      rest: "1 more waits for a second person.",
    });
    expect(journalsFinding([{ month: "September" }]).fact).toBe("1 September journal is still a draft.");
    expect(journalsFinding([{ month: "August" }, { month: "September" }]).fact).toBe("2 journals are still drafts.");
    expect(journalsFinding([], 2)).toEqual({ fact: "2 journals wait for a second person.", rest: null });
    expect(journalsFinding([])).toEqual({ fact: "Every journal is posted.", rest: null });
  });
});

describe("labels and states", () => {
  it("writes numbers and sources the way the list does; a draft has no number yet", () => {
    expect(journalRef(421)).toBe("JE-0421");
    expect(journalRef(-3)).toBe("No number yet");
    expect(sourceLabel("SALES_INVOICE")).toBe("Invoice");
    expect(sourceLabel("MANUAL")).toBe("Manual");
    expect(sourceLabel("STOCK_ISSUE")).toBe("Stock issue");
  });

  it("reads To approve from the waiting drafts and Reversed from the markers", () => {
    const base = { status: "DRAFT", reversedAt: null, voidedAt: null, sourceId: null };
    expect(journalState({ ...base, id: "a" }, new Set(["a"]))).toBe("to-approve");
    expect(journalState({ ...base, id: "b" }, new Set(["a"]))).toBe("draft");
    expect(journalState({ ...base, status: "POSTED", reversedAt: new Date() })).toBe("reversed");
    expect(journalState({ ...base, status: "POSTED", sourceId: "void:x" })).toBe("voided");
    expect(tabWhere("to-approve", ["a"])).toEqual({ status: "DRAFT", id: { in: ["a"] } });
    expect(tabWhere("draft", ["a"])).toEqual({ status: "DRAFT", id: { notIn: ["a"] } });
  });
});
