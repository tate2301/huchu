/**
 * The sizes of a builder's panels: the outline's and the inspector's widths,
 * the shelf's height and its two fixed columns. Each panel resizes from its
 * edge between the limits the boards set, and each person's sizes are kept.
 */
export type PanelName = "outline" | "inspector" | "shelf" | "questions" | "steps";
export type PanelSizes = Record<PanelName, number>;

/** The boards' sizes (spec/shell.md, "The builder"). */
export const DEFAULT_SIZES: PanelSizes = { outline: 240, inspector: 320, shelf: 272, questions: 200, steps: 360 };

/** How far each panel goes: the boards' `min-` and `max-` beside each `resize`. */
export const SIZE_LIMITS: Record<PanelName, readonly [number, number]> = {
  outline: [200, 400],
  inspector: [280, 520],
  shelf: [160, 560],
  questions: [160, 320],
  steps: [260, 560],
};

export function clampSize(panel: PanelName, size: number): number {
  const [min, max] = SIZE_LIMITS[panel];
  if (!Number.isFinite(size)) return DEFAULT_SIZES[panel];
  return Math.round(Math.min(max, Math.max(min, size)));
}

/** Where a person's sizes are kept for one kind of builder. Signed out, nobody's are kept. */
export function sizesKey(scope: string, userId: string | null | undefined): string | null {
  return userId ? `builder-sizes:${scope}:${userId}` : null;
}

/** Sizes as stored, each checked: anything missing, unreadable or out of bounds falls back. */
export function readSizes(raw: string | null): PanelSizes {
  if (!raw) return { ...DEFAULT_SIZES };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SIZES };
  }
  const stored = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const sizes = { ...DEFAULT_SIZES };
  for (const panel of Object.keys(DEFAULT_SIZES) as PanelName[]) {
    const value = stored[panel];
    if (typeof value === "number") sizes[panel] = clampSize(panel, value);
  }
  return sizes;
}

/** A step of the arrow keys on an edge: 16px, or 64px with Shift. */
export function stepSize(panel: PanelName, size: number, direction: 1 | -1, large: boolean): number {
  return clampSize(panel, size + direction * (large ? 64 : 16));
}
