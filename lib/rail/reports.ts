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

/**
 * The modules whose reports open at an address of their own
 * (`/books/reports/{key}`, `/crm/reports/built/{key}`), rendering the same
 * report page as `/reports/{key}`. A report belongs to two places — Reports,
 * and the module whose pages it is about — and the address says which one it
 * was opened from, so its panel stays the one it was reached from. Each has
 * the route files under `app/{module}/reports/`.
 */
export const MODULE_REPORT_SCOPES: readonly string[] = ["books", "crm", "people", "payroll", "schools", "retail"];

/**
 * Retail's own `/retail/reports/{ref}` runs its report templates, so only its
 * built-in custom reports take a retail address (`/retail/reports/built/{key}`).
 */
const BUILT_ONLY_SCOPES: readonly string[] = ["retail"];

const MODULE_REPORT_PATH = /^\/([a-z-]+)\/reports\/(built\/)?([^/?#]+)\/?$/;

/** The module a report's page is about: the first segment of the page it reports on. */
function scopeOf(report: Pick<PanelReport, "about">): string | null {
  const first = report.about[0];
  const segment = first ? (pageOf(first).split("/")[1] ?? "") : "";
  return MODULE_REPORT_SCOPES.includes(segment) ? segment : null;
}

/**
 * Where a report opens from its module's panel: at the module's own address
 * when it has one, so the module's panel stays; otherwise at Reports'.
 */
export function moduleReportHref(report: PanelReport): string {
  const scope = scopeOf(report);
  if (!scope || !report.href.startsWith("/reports/")) return report.href;
  if (BUILT_ONLY_SCOPES.includes(scope) && !report.href.startsWith("/reports/built/")) return report.href;
  return `/${scope}${report.href}`;
}

/** A module's address for a report (`/books/reports/x`), read back: the module and the report's key as the panel lists it. */
export function readModuleReportPath(pathname: string): { scope: string; key: string } | null {
  const match = MODULE_REPORT_PATH.exec(pathname);
  if (!match || !MODULE_REPORT_SCOPES.includes(match[1]!)) return null;
  if (BUILT_ONLY_SCOPES.includes(match[1]!) && !match[2]) return null;
  return { scope: match[1]!, key: match[2] ? `built-${match[3]}` : match[3]! };
}

/**
 * The area a module's report address belongs to: the area that lists the
 * report under "Reports from" (the one its page is about), or, until the
 * reports are known, the area of the module's own pages.
 */
export function areaForModuleReport(
  areas: readonly RailArea[],
  reports: readonly PanelReport[] | undefined,
  path: { scope: string; key: string },
): RailArea | null {
  const report = reports?.find((candidate) => candidate.key === path.key);
  const about = report?.about[0];
  return (
    (about ? areaForPage(areas, about) : null) ??
    areaForPage(areas, `/${path.scope}`) ??
    areas.find((area) => area.items.some((item) => (item.href.split("?")[0] ?? item.href).startsWith(`/${path.scope}/`))) ??
    null
  );
}
