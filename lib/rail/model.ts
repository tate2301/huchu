import type { WorkspaceNavSection } from "@/lib/workspaces";

import { areasFromSections, type RailArea } from "./areas";

/**
 * The rail, in one shape (00-foundations 5.3.2–5.3.3): every area is a module
 * mark in the 56px rail, and the 240px panel beside it lists the current
 * module's items. Management is not a mark among the others; it is the gear at
 * the foot of the rail.
 */

/**
 * Ten marks, and no more.
 *
 * Eleven areas is not a longer column, it is two workspaces. A company with
 * every module on trips this, and the answer is to read its modules at their
 * own level rather than at their bands': one mark for Campus, not eight.
 */
const MAX_AREAS = 10;

/** The section a workspace files its Management items under. */
export const MANAGEMENT_AREA_ID = "retail-manage";

export type RailModel = {
  /** The module marks, in order. */
  areas: RailArea[];
  /** The gear at the foot of the rail, when the role sees any of its items. */
  management: RailArea | null;
};

export function getRailModel(sections: WorkspaceNavSection[]): RailModel {
  let areas = areasFromSections(sections);
  if (areas.length > MAX_AREAS) {
    // Too many to hold: stop flattening and take each module whole. A rail
    // that shows a tenth of the areas and hides the rest is worse than one
    // that shows every module and asks for one more press.
    areas = areasFromSections(sections, { flatten: false });
  }
  const management = areas.find((area) => area.id === MANAGEMENT_AREA_ID) ?? null;
  return {
    areas: areas.filter((area) => area.id !== MANAGEMENT_AREA_ID),
    management,
  };
}

/** The area a destination belongs to, or null when nothing matches. */
export function areaForHref(model: RailModel, href: string | null): RailArea | null {
  if (!href) return null;
  const all = model.management ? [...model.areas, model.management] : model.areas;
  return all.find((area) => area.items.some((item) => item.href === href)) ?? null;
}
