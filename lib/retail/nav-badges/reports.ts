import { REPORT_AREAS } from "@/lib/reports/areas";
import { retailTemplates } from "@/lib/reports/templates";

import type { NavBadgeContext, NavBadgeProvider } from "./types";

/**
 * Reports' figures (70-insights-reports 5.9): how many templates the caller may
 * open, all of them and per area, as plain counts ("16", "4"). An area with
 * none for this person is not drawn at all (`whenBadge` on its nav item).
 *
 * Every provider reads the same catalogue, worked out once per request.
 */
const counted = new WeakMap<NavBadgeContext, Promise<Map<string, number>>>();

function countsFor(ctx: NavBadgeContext): Promise<Map<string, number>> {
  let counts = counted.get(ctx);
  if (!counts) {
    counts = retailTemplates(ctx).then((entries) => {
      const byArea = new Map<string, number>([["all", entries.length]]);
      for (const entry of entries) byArea.set(entry.area.slug, (byArea.get(entry.area.slug) ?? 0) + 1);
      return byArea;
    });
    counted.set(ctx, counts);
  }
  return counts;
}

const plain = (count: number) => String(count);

export const REPORTS_NAV_BADGES: readonly NavBadgeProvider[] = [
  {
    href: "/retail/reports",
    requires: [["retail.reports", "view"]],
    count: async (ctx) => (await countsFor(ctx)).get("all") ?? 0,
    label: plain,
  },
  ...REPORT_AREAS.map(
    (area): NavBadgeProvider => ({
      href: `/retail/reports?area=${area.slug}`,
      requires: [["retail.reports", "view"]],
      count: async (ctx) => (await countsFor(ctx)).get(area.slug) ?? 0,
      label: plain,
    }),
  ),
];
