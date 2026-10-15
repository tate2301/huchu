import { REPORT_AREAS } from "@/lib/reports/areas";
import { areaHref, VERTICAL_AREAS } from "@/lib/reports/verticals";
import {
  CashRegister,
  ChartBar,
  FileText,
  Home,
  IdentificationCard,
  MedusaBookOpenIcon,
  Money,
  Receipt,
  Stack,
  Star,
  TrayArrowDown,
  UserRound,
  Users,
  type LucideIcon,
} from "@/lib/icons";

import type { RetailNavItem, RetailNavModule } from "./types";

/**
 * Reports (PageRetailReports): the Overview, every template and its three
 * views, the seven insights an owner asks of the shop, then one row per area
 * (70-insights-reports 5.9) and the core modules' reports. Owner, manager and
 * bookkeeper only (98-decisions C-35). Each area's badge is how many
 * templates the person may open there; an area with none for them is not
 * drawn.
 */

const AREA_ICONS: Record<string, LucideIcon> = { Receipt, Stack, TrayArrowDown, Users, Money, CashRegister };
const CORE_ICONS: Record<string, LucideIcon> = { Pay: Money, People: IdentificationCard, Books: MedusaBookOpenIcon };

const REPORTS: RetailNavItem["requires"] = [["retail.reports", "view"]];
const INSIGHTS: RetailNavItem["requires"] = [["retail.insights", "view"]];

/** Every template, and its views: the list's own tabs (`retail-report-templates`). */
const list = (tab: string | null) => `/retail/reports?view=all${tab ? `&tab=${tab}` : ""}`;

export const reportsNav: RetailNavModule = {
  id: "retail-reports",
  title: "Reports",
  icon: FileText,
  groups: [
    { id: "insights", label: "Insights" },
    { id: "areas", label: "Areas" },
  ],
  items: [
    { href: "/retail/reports", icon: Home, label: "Overview", exact: true, requires: REPORTS },
    // A template, run (`/retail/reports/{ref}`), is one of All reports.
    { href: list(null), icon: FileText, label: "All reports", requires: REPORTS, also: /^\/retail\/reports\/[^/]+$/ },
    { href: list("built-in"), icon: Star, label: "From Corelith", requires: REPORTS },
    { href: list("team"), icon: Users, label: "Shared with you", requires: REPORTS },
    { href: list("mine"), icon: UserRound, label: "Yours", requires: REPORTS },
    { href: "/retail/insights/sales", icon: ChartBar, label: "Sales", group: "insights", requires: INSIGHTS },
    { href: "/retail/insights/profit", icon: ChartBar, label: "Profit", group: "insights", requires: INSIGHTS },
    { href: "/retail/insights/products", icon: ChartBar, label: "Products", group: "insights", requires: INSIGHTS },
    { href: "/retail/insights/stock", icon: ChartBar, label: "Stock health", group: "insights", requires: INSIGHTS },
    { href: "/retail/insights/losses", icon: ChartBar, label: "Losses", group: "insights", requires: INSIGHTS },
    { href: "/retail/insights/customers", icon: ChartBar, label: "Customers", group: "insights", requires: INSIGHTS },
    // Managers do not see Money (the Roles board).
    { href: "/retail/insights/money", icon: ChartBar, label: "Money", group: "insights", requires: [["retail.money", "view"]] },
    ...REPORT_AREAS.map((area) => ({
      href: `/retail/reports?area=${area.slug}`,
      icon: AREA_ICONS[area.icon] ?? FileText,
      label: area.label,
      group: "areas",
      requires: REPORTS,
      onlyWithBadge: true,
    })),
    // Pay, people and the books: their reports are Reports' own (All reports, by area).
    ...VERTICAL_AREAS.retail.map((area) => ({
      href: areaHref(area),
      icon: CORE_ICONS[area] ?? FileText,
      label: area,
      group: "areas",
      requires: REPORTS,
    })),
  ],
};
