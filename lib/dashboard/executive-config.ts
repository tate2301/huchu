import type { UserRole } from "@/lib/roles";

export const EXECUTIVE_DASHBOARD_RANGES = ["7d", "30d", "90d"] as const;
export type ExecutiveDashboardRange = (typeof EXECUTIVE_DASHBOARD_RANGES)[number];

export const EXECUTIVE_DEFAULT_DASHBOARD_RANGE: ExecutiveDashboardRange = "30d";
export const EXECUTIVE_FULL_VIEW_ROLES: UserRole[] = ["SUPERADMIN", "MANAGER"];
export const EXECUTIVE_MAX_QUICK_LINKS = 12;

export type ExecutiveQuickLinkModule =
  | "gold"
  | "stores"
  | "finance"
  | "workforce"
  | "operations"
  | "maintenance"
  | "compliance"
  | "security"
  | "reports"
  | "general";

export const EXECUTIVE_QUICK_LINK_BASE_PRIORITY: Record<string, number> = {
  "/human-resources/approvals": 95,
  "/human-resources/payroll": 92,
  "/human-resources/disbursements": 90,
  "/gold/exceptions": 89,
  "/gold/settlement/receipts/new": 88,
  "/reports/gold-chain": 86,
  "/maintenance/work-orders": 84,
  "/reports/compliance-incidents": 83,
  "/compliance": 81,
  "/cctv/events": 80,
  "/reports/cctv-events": 79,
  "/stores/inventory": 76,
  "/reports/downtime": 75,
  "/reports/stores-movements": 72,
  "/reports/plant": 70,
  "/reports/attendance": 69,
  "/reports/shift": 68,
  "/accounting": 86,
  "/accounting/banking": 84,
  "/accounting/financial-statements": 83,
  "/reports": 64,
  "/dashboard": 60,
};

export const EXECUTIVE_QUICK_LINK_BADGE_LABELS: Record<string, string> = {
  "/human-resources/approvals": "Pending approvals",
  "/human-resources/payroll": "Pending payroll",
  "/human-resources/disbursements": "Pending disbursements",
  "/gold/exceptions": "Open exceptions",
  "/gold/settlement/receipts/new": "Pending receipts",
  "/reports/gold-chain": "Open custody gaps",
  "/maintenance/work-orders": "Open work orders",
  "/reports/compliance-incidents": "Open incidents",
  "/compliance": "Risk items",
  "/cctv/events": "Unack events",
  "/reports/cctv-events": "Unack events",
  "/stores/inventory": "Low stock",
  "/reports/downtime": "Downtime hrs",
  "/reports/stores-movements": "Movements",
  "/reports/plant": "Pending plant",
  "/reports/attendance": "Attendance gaps",
  "/reports/shift": "Pending shifts",
  "/accounting": "Open ledgers",
  "/accounting/banking": "Open cash issues",
  "/accounting/financial-statements": "Open finance items",
};

export function parseExecutiveDashboardRange(
  value: string | null | undefined,
): ExecutiveDashboardRange {
  if (!value) return EXECUTIVE_DEFAULT_DASHBOARD_RANGE;
  if (EXECUTIVE_DASHBOARD_RANGES.includes(value as ExecutiveDashboardRange)) {
    return value as ExecutiveDashboardRange;
  }
  return EXECUTIVE_DEFAULT_DASHBOARD_RANGE;
}

export function getExecutiveDashboardRangeDays(range: ExecutiveDashboardRange): number {
  switch (range) {
    case "7d":
      return 7;
    case "90d":
      return 90;
    case "30d":
    default:
      return 30;
  }
}

export function getQuickLinkModule(href: string): ExecutiveQuickLinkModule {
  if (href.startsWith("/gold")) return "gold";
  if (href.startsWith("/stores")) return "stores";
  if (href.startsWith("/accounting")) return "finance";
  if (href.startsWith("/human-resources")) return "workforce";
  if (href.startsWith("/maintenance")) return "maintenance";
  if (href.startsWith("/compliance")) return "compliance";
  if (href.startsWith("/cctv")) return "security";
  if (href.startsWith("/shift-report") || href.startsWith("/plant-report") || href.startsWith("/attendance")) {
    return "operations";
  }
  if (href.startsWith("/reports")) return "reports";
  return "general";
}

export function getQuickLinkBasePriority(href: string): number {
  return EXECUTIVE_QUICK_LINK_BASE_PRIORITY[href] ?? 48;
}
