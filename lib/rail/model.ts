import type { WorkspaceNavSection } from "@/lib/workspaces";

import {
  areasFromSections,
  splitLooseAreas,
  type RailArea,
} from "./areas";
import type { NavItem } from "@/lib/navigation";

/**
 * The rail never scrolls.
 *
 * A rail you have to scroll hides its own contents, so what it can hold is
 * worked out rather than hoped for, and the shape that fits is the shape it
 * takes. Everything below is that arithmetic, in the units the rail is drawn
 * in.
 */

/** A destination row: 32 tall, 1 of gap. */
const ROW = 33;
/** A heading inside the panel: 28 tall, 14 above it. */
const HEADING = 42;
/** A mark in tier one: 36 tall, 6 of gap. */
const SLOT = 42;

/** Panel chrome: the header (52), search and New (82), the shelf (116). */
const PANEL_CHROME = 250;
/** Tier-one chrome: the company mark (52) and the person (56). */
const TIER_ONE_CHROME = 108;

/**
 * The shortest window the shape is decided for.
 *
 * Decided once, at this height, and not re-decided while somebody resizes: a
 * rail that rearranges itself under the cursor is worse than one that is a
 * little sparse on a tall screen.
 */
const REFERENCE_HEIGHT = 720;

/** Six, however much room is left. Seven favourites is a search. */
const MAX_PINS = 6;

/**
 * Ten marks, and no more.
 *
 * Eleven areas is not a longer column, it is two workspaces — tier one runs
 * out of room at fourteen slots and pins need some of them. A company with
 * every module on trips this, and the answer is to read its modules at their
 * own level rather than at their bands': one mark for Campus, not eight.
 */
const MAX_AREAS = 10;

export type RailShape = "flat" | "areas";

export type RailModel = {
  shape: RailShape;
  areas: RailArea[];
  /** What the whole tree would cost the panel, in pixels. */
  cost: number;
  /** What the panel has to spend at the reference height. */
  budget: number;
  /** How many pins tier one can hold beside the areas it must show. */
  pinCapacity: number;
  /** Destinations that were an area of one: rows in the map, never marks. */
  loose: NavItem[];
  /**
   * Areas whose own panel would still overflow, with the rows they hold.
   *
   * Only a tenant running every module at once reaches this today, and what it
   * needs is the third level the design puts on the page: the area's own
   * groups, drawn as rows, with the destinations under them. Reported rather
   * than clipped so it cannot be mistaken for a rail that fits.
   */
  overflowing: RailArea[];
};

export function panelBudget(height: number = REFERENCE_HEIGHT): number {
  return Math.max(0, height - PANEL_CHROME);
}

/** What a workspace's whole tree costs if every area were open at once. */
export function flatCost(areas: RailArea[]): number {
  return areas.reduce(
    (total, area) => total + HEADING + area.items.length * ROW,
    0,
  );
}

function pinCapacityFor(areaCount: number, shape: RailShape): number {
  const slots = Math.floor((REFERENCE_HEIGHT - TIER_ONE_CHROME) / SLOT);
  const takenByAreas = shape === "areas" ? areaCount : 0;
  return Math.max(0, Math.min(MAX_PINS, slots - takenByAreas));
}

/**
 * The rail, decided.
 *
 * `flat` is every area and every destination in the panel at once, with tier
 * one carrying pins alone — no marks to learn. `areas` moves the areas into
 * tier one and gives the panel one of them at a time. Turning on an addon can
 * move a workspace from the first to the second; that is the honest
 * consequence of a fixed budget, and better than the same rail with six rows
 * hidden under the fold.
 */
export function getRailModel(sections: WorkspaceNavSection[]): RailModel {
  let split = splitLooseAreas(areasFromSections(sections));
  if (split.areas.length > MAX_AREAS) {
    // Too many to hold: stop flattening and take each module whole. A rail
    // that shows a tenth of the areas and hides the rest is worse than one
    // that shows every module and asks for one more press.
    split = splitLooseAreas(areasFromSections(sections, { flatten: false }));
  }
  const { areas, loose } = split;
  const cost = flatCost(areas) + loose.length * ROW;
  const budget = panelBudget();
  const shape: RailShape = cost <= budget ? "flat" : "areas";
  const panelRows = Math.floor(budget / ROW);
  return {
    shape,
    areas,
    cost,
    budget,
    loose,
    overflowing: areas.filter((area) => area.items.length > panelRows),
    pinCapacity: pinCapacityFor(areas.length, shape),
  };
}

/** The area a destination belongs to, or null when nothing matches. */
export function areaForHref(
  areas: RailArea[],
  href: string | null,
): RailArea | null {
  if (!href) return null;
  return areas.find((area) => area.items.some((i) => i.href === href)) ?? null;
}

/** Every destination in the workspace, for search and for resolving a pin. */
export function allDestinations(areas: RailArea[]) {
  return areas.flatMap((area) =>
    area.items.map((item) => ({ item, areaId: area.id, areaLabel: area.label })),
  );
}
