import type { WorkspaceNavSection } from "@/lib/workspaces";

import { areaRows, areasFromSections, type RailArea } from "./areas";

/**
 * The rail never scrolls.
 *
 * A rail you have to scroll hides its own contents, so what it can hold is
 * worked out rather than hoped for, and the shape that fits is the shape it
 * takes. Everything below is that arithmetic, in the units the rail is drawn
 * in (00-foundations 5.3.2–5.3.3).
 */

/** A panel item: 34 tall, 2 of gap. */
const ROW = 36;
/** A heading inside the panel: 28 tall, 14 above it. */
const HEADING = 42;
/** A mark in the rail: 36 tall, 6 of gap. */
const SLOT = 42;

/** Panel chrome: the header (48), Search (40), the Help and Management shelf (90), air. */
const PANEL_CHROME = 250;
/** Rail chrome: the logo tile (48), the Management gear (42) and the person (42), padding. */
const RAIL_CHROME = 150;

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
 * Eleven areas is not a longer column, it is two workspaces. A company with
 * every module on trips this, and the answer is to read its modules at their
 * own level rather than at their bands': one mark for Campus, not eight.
 */
const MAX_AREAS = 10;

/**
 * `flat`: every area and every item in the panel at once, under headings, with
 * the rail carrying pins alone. `areas`: one mark per area in the rail, and the
 * panel shows the workspace's module list, one module's items or, in a module
 * read whole, one of its folders.
 */
export type RailShape = "flat" | "areas";

export type RailModel = {
  shape: RailShape;
  areas: RailArea[];
  /** What the whole tree would cost the panel, in pixels. */
  cost: number;
  /** What the panel has to spend at the reference height. */
  budget: number;
  /** How many pins the rail can hold beside the marks it must show. */
  pinCapacity: number;
  /**
   * Areas whose panel would still overflow at some level — the area's own rows
   * and folder rows together, or one folder's destinations.
   *
   * An area read whole carries its groups as folders, which is the third level
   * the design puts on the page, so a module of twenty-odd destinations is a
   * panel of seven rows. Reported rather than clipped so a list that grows
   * past it cannot be mistaken for a rail that fits.
   */
  overflowing: RailArea[];
};

export function panelBudget(height: number = REFERENCE_HEIGHT): number {
  return Math.max(0, height - PANEL_CHROME);
}

/** What a workspace's whole tree costs if every area were open at once. */
export function flatCost(areas: RailArea[]): number {
  return areas.reduce((total, area) => total + HEADING + area.items.length * ROW, 0);
}

function pinCapacityFor(areaCount: number, shape: RailShape): number {
  const slots = Math.floor((REFERENCE_HEIGHT - RAIL_CHROME) / SLOT);
  const takenByAreas = shape === "areas" ? areaCount : 0;
  return Math.max(0, Math.min(MAX_PINS, slots - takenByAreas));
}

/**
 * The rail, decided. Turning on a module can move a workspace from `flat` to
 * `areas`; that is the honest consequence of a fixed budget, and better than
 * the same panel with six rows hidden under the fold.
 */
export function getRailModel(sections: WorkspaceNavSection[]): RailModel {
  let areas = areasFromSections(sections);
  if (areas.length > MAX_AREAS) {
    // Too many to hold: stop flattening and take each module whole. A rail
    // that shows a tenth of the areas and hides the rest is worse than one
    // that shows every module and asks for one more press.
    areas = areasFromSections(sections, { flatten: false });
  }
  const cost = flatCost(areas);
  const budget = panelBudget();
  const shape: RailShape = cost <= budget ? "flat" : "areas";
  const panelRows = Math.floor(budget / ROW);
  return {
    shape,
    areas,
    cost,
    budget,
    overflowing: areas.filter(
      (area) =>
        areaRows(area).length + (area.folders?.length ?? 0) > panelRows ||
        (area.folders ?? []).some((folder) => folder.items.length > panelRows),
    ),
    pinCapacity: pinCapacityFor(areas.length, shape),
  };
}

/** The area a destination belongs to, or null when nothing matches. */
export function areaForHref(areas: RailArea[], href: string | null): RailArea | null {
  if (!href) return null;
  return areas.find((area) => area.items.some((item) => item.href === href)) ?? null;
}
