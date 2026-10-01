import { canReadReport, canUseAction, type ReportAccess } from "@/lib/reports/access";
import { defaultLayout, fitLayout } from "@/lib/reports/layout";
import type { ReportMeta, ReportDefinition, SavedReportSetup } from "@/lib/reports/types";

/**
 * The reports a person can open, arranged for the business they are in.
 *
 * Which reports exist is decided by what the workspace was provisioned with —
 * a report about a module nobody bought is never listed. Their order is
 * decided by the industry: a mine sees production first and a school fees
 * first, and anything else it has switched on follows, so a workspace that
 * added a module still finds its reports, just after the ones it is about.
 */

export type CatalogEntry = Pick<ReportMeta, "key" | "title" | "area">;

export type CatalogArea = {
  area: string;
  reports: CatalogEntry[];
};

export function reportCatalog(
  sources: readonly ReportDefinition[],
  access: ReportAccess,
  profile: string | null | undefined,
  /** Reports this workspace switched off. */
  disabled: ReadonlySet<string> = new Set(),
): CatalogArea[] {
  const readable = sources.filter((source) => !disabled.has(source.key) && canReadReport(source, access));
  const forProfile = (source: ReportDefinition) => (profile ? source.profiles.includes(profile) : false);

  const areas = new Map<string, { area: string; ours: boolean; reports: CatalogEntry[] }>();
  for (const source of readable) {
    let entry = areas.get(source.area);
    if (!entry) {
      entry = { area: source.area, ours: false, reports: [] };
      areas.set(source.area, entry);
    }
    entry.ours ||= forProfile(source);
    entry.reports.push({ key: source.key, title: source.title, area: source.area });
  }

  // Stable: within each half, areas keep the order the registry declares them in.
  const all = [...areas.values()];
  return [...all.filter((entry) => entry.ours), ...all.filter((entry) => !entry.ours)].map(
    ({ area, reports }) => ({ area, reports }),
  );
}

/**
 * The part of a source the browser is told: only the actions this role may
 * use, and the workspace's own layout and starting view where it saved them.
 */
export function reportMeta(
  source: ReportDefinition,
  role: string,
  params: ReportMeta["params"] = source.params,
  saved: SavedReportSetup | null = null,
): ReportMeta {
  return {
    key: source.key,
    title: source.title,
    area: source.area,
    columns: source.columns,
    params,
    defaults: source.defaults,
    rowActions: (source.rowActions ?? []).filter((action) => canUseAction(action, role)),
    layout: fitLayout(saved?.layout ?? source.layout ?? defaultLayout(source), source.columns),
    ...(saved?.view ? { defaultView: saved.view } : {}),
  };
}
