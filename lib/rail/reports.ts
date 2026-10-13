import type { NavItem } from "@/lib/navigation";

import type { RailArea } from "./areas";

/**
 * "Reports from <module>" in a module's panel (design/core-modules/spec/routes.md §0).
 *
 * The reports registry keys a report by the page it is about (`href`), and a
 * built-in custom report by the reports it reads. A report belongs to the
 * module whose rows hold that page: the area with the row whose address
 * matches it most closely.
 */
export type PanelReport = {
  key: string;
  title: string;
  /** Where it opens: `/reports/{key}` or `/reports/built/{key}`. */
  href: string;
  /** The pages it is about, as the registry names them (`/crm/deals/{id}`). */
  about: string[];
};

/** A page as the registry names it, without its record (`/crm/deals/{id}` → `/crm/deals`) or query. */
function pageOf(href: string): string {
  const path = href.split(/[?#]/)[0] ?? href;
  const segments = path.split("/");
  const cut = segments.findIndex((segment) => segment.includes("{"));
  const page = (cut >= 0 ? segments.slice(0, cut) : segments).join("/");
  return page.length > 1 ? page.replace(/\/+$/, "") : page || "/";
}

function itemPath(item: NavItem): string {
  return item.href.split("?")[0] ?? item.href;
}

/** The area whose row matches a page most closely, or null. */
export function areaForPage(areas: readonly RailArea[], href: string): RailArea | null {
  const page = pageOf(href);
  let best: { area: RailArea; length: number } | null = null;
  for (const area of areas) {
    for (const item of area.items) {
      const path = itemPath(item);
      const matches = path === "/" ? page === "/" : page === path || page.startsWith(`${path}/`);
      if (matches && (!best || path.length > best.length)) best = { area, length: path.length };
    }
  }
  return best?.area ?? null;
}

/**
 * The reports that belong to one area, in the order given. A report about
 * pages in several modules belongs to the module of the first. Reports' own
 * module lists none: its panel is the reports.
 */
export function reportsForArea(
  reports: readonly PanelReport[],
  areas: readonly RailArea[],
  areaId: string,
): PanelReport[] {
  const area = areas.find((candidate) => candidate.id === areaId);
  if (!area || area.items.some((item) => itemPath(item) === "/reports")) return [];
  return reports.filter((report) => {
    const first = report.about[0];
    return first ? areaForPage(areas, first)?.id === areaId : false;
  });
}
