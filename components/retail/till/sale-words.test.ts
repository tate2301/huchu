import { describe, expect, it } from "vitest";

import { saleChangeWords } from "./sale-words";

const coke = { catalogItemId: "coke", name: "Coca-Cola 500ml", quantity: 1 };
const ice = { catalogItemId: "ice", name: "Ice 2kg bag", quantity: 1 };

describe("saleChangeWords", () => {
  it("says what was added, then the total", () => {
    expect(saleChangeWords([], [coke], 0.75)).toBe("Added Coca-Cola 500ml. Total US$0.75.");
    expect(saleChangeWords([coke], [coke, ice], 2.25)).toBe("Added Ice 2kg bag. Total US$2.25.");
  });

  it("says a new quantity on a line already there", () => {
    expect(saleChangeWords([coke], [{ ...coke, quantity: 3 }], 2.25)).toBe("Coca-Cola 500ml, 3. Total US$2.25.");
  });

  it("says what was removed", () => {
    expect(saleChangeWords([coke, ice], [coke], 0.75)).toBe("Removed Ice 2kg bag. Total US$0.75.");
  });

  it("says when the sale empties, and when lines come back at once", () => {
    expect(saleChangeWords([coke, ice], [], 0)).toBe("The sale is empty.");
    expect(saleChangeWords([], [coke, ice], 2.25)).toBe("2 lines back on the sale. Total US$2.25.");
    expect(saleChangeWords([], [], 0)).toBe("");
  });
});
