import { describe, expect, it } from "vitest";

import { bankFinding } from "./bank";

describe("bankFinding", () => {
  it("says how many lines on the statement are still to match, and how many Vane proposed", () => {
    expect(bankFinding({ bank: "CBZ", toMatch: 4, proposed: 3, since: "Friday", total: 61 })).toEqual({
      fact: "4 lines on CBZ’s statement are still to match.",
      rest: "Vane proposed a match for 3.",
    });
    expect(bankFinding({ bank: "CBZ", toMatch: 1, proposed: 1, since: "today", total: 5 })?.rest).toBe("Vane proposed a match for it.");
    expect(bankFinding({ bank: "CBZ", toMatch: 2, proposed: 2, since: "today", total: 5 })?.rest).toBe("Vane proposed a match for all 2.");
  });
  it("asks a person to choose when Vane has nothing", () => {
    expect(bankFinding({ bank: "CBZ", toMatch: 1, proposed: 0, since: "yesterday", total: 5 })).toEqual({
      fact: "1 line on CBZ’s statement is still to match.",
      rest: "Choose what it was.",
    });
  });
  it("says when everything is matched, and nothing before any statement", () => {
    expect(bankFinding({ bank: "CBZ", toMatch: 0, proposed: 0, since: null, total: 5 })).toEqual({ fact: "Every line on CBZ’s statement is matched.", rest: null });
    expect(bankFinding({ bank: "CBZ", toMatch: 0, proposed: 0, since: null, total: 0 })).toBeNull();
  });
});
