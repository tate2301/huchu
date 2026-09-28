import { describe, expect, it } from "vitest";

import { pathToPolygons, rasterizeLogo, renderAsciiLogo, renderLogoCells } from "@/lib/platform/ascii-logo";

describe("pathToPolygons", () => {
  it("reads relative commands against the cursor and implicit linetos after a moveto", () => {
    expect(pathToPolygons("m10 10 5 0 0 5z")).toEqual([
      [
        [10, 10],
        [15, 10],
        [15, 15],
      ],
    ]);
  });

  it("ends a cubic on its last control point", () => {
    const [polygon] = pathToPolygons("M0 0 C0 10 10 10 10 0 L5 -5Z");
    expect(polygon.at(-2)).toEqual([10, 0]);
  });
});

describe("rasterizeLogo", () => {
  it("keeps the requested width and the mark's proportions", () => {
    const grid = rasterizeLogo({ part: "mark", columns: 40 }).coverage;
    expect(grid.every((row) => row.length === 40)).toBe(true);
    // The mark is taller than wide; at a 2:1 cell that is just over half as many rows.
    expect(grid.length).toBeGreaterThan(20);
    expect(grid.length).toBeLessThan(26);
  });

  it("cuts the peak out of the shield", () => {
    const grid = rasterizeLogo({ part: "mark", columns: 40 }).coverage;
    const middle = grid[Math.round(grid.length * 0.4)];
    // Solid on both flanks, open through the centre.
    expect(middle[5]).toBeGreaterThan(0.9);
    expect(middle[20]).toBe(0);
    expect(middle[34]).toBeGreaterThan(0.9);
  });

  it("opens the counter of the wordmark's o", () => {
    const grid = rasterizeLogo({ part: "wordmark", columns: 120 }).coverage;
    const covered = grid.flat().filter((c) => c > 0.5).length;
    expect(covered).toBeGreaterThan(0);
    expect(covered).toBeLessThan(grid.flat().length / 2);
  });

  it.each([24, 40, 58, 90])("leaves a blank gutter between the shield and its base at %i columns", (columns) => {
    const { coverage, layers } = rasterizeLogo({ part: "mark", columns });
    const visible = (r: number, c: number) => (coverage[r]?.[c] ?? 0) >= 0.2;
    const touching: string[] = [];
    let baseCells = 0;
    layers.forEach((row, r) =>
      row.forEach((layer, c) => {
        if (!layer || !visible(r, c)) return;
        if (layer === "base") baseCells++;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const other = layers[r + dr]?.[c + dc];
            if (other && other !== layer) touching.push(`${layer} ${r},${c} touches ${other}`);
          }
        }
      }),
    );
    expect(touching).toEqual([]);
    expect(baseCells).toBeGreaterThan(0);
  });
});

describe("renderAsciiLogo", () => {
  it("fills the shield and the base each with its own text, in reading order", () => {
    const cells = renderLogoCells({ style: "text", columns: 40, fill: { shield: "abcdefghij", base: "0123456789" } });
    const shield = cells.flat().filter((cell) => cell.layer === "shield");
    const base = cells.flat().filter((cell) => cell.layer === "base");
    expect(shield.map((cell) => cell.char).join("").startsWith("abcdefghij")).toBe(true);
    expect(base.map((cell) => cell.char).join("").startsWith("0123456789")).toBe(true);
    expect(shield.every((cell) => /[a-j]/.test(cell.char))).toBe(true);
    expect(base.every((cell) => /\d/.test(cell.char))).toBe(true);
    expect(base.map((cell) => cell.index).slice(0, 3)).toEqual([0, 1, 2]);
  });

  it("packs four samples into each block character", () => {
    const ramp = renderAsciiLogo({ style: "ramp", columns: 40 }).split("\n");
    const blocks = renderAsciiLogo({ style: "blocks", columns: 40 }).split("\n");
    expect(Math.max(...blocks.map((line) => line.length))).toBeLessThanOrEqual(40);
    expect(Math.abs(blocks.length - ramp.length)).toBeLessThanOrEqual(1);
  });
});
