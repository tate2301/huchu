/**
 * What the dashboard tiles are given: figures already written ("US$1,284.60",
 * "+8.2%"), a tone that says whether a figure is good or bad news, and, for
 * charts, the numbers to draw.
 */
export type DashTone = "ok" | "bad" | "warn";

/** A signed change and its judgement: "+8.2%" ok, "−US$0.31" bad. */
export type Delta = { text: string; tone?: DashTone | null };

/** Categorical series colours, fixed per entity (cash is always `s1`). */
export type SeriesColor = "s1" | "s2" | "s3" | "s4" | "data" | "muted";

export function toneClass(tone: DashTone | null | undefined) {
  return tone ? `cx-df-tone-${tone}` : undefined;
}
