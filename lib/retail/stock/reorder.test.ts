import { describe, expect, it } from "vitest";

import { parseKeepDays, perDayOf, reorderLineSub, sellsWords, suggestReorderLevel } from "./reorder";

/** Change reorder levels' arithmetic (30-stock 5.3): what sells × (keep + lead), rounded up to whole cases when asked. */
describe("suggestReorderLevel", () => {
  const base = { keepDays: 14, leadDays: 2, caseSize: null, round: "CASES" as const };

  it("keeps two weeks plus the supplier's two days of what sells", () => {
    expect(suggestReorderLevel({ ...base, perDay: 2 })).toBe(32); // Johnnie Walker
    expect(suggestReorderLevel({ ...base, perDay: 3 })).toBe(48); // Jameson
  });

  it("rounds up to whole cases, or leaves singles as they are", () => {
    expect(suggestReorderLevel({ ...base, perDay: 30, caseSize: 24 })).toBe(480);
    expect(suggestReorderLevel({ ...base, perDay: 30, leadDays: 1, caseSize: 24, round: "SINGLES" })).toBe(450);
    expect(suggestReorderLevel({ ...base, perDay: 30, leadDays: 1, caseSize: 24 })).toBe(456);
  });

  it("counts no lead time when the supplier has none, and nothing for a line that does not sell", () => {
    expect(suggestReorderLevel({ ...base, perDay: 2, leadDays: 0 })).toBe(28);
    expect(suggestReorderLevel({ ...base, perDay: 0, caseSize: 24 })).toBe(0);
  });

  it("rounds a part unit up, without float noise", () => {
    expect(suggestReorderLevel({ ...base, perDay: perDayOf(63, 30) })).toBe(34); // 2.1 × 16 = 33.6
    expect(suggestReorderLevel({ ...base, perDay: 2.1, keepDays: 10, leadDays: 0 })).toBe(21);
  });
});

describe("the words", () => {
  it("says how fast a line sells", () => {
    expect(sellsWords(2)).toBe("Sells 2 a day");
    expect(sellsWords(2.1)).toBe("Sells 2 a day");
    expect(sellsWords(0.25)).toBe("Sells about 1 every 4 days");
    expect(sellsWords(0)).toBe("Not sold in 30 days");
  });

  it("puts the level now beside it", () => {
    expect(reorderLineSub(2, 12)).toBe("Sells 2 a day · now 12");
    expect(reorderLineSub(3, null)).toBe("Sells 3 a day · now not set");
  });

  it("reads Keep enough for as typed", () => {
    expect(parseKeepDays("14 days")).toBe(14);
    expect(parseKeepDays("14")).toBe(14);
    expect(parseKeepDays("1 day")).toBe(1);
    expect(parseKeepDays("0")).toBeNull();
    expect(parseKeepDays("121")).toBeNull();
    expect(parseKeepDays("two weeks")).toBeNull();
  });
});
