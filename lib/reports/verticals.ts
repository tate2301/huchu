/**
 * Each vertical's Reports (`spec/routes.md` §1): the same pages — the
 * Overview, insights, reports and the builder — over its own data. What
 * differs is named here: which workspaces have an Overview at `/reports`,
 * and the areas their panel lists. Pure: the panel, the page and the API all
 * read it.
 */

export const VERTICALS = ["retail", "schools", "mine", "pay", "shop"] as const;
export type Vertical = (typeof VERTICALS)[number];

const BY_PROFILE: Record<string, Vertical> = {
  RETAIL: "retail",
  // Retail is stored under its old name.
  THRIFT: "retail",
  SCHOOLS: "schools",
  GOLD_MINE: "mine",
  PAYROLL: "pay",
  // Retired as a profile; a workshop that still holds it gets its Overview.
  AUTOS: "shop",
};

/** The vertical a workspace profile runs, or null for a general workspace (its Overview is `/reports/insights`). */
export function verticalOf(profile: string | null | undefined): Vertical | null {
  return BY_PROFILE[profile?.trim().toUpperCase() ?? ""] ?? null;
}

/** Where a vertical's Overview is: the retail shop keeps its own Reports. */
export function overviewHref(vertical: Vertical): string {
  return vertical === "retail" ? "/retail/reports" : "/reports";
}

/** Every vertical reads the core modules' reports too: pay, people and the books. */
const CORE_AREAS = ["Pay", "People", "Books"] as const;

/** The areas each vertical's panel lists, in the boards' order: its own, then the core modules'. */
export const VERTICAL_AREAS: Record<Vertical, readonly string[]> = {
  retail: CORE_AREAS,
  schools: ["Fees", "The school day", "Pupils", ...CORE_AREAS],
  mine: ["Production", "Gold", "Stores and maintenance", "Safety and audit", ...CORE_AREAS],
  pay: CORE_AREAS,
  shop: ["Stores and maintenance", "Safety and audit", ...CORE_AREAS],
};

/** An area's reports on All reports. */
export function areaHref(area: string): string {
  return `/reports?area=${encodeURIComponent(area)}`;
}

/** The areas this vertical lists that hold at least one report, with how many. */
export function verticalAreas(vertical: Vertical, areaOfEach: ReadonlyArray<string | null>): Array<{ area: string; count: number }> {
  const counts = new Map<string, number>();
  for (const area of areaOfEach) if (area) counts.set(area, (counts.get(area) ?? 0) + 1);
  return VERTICAL_AREAS[vertical].filter((area) => counts.has(area)).map((area) => ({ area, count: counts.get(area)! }));
}
