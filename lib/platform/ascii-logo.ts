/**
 * The Corelith logo, rendered as text.
 *
 * The geometry is the lockup served on corelith.co.zw (`svg.cl-logo`), copied
 * path for path: the shield, the base it stands on, and the lowercase
 * wordmark. Nothing here is redrawn by hand. The paths are flattened to
 * polygons, sampled onto a character grid, and each cell's coverage picks a
 * glyph, so every direction below is the real mark at a coarser resolution.
 *
 * Pure TypeScript with no DOM or canvas, so the same code prints a banner in a
 * terminal and renders the art in a browser.
 */

type Point = [number, number];
type Polygon = Point[];
type Transform = (point: Point) => Point;

export type LogoPart = "mark" | "wordmark" | "lockup";
export type AsciiStyle = "ramp" | "outline" | "text" | "blocks";

/** Coverage per character cell, 0 (empty) to 1 (fully inside the mark). */
export type CoverageGrid = number[][];

// `svg.cl-logo` viewBox is "-16 -16 2852.17 648.49"; the shift puts its
// origin at 0,0 so the group transforms below read the same as the source.
const VIEWBOX_ORIGIN: Point = [-16, -16];

const SHIELD_PATH =
  "M590.77 690.58 c-15.38 -4.68 -32.12 -20.80 -36.31 -34.95 -4.18 -13.91 -62.15 -307.32 -62.15 -314.46 0 -13.78 7.51 -28.55 18.83 -36.80 3.45 -2.58 50.09 -26.71 103.63 -53.66 129.85 -65.48 133.29 -67.08 143.75 -69.42 17.35 -3.57 12.06 -5.91 144.86 60.55 87.14 43.69 120.25 60.80 124.43 64.49 11.69 10.22 17.97 25.11 16.74 38.77 -0.86 8.86 -58.71 294.89 -62.52 309.05 -2.22 7.88 -5.54 13.42 -12.80 21.29 -8.62 9.35 -21.91 16.25 -31.38 16.25 -6.03 0 -6.40 -0.25 -25.48 -15.63 -23.02 -18.58 -79.38 -64.98 -115.20 -94.77 -14.89 -12.43 -26.58 -21.29 -28.06 -21.29 -2.22 0 -17.97 12.18 -54.40 41.72 -4.68 3.82 -13.54 10.95 -19.69 16 -6.28 5.05 -14.40 11.69 -18.09 14.89 -22.28 18.71 -65.11 53.54 -70.03 56.86 -3.32 2.22 -10.58 2.71 -16.12 1.11z m70.15 -82.58 c90.46 -75.08 99.82 -82.34 105.60 -83.20 2.95 -0.49 6.52 -0.25 8 0.49 1.48 0.62 17.11 13.29 34.71 27.94 17.60 14.77 38.65 32.25 46.77 38.77 8.12 6.65 26.83 22.03 41.60 34.34 14.89 12.18 27.82 22.28 28.80 22.28 2.09 0 1.72 -1.48 -4.18 -16 -2.34 -5.78 -17.60 -43.45 -33.85 -83.69 -40.62 -100.68 -63.02 -154.22 -92.31 -220.92 -20.68 -46.89 -23.14 -51.57 -26.95 -52.06 -1.85 -0.25 -3.94 0.49 -5.05 1.85 -5.29 5.91 -53.05 115.69 -90.95 209.35 -39.38 97.35 -63.88 159.02 -63.88 160.98 0 2.71 0 2.58 51.69 -40.12z";

const BASE_PATH =
  "M630.77 794.34 c-5.42 -2.71 -7.38 -4.92 -9.60 -10.09 -2.83 -6.52 -14.65 -67.69 -13.66 -70.89 1.35 -4.55 5.29 -7.75 49.72 -41.11 24 -17.97 57.97 -43.32 75.32 -56.49 26.22 -19.57 32.49 -23.75 35.82 -23.75 3.20 0 7.75 2.83 23.63 14.89 10.83 8.25 44.06 33.23 73.85 55.51 29.78 22.40 56 42.34 58.09 44.43 2.22 2.09 4.31 5.54 4.68 7.51 0.98 5.54 -12.18 69.42 -15.14 73.35 -1.23 1.72 -4.18 4.31 -6.40 5.91 l-4.06 2.71 -134.28 0 c-119.38 0 -134.65 -0.25 -137.97 -1.97z";

const WORDMARK_PATH =
  "M 605.18 489.46 C568.83,497.10 533.66,474.89 526.56,439.79 C522.08,417.65 528.22,397.63 544.44,381.48 C553.50,372.47 562.87,367.18 574.69,364.40 C584.96,361.98 604.23,362.91 613.24,366.25 C639.00,375.79 655.38,399.38 655.43,427.00 C655.45,438.63 653.99,444.99 648.79,455.92 C640.88,472.52 624.00,485.51 605.18,489.46Z" +
  "M 1102.50 409.50 L 1101.50 487.50 L 1087.25 487.78 L 1073.00 488.05 L 1073.00 318.00 L 1102.00 318.00 L 1102.00 380.42 L 1106.75 375.80 C1119.81,363.07 1140.99,360.32 1158.24,369.12 C1168.95,374.59 1179.23,388.77 1181.91,401.80 C1182.59,405.12 1183.00,422.25 1183.00,447.58 L 1183.00 488.05 L 1168.75 487.78 L 1154.50 487.50 L 1154.00 447.50 C1153.46,405.06 1153.44,404.89 1148.37,398.25 C1144.21,392.79 1138.75,390.58 1129.50,390.62 C1117.93,390.66 1110.67,394.74 1105.47,404.13Z" +
  "M 826.47 489.49 C798.95,495.32 771.12,483.45 756.72,459.76 C751.09,450.50 748.84,442.37 748.25,429.25 L 747.75 418.00 L 843.00 418.00 L 842.99 414.75 C842.96,405.91 832.63,393.45 822.94,390.58 C807.13,385.88 790.40,391.48 782.41,404.15 L 779.97 408.00 L 766.05 408.00 C757.04,408.00 751.88,407.61 751.44,406.91 C750.34,405.13 758.59,389.67 763.62,384.08 C772.69,373.99 785.86,366.50 799.14,363.89 C808.55,362.04 825.06,363.23 833.28,366.36 C850.91,373.06 862.93,386.01 869.59,405.50 C871.98,412.52 872.33,415.10 872.41,426.50 L 872.50 439.50 L 825.69 439.76 L 778.87 440.02 L 779.54 442.26 C782.04,450.63 790.86,459.67 799.85,463.06 C804.52,464.82 807.06,465.12 814.50,464.77 C824.92,464.28 830.87,461.95 837.31,455.82 C839.52,453.72 842.09,452.00 843.03,452.00 C844.59,452.00 866.00,459.68 866.89,460.56 C867.70,461.37 858.92,471.91 853.76,476.32 C847.08,482.03 835.65,487.54 826.47,489.49Z" +
  "M 1051.44 489.50 C1027.43,494.58 1007.46,484.76 1001.58,464.97 C1000.27,460.56 1000.00,453.72 1000.00,425.32 L 1000.00 391.00 L 981.00 391.00 L 981.00 365.00 L 1000.00 365.00 L 1000.00 335.00 L 1029.00 335.00 L 1029.00 365.00 L 1059.00 365.00 L 1059.00 391.00 L 1029.00 391.00 L 1029.00 422.75 C1029.01,459.30 1029.02,459.35 1037.76,463.22 C1041.90,465.05 1043.14,465.17 1047.99,464.24 C1051.02,463.65 1054.38,463.02 1055.46,462.84 C1057.26,462.53 1057.52,463.48 1058.70,474.46 C1059.40,481.04 1059.62,486.78 1059.18,487.22 C1058.73,487.67 1055.25,488.69 1051.44,489.50Z" +
  "M 699.00 454.61 L 699.00 488.00 L 670.30 488.00 L 669.62 474.25 C668.82,457.74 668.86,374.06 669.68,368.75 L 670.26 365.00 L 699.00 365.00 L 699.00 384.18 L 702.83 379.34 C707.32,373.66 712.83,369.63 719.62,367.05 C725.81,364.70 734.62,363.59 739.93,364.49 L 744.05 365.18 L 743.78 379.84 L 743.50 394.50 L 740.00 394.00 C725.65,391.95 714.87,395.01 707.48,403.23 C699.57,412.03 699.00,415.47 699.00,454.61Z" +
  "M 918.00 318.00 L 918.00 488.00 L 904.17 488.00 C896.56,488.00 890.03,487.70 889.67,487.33 C889.30,486.97 889.00,448.72 889.00,402.33 L 889.00 318.00Z" +
  "M 579.84 463.66 C585.13,465.64 599.24,464.85 605.00,462.27 C623.05,454.17 631.60,431.58 624.08,411.84 C618.23,396.48 605.05,388.22 587.95,389.21 C574.55,389.98 563.74,397.26 557.41,409.75 C554.72,415.06 554.50,416.33 554.50,426.50 C554.50,436.30 554.79,438.12 557.14,443.12 C561.64,452.72 569.45,459.79 579.84,463.66Z" +
  "M 478.50 487.56 C472.09,489.73 468.22,490.33 459.00,490.62 C444.96,491.05 437.52,489.55 426.50,484.07 C409.07,475.42 397.22,461.20 392.44,443.24 C390.82,437.13 390.44,420.07 391.80,414.00 L 392.58 410.50 L 407.75 410.22 L 422.93 409.95 L 421.46 414.13 C414.92,432.65 422.98,452.60 440.60,461.51 C446.03,464.26 447.33,464.50 457.00,464.50 C466.60,464.50 467.96,464.26 472.88,461.67 C479.35,458.26 486.96,451.35 489.56,446.52 C490.60,444.58 491.82,443.00 492.27,443.00 C494.03,443.00 518.00,451.15 518.00,451.74 C518.00,454.05 508.62,467.53 503.49,472.59 C496.16,479.81 489.36,483.88 478.50,487.56Z" +
  "M 968.00 365.00 L 968.00 488.00 L 939.00 488.00 L 939.00 365.00Z" +
  "M 504.29 398.35 C499.46,400.78 493.83,403.46 491.79,404.32 L 488.07 405.87 L 483.97 400.96 C472.69,387.50 450.40,385.00 435.15,395.49 L 430.05 399.00 L 414.02 399.00 C405.21,399.00 398.00,398.76 398.00,398.46 C398.00,395.97 403.61,388.18 409.89,381.95 C418.69,373.21 429.25,367.23 440.74,364.47 C446.43,363.11 450.72,362.84 460.74,363.24 C474.52,363.79 481.62,365.68 491.62,371.49 C497.05,374.64 508.53,385.90 511.29,390.78 L 513.08 393.94Z" +
  "M 968.05 318.00 L 967.50 350.50 L 953.94 350.78 C946.49,350.93 940.08,350.74 939.69,350.36 C939.31,349.98 939.00,342.54 939.00,333.83 L 939.00 318.00Z";

// <g transform="translate(-492.31 -179.83)">
const markTransform: Transform = ([x, y]) => [
  x - 492.31 - VIEWBOX_ORIGIN[0],
  y - 179.83 - VIEWBOX_ORIGIN[1],
];

// <g transform="translate(734.86 80.56) scale(2.632863) translate(-390.97 -318)">
const WORDMARK_SCALE = 2.632863;
const wordmarkTransform: Transform = ([x, y]) => [
  (x - 390.97) * WORDMARK_SCALE + 734.86 - VIEWBOX_ORIGIN[0],
  (y - 318) * WORDMARK_SCALE + 80.56 - VIEWBOX_ORIGIN[1],
];

const CURVE_STEPS = 12;

/**
 * Flattens the subset of SVG path syntax the logo uses — M L C Z in absolute
 * and relative form, with implicit repeats — into closed polygons.
 */
export function pathToPolygons(d: string, transform: Transform = (p) => p): Polygon[] {
  const tokens = d.match(/[MmLlCcZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const polygons: Polygon[] = [];
  let current: Polygon = [];
  let cursor: Point = [0, 0];
  let start: Point = [0, 0];
  let command = "";
  let i = 0;

  const num = () => Number(tokens[i++]);
  const close = () => {
    if (current.length > 2) polygons.push(current.map(transform));
    current = [];
  };

  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
    const relative = command === command.toLowerCase();
    const origin: Point = relative ? cursor : [0, 0];

    switch (command.toUpperCase()) {
      case "M": {
        close();
        cursor = [origin[0] + num(), origin[1] + num()];
        start = cursor;
        current.push(cursor);
        // Pairs after a moveto are implicit linetos.
        command = relative ? "l" : "L";
        break;
      }
      case "L": {
        cursor = [origin[0] + num(), origin[1] + num()];
        current.push(cursor);
        break;
      }
      case "C": {
        const p0 = cursor;
        const p1: Point = [origin[0] + num(), origin[1] + num()];
        const p2: Point = [origin[0] + num(), origin[1] + num()];
        const p3: Point = [origin[0] + num(), origin[1] + num()];
        for (let step = 1; step <= CURVE_STEPS; step++) {
          const t = step / CURVE_STEPS;
          const u = 1 - t;
          current.push([
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
          ]);
        }
        cursor = p3;
        break;
      }
      case "Z": {
        close();
        cursor = start;
        break;
      }
      default:
        throw new Error(`Unsupported path command "${command}"`);
    }
  }
  close();
  return polygons;
}

/**
 * The three shapes in the lockup. They never touch in the SVG, and the
 * renderer keeps them apart on the grid too, so each can carry its own fill.
 */
export type LogoLayer = "shield" | "base" | "wordmark";

const LAYER_POLYGONS: Record<LogoLayer, Polygon[]> = {
  shield: pathToPolygons(SHIELD_PATH, markTransform),
  base: pathToPolygons(BASE_PATH, markTransform),
  wordmark: pathToPolygons(WORDMARK_PATH, wordmarkTransform),
};

// Ordered top to bottom, left to right. Where two layers meet on the grid,
// the later one gives way.
const PART_LAYERS: Record<LogoPart, LogoLayer[]> = {
  mark: ["shield", "base"],
  wordmark: ["wordmark"],
  lockup: ["shield", "base", "wordmark"],
};

export type RasterOptions = {
  part: LogoPart;
  /** Characters across. Rows follow from the logo's proportions. */
  columns: number;
  /** Height of a character cell over its width. Monospace faces sit near 2. */
  cellAspect?: number;
  /** Samples per cell side; 4 gives 16 samples and clean diagonals. */
  samples?: number;
};

export type LogoRaster = {
  /** Coverage of the layer that owns each cell. */
  coverage: CoverageGrid;
  /** The layer each cell belongs to; null where the cell is empty. */
  layers: (LogoLayer | null)[][];
};

type Frame = { left: number; top: number; cellWidth: number; cellHeight: number; rows: number; columns: number };

/**
 * Coverage of one set of polygons over the frame, with even-odd filling — the
 * shield's rule, and the one that punches the counters out of the wordmark.
 */
function sampleCoverage(polygons: Polygon[], frame: Frame, samples: number): CoverageGrid {
  const { left, top, cellWidth, cellHeight, rows, columns } = frame;
  const edges: [Point, Point][] = [];
  for (const polygon of polygons) {
    for (let k = 0; k < polygon.length; k++) {
      edges.push([polygon[k], polygon[(k + 1) % polygon.length]]);
    }
  }

  const grid: CoverageGrid = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
  const weight = 1 / (samples * samples);

  for (let row = 0; row < rows; row++) {
    for (let sy = 0; sy < samples; sy++) {
      const y = top + (row + (sy + 0.5) / samples) * cellHeight;
      const crossings: number[] = [];
      for (const [[x1, y1], [x2, y2]] of edges) {
        if (y1 <= y !== y2 <= y) crossings.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
      crossings.sort((a, b) => a - b);

      // Sample x only grows along the row, so one pointer walks the crossings.
      let passed = 0;
      for (let col = 0; col < columns; col++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = left + (col + (sx + 0.5) / samples) * cellWidth;
          while (passed < crossings.length && crossings[passed] < x) passed++;
          if (passed % 2 === 1) grid[row][col] += weight;
        }
      }
    }
  }
  return grid;
}

/** Coverage from which a cell counts as part of a layer when keeping layers apart. */
const PRESENT = 0.2;

/**
 * Samples each layer of the part onto one shared character grid.
 *
 * At character size the base's roof lands in the cells right under the
 * shield's inner chevron, and the two would merge into one shape. So a cell
 * that touches an earlier layer — the base touching the shield — is given up,
 * which leaves a blank gutter between every pair of layers.
 */
export function rasterizeLogo({ part, columns, cellAspect = 2, samples = 4 }: RasterOptions): LogoRaster {
  const names = PART_LAYERS[part];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const name of names) {
    for (const polygon of LAYER_POLYGONS[name]) {
      for (const [x, y] of polygon) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const cellWidth = (maxX - minX) / columns;
  const cellHeight = cellWidth * cellAspect;
  const rows = Math.ceil((maxY - minY) / cellHeight);
  // Centre the art vertically in the last, partly used row.
  const top = minY - (rows * cellHeight - (maxY - minY)) / 2;
  const frame: Frame = { left: minX, top, cellWidth, cellHeight, rows, columns };

  const perLayer = names.map((name) => sampleCoverage(LAYER_POLYGONS[name], frame, samples));
  const coverage: CoverageGrid = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
  const layers: (LogoLayer | null)[][] = Array.from({ length: rows }, () =>
    new Array<LogoLayer | null>(columns).fill(null),
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      perLayer.forEach((grid, k) => {
        if (grid[r][c] > coverage[r][c]) {
          coverage[r][c] = grid[r][c];
          layers[r][c] = names[k];
        }
      });
    }
  }

  const rank = (layer: LogoLayer) => names.indexOf(layer);
  const present = (r: number, c: number) => (coverage[r]?.[c] ?? 0) >= PRESENT;
  const yielding: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const own = layers[r][c];
      if (!own) continue;
      touching: for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const other = layers[r + dr]?.[c + dc];
          if (!other || other === own || !present(r + dr, c + dc)) continue;
          // A later layer gives way; so does a faint sliver of any layer, which
          // would otherwise print as the one dot that joins the two shapes.
          if (rank(other) < rank(own) || !present(r, c)) {
            yielding.push([r, c]);
            break touching;
          }
        }
      }
    }
  }
  for (const [r, c] of yielding) {
    coverage[r][c] = 0;
    layers[r][c] = null;
  }

  return { coverage, layers };
}

export type LogoCell = {
  char: string;
  layer: LogoLayer | null;
  /** For `text`: the character's position in its layer's fill; otherwise -1. */
  index: number;
};

/** Light to dense. Each step reads a little heavier in a monospace face. */
export const DEFAULT_RAMP = " .:-=+*#%@";

function renderRamp({ coverage, layers }: LogoRaster, ramp: string): LogoCell[][] {
  return coverage.map((row, r) =>
    row.map((c, col) => ({
      char: ramp[Math.min(ramp.length - 1, Math.round(c * (ramp.length - 1)))],
      layer: layers[r][col],
      index: -1,
    })),
  );
}

/**
 * Only the silhouette of each layer, drawn with the stroke that follows it:
 * the gradient of coverage points across the edge, so the glyph runs
 * perpendicular to it.
 */
function renderOutline({ coverage, layers }: LogoRaster, cellAspect: number): LogoCell[][] {
  return coverage.map((row, r) =>
    row.map((c, col) => {
      const own = layers[r][col];
      // Each layer is outlined on its own, as if the others were not there.
      const at = (rr: number, cc: number) => (own && layers[rr]?.[cc] === own ? coverage[rr][cc] : 0);
      const inside = (rr: number, cc: number) => at(rr, cc) >= 0.5;
      // One cell thick: inside cells that touch the outside.
      const onEdge =
        inside(r, col) &&
        !(inside(r - 1, col) && inside(r + 1, col) && inside(r, col - 1) && inside(r, col + 1));
      if (!onEdge) return { char: " ", layer: null, index: -1 };

      const gx = at(r, col + 1) - at(r, col - 1);
      // A row step is `cellAspect` times longer than a column step.
      const gy = (at(r + 1, col) - at(r - 1, col)) / cellAspect;
      // Direction of the edge itself, in screen space (y down), folded to 0–180°.
      const angle = ((Math.atan2(gy, gx) * 180) / Math.PI + 90 + 360) % 180;
      // A bottom edge sits low in its cell; a top edge higher up.
      const char =
        angle < 22.5 || angle >= 157.5 ? (gy < 0 ? "_" : "-") : angle < 67.5 ? "\\" : angle < 112.5 ? "|" : "/";
      return { char, layer: own, index: -1 };
    }),
  );
}

/**
 * Fills each layer with its own stream of text — code, a hash chain, a name —
 * one character per covered cell, in reading order. Spaces stay spaces so the
 * text still reads; at normal density they are too sparse to break the shape.
 */
function renderText({ coverage, layers }: LogoRaster, fill: Partial<Record<LogoLayer, string>>): LogoCell[][] {
  const streams = new Map<LogoLayer, string>();
  const cursors = new Map<LogoLayer, number>();
  const streamFor = (layer: LogoLayer) => {
    if (!streams.has(layer)) streams.set(layer, (fill[layer] ?? "").replace(/\s+/g, " ").trim() || "corelith");
    return streams.get(layer)!;
  };

  return coverage.map((row, r) =>
    row.map((c, col) => {
      const layer = layers[r][col];
      if (!layer || c < 0.45) return { char: " ", layer: null, index: -1 };
      const stream = streamFor(layer);
      const index = cursors.get(layer) ?? 0;
      cursors.set(layer, index + 1);
      return { char: stream[index % stream.length], layer, index };
    }),
  );
}

const QUADRANTS = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█";

/** Unicode quadrant blocks: four samples per character for small sizes. */
function renderBlocks({ coverage, layers }: LogoRaster): LogoCell[][] {
  const cells: LogoCell[][] = [];
  for (let r = 0; r < coverage.length; r += 2) {
    const line: LogoCell[] = [];
    for (let c = 0; c < coverage[r].length; c += 2) {
      const quadrants: [number, number][] = [
        [r, c],
        [r, c + 1],
        [r + 1, c],
        [r + 1, c + 1],
      ];
      let bits = 0;
      let layer: LogoLayer | null = null;
      quadrants.forEach(([rr, cc], bit) => {
        if ((coverage[rr]?.[cc] ?? 0) >= 0.5) {
          bits |= 1 << bit;
          layer ??= layers[rr][cc];
        }
      });
      line.push({ char: QUADRANTS[bits], layer, index: -1 });
    }
    cells.push(line);
  }
  return cells;
}

export type AsciiLogoOptions = {
  part?: LogoPart;
  style?: AsciiStyle;
  /** Characters across the finished art. */
  columns?: number;
  cellAspect?: number;
  /** For `ramp`: glyphs from empty to full. */
  ramp?: string;
  /** For `text`: what each layer is made of. A layer left out reads "corelith". */
  fill?: Partial<Record<LogoLayer, string>>;
};

/** The art as cells, each knowing its layer, for callers that colour by part. */
export function renderLogoCells({
  part = "mark",
  style = "ramp",
  columns = 48,
  cellAspect = 2,
  ramp = DEFAULT_RAMP,
  fill = {},
}: AsciiLogoOptions = {}): LogoCell[][] {
  // Blocks pack a 2x2 of samples into each character, so sample twice as fine.
  const raster = rasterizeLogo({
    part,
    columns: style === "blocks" ? columns * 2 : columns,
    cellAspect,
  });

  if (style === "outline") return renderOutline(raster, cellAspect);
  if (style === "text") return renderText(raster, fill);
  if (style === "blocks") return renderBlocks(raster);
  return renderRamp(raster, ramp);
}

export function renderAsciiLogo(options: AsciiLogoOptions = {}): string {
  return renderLogoCells(options)
    .map((row) => row.map((cell) => cell.char).join("").trimEnd())
    .join("\n");
}
