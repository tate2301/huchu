/**
 * Receive's live figures for the board's counts (40-buying 5.7): PO-0003's
 * second delivery, Castle 120 with 6 broken, Chibuku 144, Coca-Cola 90 and
 * Sprite 72 closed, at the seeded costs (0.86, 0.82, 0.52, 0.52).
 */
import { describe, expect, it } from "vitest";

import { checkersWords, postedWords, receiveTotals, rowFigures, whenYouPost, type ReceiveRow } from "./receive-math";

const row = (key: string, name: string, ordered: number, due: number, unitCost: number, thisTime: number, damaged = 0, rest: "KEEP" | "CLOSE" = "KEEP"): ReceiveRow => ({
  key,
  name,
  ordered,
  due,
  unitCost,
  thisTime,
  damaged,
  rest,
});

const board = [
  row("castle", "Castle Lager 340ml", 240, 120, 0.86, 120, 6),
  row("chibuku", "Chibuku Scud 1L", 240, 180, 0.82, 144),
  row("coke", "Coca-Cola 500ml", 180, 90, 0.52, 90),
  row("sprite", "Sprite 500ml", 120, 90, 0.52, 72, 0, "CLOSE"),
];

describe("the board's counts", () => {
  it("totals 780 · 426 · 6 · 54 and US$300.36", () => {
    expect(receiveTotals(board)).toMatchObject({ lines: 4, ordered: 780, thisTime: 426, damaged: 6, toCome: 54, inStock: 420, value: 300.36, damagedValue: 5.16 });
    expect(board.map((line) => rowFigures(line).value)).toEqual([98.04, 118.08, 46.8, 37.44]);
    expect(board.map((line) => rowFigures(line).toCome)).toEqual([0, 36, 0, 18]);
  });

  it("says the four sentences as the board does", () => {
    expect(whenYouPost(receiveTotals(board), "Harare Main Branch", "Delta Beverages")).toEqual([
      { tone: "ok", text: "420 units go into stock at Harare Main Branch, on sale at once." },
      { tone: "warn", text: "1 line stays on order: 36 units still to come. The order stays part delivered." },
      { tone: "hollow", text: "1 line is closed short. You pay only for what came." },
      { tone: "bad", text: "A claim for 6 damaged units, US$5.16, goes to Delta Beverages." },
    ]);
  });

  it("says nothing is left when every line is in or closed, and nothing to claim", () => {
    const allIn = [row("coke", "Coca-Cola 500ml", 180, 90, 0.52, 90)];
    expect(whenYouPost(receiveTotals(allIn), "Harare Main Branch", "Delta Beverages").map((sentence) => sentence.text)).toEqual([
      "90 units go into stock at Harare Main Branch, on sale at once.",
      "Nothing left to come. The order closes.",
      "No lines closed short.",
      "Nothing damaged, nothing to claim.",
    ]);
  });

  it("flags more than is still to come, and more broken than came", () => {
    expect(rowFigures(row("castle", "Castle", 240, 120, 0.86, 121))).toMatchObject({ over: true, toCome: 0 });
    expect(rowFigures(row("castle", "Castle", 240, 120, 0.86, 6, 7))).toMatchObject({ tooBroken: true, inStock: 0 });
  });

  it("words the status line", () => {
    expect(postedWords(420, 36)).toBe("420 units in stock, 36 still on order.");
    expect(checkersWords(["Tafara Nyathi", "Tendai Mhlanga"])).toBe("Tafara Nyathi or Tendai Mhlanga will post it.");
  });
});
