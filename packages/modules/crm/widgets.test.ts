import { describe, it, expect } from "vitest";

import { packRows, type WidgetInstance } from "./widgets";

const w = (id: string, span: WidgetInstance["span"]): WidgetInstance => ({
  id,
  type: "metric",
  span,
});

/** Widths only — the assertion is about the shape of the rows. */
const spans = (widgets: WidgetInstance[]) => widgets.map((widget) => widget.span);

describe("packRows", () => {
  it("keeps the order somebody dragged things into", () => {
    const packed = packRows([w("a", 4), w("b", 4), w("c", 4)]);
    expect(packed.map((widget) => widget.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves a row that already adds up alone", () => {
    expect(spans(packRows([w("a", 4), w("b", 4), w("c", 4)]))).toEqual([4, 4, 4]);
    expect(spans(packRows([w("a", 6), w("b", 6)]))).toEqual([6, 6]);
    expect(spans(packRows([w("a", 8), w("b", 4)]))).toEqual([8, 4]);
  });

  it("widens a big element to full width rather than leaving a gap", () => {
    // The complaint in one line: an eight-wide chart with four columns of
    // nothing beside it.
    expect(spans(packRows([w("a", 8)]))).toEqual([12]);
    expect(spans(packRows([w("a", 6)]))).toEqual([12]);
  });

  it("makes two adjacent big columns into a two-column row", () => {
    expect(spans(packRows([w("a", 8), w("b", 8)]))).toEqual([6, 6]);
  });

  it("preserves which of a pair was the bigger one", () => {
    expect(spans(packRows([w("a", 8), w("b", 3)]))).toEqual([8, 4]);
    expect(spans(packRows([w("a", 3), w("b", 8)]))).toEqual([4, 8]);
  });

  it("evens out four narrow widgets into quarters", () => {
    expect(spans(packRows([w("a", 3), w("b", 3), w("c", 3), w("d", 3)]))).toEqual([
      3, 3, 3, 3,
    ]);
  });

  it("never leaves a row short", () => {
    const layouts: WidgetInstance[][] = [
      [w("a", 3)],
      [w("a", 3), w("b", 4)],
      [w("a", 4), w("b", 6)],
      [w("a", 6), w("b", 4), w("c", 4)],
      [w("a", 12), w("b", 3), w("c", 8)],
      [w("a", 3), w("b", 3), w("c", 3), w("d", 3), w("e", 6), w("f", 8)],
    ];

    for (const layout of layouts) {
      let row = 0;
      for (const widget of packRows(layout)) {
        row += widget.span;
        expect(row).toBeLessThanOrEqual(12);
        if (row === 12) row = 0;
      }
      // Anything left over is a row that does not fill its width.
      expect(row).toBe(0);
    }
  });

  it("keeps every widget — packing is a resize, not a cull", () => {
    const layout = [w("a", 8), w("b", 8), w("c", 3), w("d", 6), w("e", 4)];
    expect(packRows(layout).map((widget) => widget.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("is settled after one pass", () => {
    // Packing an already-packed layout must not move anything, or the display
    // would shuffle on every save.
    const once = packRows([w("a", 8), w("b", 8), w("c", 3), w("d", 6)]);
    expect(packRows(once)).toEqual(once);
  });

  it("says nothing for an empty overview", () => {
    expect(packRows([])).toEqual([]);
  });
});
