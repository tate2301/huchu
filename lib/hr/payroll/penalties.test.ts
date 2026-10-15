import { describe, it, expect } from "vitest";

import { isPenaltyComponent, outstandingPenalties, penaltyComponentName, penaltySummary, PENALTY_SEQUENCE } from "./penalties";

describe("outstandingPenalties", () => {
  const marked = [
    { summary: "Late for shift", amount: 20 },
    { summary: "Damaged tools", amount: 50.1 },
  ];

  it("owes every penalty when no run in the period has taken any", () => {
    expect(outstandingPenalties(marked, 0)).toEqual(marked);
  });

  it("never owes what an earlier run in the period already took", () => {
    expect(outstandingPenalties(marked, 70.1)).toEqual([]);
    expect(outstandingPenalties(marked, 90)).toEqual([]);
  });

  it("owes only the rest of a penalty an earlier run could not cover, to the cent", () => {
    expect(outstandingPenalties(marked, 30.05)).toEqual([{ summary: "Damaged tools", amount: 40.05 }]);
  });
});

describe("a penalty component", () => {
  it("is named after HR's summary and known by its place in the working", () => {
    const name = penaltyComponentName("Late for shift");
    expect(name).toBe("Disciplinary penalty — Late for shift");
    expect(penaltySummary(name)).toBe("Late for shift");
    expect(isPenaltyComponent({ type: "DEDUCTION", sequence: PENALTY_SEQUENCE })).toBe(true);
    expect(isPenaltyComponent({ type: "DEDUCTION", sequence: 100 })).toBe(false);
    expect(isPenaltyComponent({ type: "STATUTORY_DEDUCTION", sequence: PENALTY_SEQUENCE })).toBe(false);
  });
});
