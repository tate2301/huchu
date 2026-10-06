import { REPORT_AREAS } from "@/lib/reports/areas";
import { result } from "@/lib/reports/loaders/shared";
import { retailTemplates, type RetailTemplateEntry, type TemplateViewer } from "@/lib/reports/templates";
import { SEEN_BY_WORDS, lastOpenedLabel } from "@/lib/reports/template-words";
import type { ListOption, ReportContext, ReportLoader, ReportRow } from "@/lib/reports/types";

/**
 * Every template (`retail-report-templates`, 70-insights-reports 5.10): the
 * templates `retailTemplates` finds for the caller, one row each. Made by
 * reads "Built in", "You" or the maker's name; Last opened is the workspace's,
 * not the caller's.
 */

function madeByKey(entry: RetailTemplateEntry, userId: string): string {
  if (entry.builtIn) return "built-in";
  return entry.madeById === userId ? "you" : entry.madeById!;
}

export function catalogueRow(entry: RetailTemplateEntry, viewer: TemplateViewer, now: Date): ReportRow {
  const key = madeByKey(entry, viewer.userId);
  return {
    id: entry.ref,
    name: entry.name,
    summary: entry.summary,
    area: entry.area.label,
    areaSlug: entry.area.slug,
    areaOrder: REPORT_AREAS.findIndex((area) => area.slug === entry.area.slug),
    madeBy: key === "built-in" ? "Built in" : key === "you" ? "You" : entry.madeBy,
    madeByTone: key === "built-in" ? "faint" : null,
    madeById: entry.madeById,
    madeByKey: key,
    origin: entry.builtIn ? "BUILT_IN" : "SAVED",
    whose: key === "you" ? "MINE" : "OTHERS",
    builtIn: entry.builtIn,
    seenBy: SEEN_BY_WORDS[entry.audience],
    seenByKey: entry.audience,
    lastOpened: entry.lastOpenedAt ? lastOpenedLabel(entry.lastOpenedAt, now) : null,
    lastOpenedAt: entry.lastOpenedAt?.toISOString() ?? null,
    canChange: entry.canChange,
    href: `/retail/reports/${entry.ref}`,
  };
}

export async function loadTemplateCatalog(ctx: ReportContext, now = new Date()) {
  const entries = await retailTemplates(ctx);
  return result(entries.map((entry) => catalogueRow(entry, ctx, now)));
}

/** Made by: Built in, You, then everyone else who made a template the caller sees, by name. */
async function templateOptions(ctx: ReportContext): Promise<Record<string, ListOption[]>> {
  const makers = new Map<string, string>();
  for (const entry of await retailTemplates(ctx)) {
    if (!entry.builtIn && entry.madeById && entry.madeById !== ctx.userId) makers.set(entry.madeById, entry.madeBy!);
  }
  return {
    madeBy: [
      { value: "built-in", label: "Built in" },
      { value: "you", label: "You" },
      ...[...makers]
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(([value, label]) => ({ value, label })),
    ],
  };
}

export const REPORT_CATALOG_LOADERS: Record<string, ReportLoader> = {
  "retail-report-templates": { load: (ctx) => loadTemplateCatalog(ctx), options: templateOptions },
};
