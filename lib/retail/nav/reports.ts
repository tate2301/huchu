import { REPORT_AREAS } from "@/lib/reports/areas";
import { CashRegister, FileText, Money, Receipt, Stack, TrayArrowDown, Users, type LucideIcon } from "@/lib/icons";

import type { RetailNavModule } from "./types";

/**
 * Reports: every template, built in or saved by the team, then one item per
 * area (70-insights-reports 5.9). Owner, manager and bookkeeper only
 * (98-decisions C-35). Each item's badge is how many templates the person may
 * open there; an area with none for them is not drawn.
 */

const AREA_ICONS: Record<string, LucideIcon> = { Receipt, Stack, TrayArrowDown, Users, Money, CashRegister };

export const reportsNav: RetailNavModule = {
  id: "retail-reports",
  title: "Reports",
  icon: FileText,
  items: [
    { href: "/retail/reports", icon: FileText, label: "Every template", requires: [["retail.reports", "view"]] },
    ...REPORT_AREAS.map((area) => ({
      href: `/retail/reports?area=${area.slug}`,
      icon: AREA_ICONS[area.icon] ?? FileText,
      label: area.label,
      requires: [["retail.reports", "view"]] as RetailNavModule["items"][number]["requires"],
      onlyWithBadge: true,
    })),
  ],
};
