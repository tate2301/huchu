import { describe, expect, it } from "vitest";

import { depositBack, depositsDue, emptiesCounted, lineDeposit } from "./deposits";

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

describe("deposits handed back on a refund", () => {
  // Seven Castle with a deposit of $0.10 each: $0.70 held on the line.
  const line = { quantity: 7, depositAmount: 0.7 };

  it("hands back the whole deposit when the whole line comes back", () => {
    expect(depositBack(line, 7, 7)).toBe(0.7);
  });

  it("hands back its share for part of the line", () => {
    expect(depositBack(line, 2, 7)).toBe(0.2);
  });

  it("hands back what is left on the last refund, so the pieces add up to the cent", () => {
    // $1.00 over three bottles: a third each rounds to 0.33, so three single
    // refunds would return 0.99. The last one returns what is left instead.
    const odd = { quantity: 3, depositAmount: 1 };
    const first = depositBack(odd, 1, 3);
    const second = depositBack({ ...odd, depositRefunded: first }, 1, 2);
    const last = depositBack({ ...odd, depositRefunded: first + second }, 1, 1);
    expect([first, second, last]).toEqual([0.33, 0.33, 0.34]);
  });

  it("hands back nothing on a line that took no deposit, and never more than is left", () => {
    expect(depositBack({ quantity: 4, depositAmount: 0 }, 4, 4)).toBe(0);
    expect(depositBack({ ...line, depositRefunded: 0.7 }, 3, 3)).toBe(0);
  });

  it("reads a refund line's negative deposit by its size", () => {
    expect(depositBack({ quantity: 7, depositAmount: -0.7 }, 7, 7)).toBe(0.7);
  });
});
