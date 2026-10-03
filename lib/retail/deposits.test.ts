import { describe, expect, it } from "vitest";

import { depositsDue, emptiesCounted, lineDeposit } from "./deposits";

const castle = { quantity: 12, returnable: true, depositAmount: 0.1 };

describe("deposits on returnable bottles", () => {
  it("charges the deposit on each returnable bottle sold", () => {
    // 12 × $0.10 = $1.20, exactly — not 1.2000000000000002.
    expect(lineDeposit(castle)).toBe(1.2);
  });

  it("takes it off for each empty brought back for the line", () => {
    expect(lineDeposit({ ...castle, emptiesBack: 5 })).toBe(0.7);
    expect(lineDeposit({ ...castle, emptiesBack: 12 })).toBe(0);
  });

  it("never counts more empties than the line sells, nor a part of one", () => {
    expect(emptiesCounted({ ...castle, emptiesBack: 30 })).toBe(12);
    expect(emptiesCounted({ ...castle, emptiesBack: 2.7 })).toBe(2);
    expect(emptiesCounted({ ...castle, emptiesBack: -4 })).toBe(0);
    expect(lineDeposit({ ...castle, emptiesBack: 30 })).toBe(0);
  });

  it("charges nothing on a line that is not returnable or has no deposit", () => {
    expect(lineDeposit({ quantity: 6, returnable: false, depositAmount: 0.1 })).toBe(0);
    expect(lineDeposit({ quantity: 6, returnable: true, depositAmount: null })).toBe(0);
  });

  it("adds up a basket", () => {
    expect(
      depositsDue([
        castle,
        { quantity: 3, returnable: true, depositAmount: 0.15, emptiesBack: 1 },
        { quantity: 2, returnable: false },
      ]),
    ).toBe(1.5);
  });
});
