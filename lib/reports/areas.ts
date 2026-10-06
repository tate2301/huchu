import type { ReportArea } from "@/lib/reports/types";

/**
 * Where a Reports template belongs (70-insights-reports 5.9, 5.11): the six
 * areas, in the order the Reports panel lists them. Every template and every
 * report face names one; nothing else spells an area's name.
 *
 * `icon` names an export of `lib/icons`.
 */
export type ReportAreaInfo = { slug: ReportArea; label: string; icon: string; sub: string };

export const REPORT_AREAS: readonly ReportAreaInfo[] = [
  { slug: "selling", label: "Selling", icon: "Receipt", sub: "Templates that read sales, refunds and the items sold" },
  { slug: "stock", label: "Stock", icon: "Stack", sub: "Templates that read stock on hand, movements and counts" },
  { slug: "buying", label: "Buying", icon: "TrayArrowDown", sub: "Templates that read orders, deliveries and bills" },
  { slug: "customers", label: "Customers", icon: "Users", sub: "Templates that read customers, what they spend and what they owe" },
  { slug: "money", label: "Money", icon: "Money", sub: "Templates that read payments and requisitions" },
  { slug: "floor", label: "The floor", icon: "CashRegister", sub: "Templates that read till shifts, refunds and voids" },
];

/** The area a slug names, or null for one that is not an area. */
export function areaOf(slug: string | null | undefined): ReportAreaInfo | null {
  return REPORT_AREAS.find((area) => area.slug === slug) ?? null;
}
