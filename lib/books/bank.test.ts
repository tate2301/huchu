import { describe, expect, it } from "vitest";

import { bankFinding } from "./bank";

describe("bankFinding", () => {
  it("says how many lines wait and that nothing is matched until accepted", () => {
    expect(bankFinding({ bank: "CBZ", toMatch: 4, proposed: 3, since: "Friday", total: 61 })).toEqual({
      fact: "4 lines from CBZ since Friday are not matched.",
      rest: "Vane matched 3 of them. Nothing is matched until you accept it.",
    });
    expect(bankFinding({ bank: "CBZ", toMatch: 1, proposed: 1, since: "today", total: 5 })?.rest).toBe(
      "Vane matched it. Nothing is matched until you accept it.",
    );
    expect(bankFinding({ bank: "CBZ", toMatch: 1, proposed: 0, since: "yesterday", total: 5 })).toEqual({
      fact: "1 line from CBZ since yesterday is not matched.",
      rest: "Choose what it was.",
    });
    expect(bankFinding({ bank: "CBZ", toMatch: 0, proposed: 0, since: null, total: 5 })).toEqual({ fact: "Every line from CBZ is matched.", rest: null });
    expect(bankFinding({ bank: "CBZ", toMatch: 0, proposed: 0, since: null, total: 0 })).toBeNull();
  });
});
