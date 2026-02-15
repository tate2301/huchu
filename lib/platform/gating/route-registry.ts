import type { FeatureRouteEntry } from "@/lib/platform/gating/types";

export const PAGE_FEATURE_ROUTES: FeatureRouteEntry[] = [
  { scope: "page", prefix: "/login", featureKey: "core.auth.login" },
  { scope: "page", prefix: "/help", featureKey: "core.help.quick-tips" },

  { scope: "page", prefix: "/cctv/live", featureKey: "cctv.live" },
  { scope: "page", prefix: "/cctv/cameras", featureKey: "cctv.cameras" },
  { scope: "page", prefix: "/cctv/nvrs", featureKey: "cctv.nvrs" },
  { scope: "page", prefix: "/cctv/events", featureKey: "cctv.events" },
  { scope: "page", prefix: "/cctv/playback", featureKey: "cctv.playback" },
  { scope: "page", prefix: "/cctv/access-logs", featureKey: "cctv.access-logs" },
  { scope: "page", prefix: "/cctv/overview", featureKey: "cctv.overview" },
  { scope: "page", prefix: "/cctv", featureKey: "cctv.overview" },

  { scope: "page", prefix: "/human-resources/payroll", featureKey: "hr.payroll" },
  { scope: "page", prefix: "/human-resources/disbursements", featureKey: "hr.disbursements" },
  { scope: "page", prefix: "/human-resources/compensation", featureKey: "hr.compensation-rules" },
  { scope: "page", prefix: "/human-resources/salaries", featureKey: "hr.salaries" },
  { scope: "page", prefix: "/human-resources/approvals", featureKey: "hr.approvals-history" },
  { scope: "page", prefix: "/human-resources/incidents", featureKey: "hr.incidents" },
  { scope: "page", prefix: "/human-resources/payouts", featureKey: "hr.gold-payouts" },
  { scope: "page", prefix: "/human-resources", featureKey: "hr.employees" },

  { scope: "page", prefix: "/maintenance/work-orders", featureKey: "maintenance.work-orders" },
  { scope: "page", prefix: "/maintenance/equipment", featureKey: "maintenance.equipment" },
  { scope: "page", prefix: "/maintenance/breakdown", featureKey: "maintenance.breakdowns" },
  { scope: "page", prefix: "/maintenance/schedule", featureKey: "maintenance.schedule" },
  { scope: "page", prefix: "/maintenance", featureKey: "maintenance.dashboard" },

  { scope: "page", prefix: "/stores/movements", featureKey: "stores.movements" },
  { scope: "page", prefix: "/stores/inventory", featureKey: "stores.inventory" },
  { scope: "page", prefix: "/stores/issue", featureKey: "stores.issue" },
  { scope: "page", prefix: "/stores/receive", featureKey: "stores.receive" },
  { scope: "page", prefix: "/stores/fuel", featureKey: "stores.fuel-ledger" },
  { scope: "page", prefix: "/stores/dashboard", featureKey: "stores.dashboard" },
  { scope: "page", prefix: "/stores", featureKey: "stores.dashboard" },

  { scope: "page", prefix: "/accounting/chart-of-accounts", featureKey: "accounting.chart-of-accounts" },
  { scope: "page", prefix: "/accounting/journals", featureKey: "accounting.journals" },
  { scope: "page", prefix: "/accounting/periods", featureKey: "accounting.periods" },
  { scope: "page", prefix: "/accounting/posting-rules", featureKey: "accounting.posting-rules" },
  { scope: "page", prefix: "/accounting/trial-balance", featureKey: "accounting.trial-balance" },
  { scope: "page", prefix: "/accounting/financial-statements", featureKey: "accounting.financial-statements" },
  { scope: "page", prefix: "/accounting/sales", featureKey: "accounting.ar" },
  { scope: "page", prefix: "/accounting/purchases", featureKey: "accounting.ap" },
  { scope: "page", prefix: "/accounting/banking", featureKey: "accounting.banking" },
  { scope: "page", prefix: "/accounting/assets", featureKey: "accounting.fixed-assets" },
  { scope: "page", prefix: "/accounting/budgets", featureKey: "accounting.budgets" },
  { scope: "page", prefix: "/accounting/cost-centers", featureKey: "accounting.cost-centers" },
  { scope: "page", prefix: "/accounting/currency", featureKey: "accounting.multi-currency" },
  { scope: "page", prefix: "/accounting/tax", featureKey: "accounting.tax" },
  { scope: "page", prefix: "/accounting/fiscalisation", featureKey: "accounting.zimra.fiscalisation" },
  { scope: "page", prefix: "/accounting", featureKey: "accounting.core" },

  { scope: "page", prefix: "/gold/intake/pours", featureKey: "gold.intake.pours" },
  { scope: "page", prefix: "/gold/transit/dispatches", featureKey: "gold.dispatches" },
  { scope: "page", prefix: "/gold/dispatch", featureKey: "gold.dispatches" },
  { scope: "page", prefix: "/gold/settlement/receipts", featureKey: "gold.receipts" },
  { scope: "page", prefix: "/gold/receipt", featureKey: "gold.receipts" },
  { scope: "page", prefix: "/gold/reconciliation", featureKey: "gold.reconciliation" },
  { scope: "page", prefix: "/gold/exceptions", featureKey: "gold.exceptions" },
  { scope: "page", prefix: "/gold/audit", featureKey: "gold.audit-trail" },
  { scope: "page", prefix: "/gold/payouts", featureKey: "gold.payouts" },
  { scope: "page", prefix: "/gold/settlement/payouts", featureKey: "gold.payouts" },
  { scope: "page", prefix: "/gold", featureKey: "gold.home" },

  { scope: "page", prefix: "/compliance", featureKey: "compliance.overview" },
  { scope: "page", prefix: "/attendance", featureKey: "ops.attendance.mark" },
  { scope: "page", prefix: "/shift-report", featureKey: "ops.shift-report.submit" },
  { scope: "page", prefix: "/plant-report", featureKey: "ops.plant-report.submit" },

  { scope: "page", prefix: "/reports/cctv-events", featureKey: "reports.cctv-events" },
  { scope: "page", prefix: "/reports/compliance-incidents", featureKey: "reports.compliance-incidents" },
  { scope: "page", prefix: "/reports/downtime", featureKey: "reports.downtime-analytics" },
  { scope: "page", prefix: "/reports/maintenance-work-orders", featureKey: "reports.maintenance-work-orders" },
  { scope: "page", prefix: "/reports/maintenance-equipment", featureKey: "reports.maintenance-equipment" },
  { scope: "page", prefix: "/reports/gold-chain", featureKey: "reports.gold-chain" },
  { scope: "page", prefix: "/reports/gold-receipts", featureKey: "reports.gold-receipts" },
  { scope: "page", prefix: "/reports/audit-trails", featureKey: "reports.audit-trails" },
  { scope: "page", prefix: "/reports/fuel-ledger", featureKey: "reports.fuel-ledger" },
  { scope: "page", prefix: "/reports/stores-movements", featureKey: "reports.stores-movements" },
  { scope: "page", prefix: "/reports/attendance", featureKey: "reports.attendance" },
  { scope: "page", prefix: "/reports/shift", featureKey: "reports.shift" },
  { scope: "page", prefix: "/reports/plant", featureKey: "reports.plant" },
  { scope: "page", prefix: "/reports", featureKey: "reports.dashboard" },
];

export const API_FEATURE_ROUTES: FeatureRouteEntry[] = [
  { scope: "api", prefix: "/api/notifications/push-subscriptions", featureKey: "core.notifications.push" },
  { scope: "api", prefix: "/api/notifications", featureKey: "core.notifications.center" },

  { scope: "api", prefix: "/api/users", featureKey: "admin.users" },
  { scope: "api", prefix: "/api/sites", featureKey: "admin.sites-sections" },
  { scope: "api", prefix: "/api/sections", featureKey: "admin.sites-sections" },
  { scope: "api", prefix: "/api/payroll/config", featureKey: "admin.payroll-config" },

  { scope: "api", prefix: "/api/cctv/streams", featureKey: "cctv.streaming-control" },
  { scope: "api", prefix: "/api/cctv/stream-token", featureKey: "cctv.streaming-control" },
  { scope: "api", prefix: "/api/cctv/playback", featureKey: "cctv.playback" },
  { scope: "api", prefix: "/api/cctv/access-logs", featureKey: "cctv.access-logs" },
  { scope: "api", prefix: "/api/cctv/events", featureKey: "cctv.events" },
  { scope: "api", prefix: "/api/cctv/cameras", featureKey: "cctv.cameras" },
  { scope: "api", prefix: "/api/cctv/nvrs", featureKey: "cctv.nvrs" },

  { scope: "api", prefix: "/api/shift-reports", featureKey: "ops.shift-report.submit" },
  { scope: "api", prefix: "/api/attendance", featureKey: "ops.attendance.mark" },
  { scope: "api", prefix: "/api/plant-reports", featureKey: "ops.plant-report.submit" },

  { scope: "api", prefix: "/api/payroll", featureKey: "hr.payroll" },
  { scope: "api", prefix: "/api/disbursements", featureKey: "hr.disbursements" },
  { scope: "api", prefix: "/api/compensation", featureKey: "hr.compensation-rules" },
  { scope: "api", prefix: "/api/employee-payments", featureKey: "hr.salaries" },
  { scope: "api", prefix: "/api/approvals/history", featureKey: "hr.approvals-history" },
  { scope: "api", prefix: "/api/hr/incidents", featureKey: "hr.incidents" },
  { scope: "api", prefix: "/api/hr/disciplinary-actions", featureKey: "hr.disciplinary-actions" },
  { scope: "api", prefix: "/api/employees", featureKey: "hr.employees" },

  { scope: "api", prefix: "/api/gold/dispatches", featureKey: "gold.dispatches" },
  { scope: "api", prefix: "/api/gold/receipts", featureKey: "gold.receipts" },
  { scope: "api", prefix: "/api/gold/pours", featureKey: "gold.intake.pours" },
  { scope: "api", prefix: "/api/gold/corrections", featureKey: "gold.reconciliation" },
  { scope: "api", prefix: "/api/gold/shift-allocations", featureKey: "gold.payouts" },

  { scope: "api", prefix: "/api/inventory/items", featureKey: "stores.inventory" },
  { scope: "api", prefix: "/api/inventory/movements", featureKey: "stores.movements" },
  { scope: "api", prefix: "/api/stock-locations", featureKey: "stores.inventory" },

  { scope: "api", prefix: "/api/accounting/coa", featureKey: "accounting.chart-of-accounts" },
  { scope: "api", prefix: "/api/accounting/journals", featureKey: "accounting.journals" },
  { scope: "api", prefix: "/api/accounting/periods", featureKey: "accounting.periods" },
  { scope: "api", prefix: "/api/accounting/posting-rules", featureKey: "accounting.posting-rules" },
  { scope: "api", prefix: "/api/accounting/reports/trial-balance", featureKey: "accounting.trial-balance" },
  { scope: "api", prefix: "/api/accounting/reports/financials", featureKey: "accounting.financial-statements" },
  { scope: "api", prefix: "/api/accounting/reports/cash-flow", featureKey: "accounting.financial-statements" },
  { scope: "api", prefix: "/api/accounting/reports/ar-aging", featureKey: "accounting.ar" },
  { scope: "api", prefix: "/api/accounting/reports/customer-statement", featureKey: "accounting.ar" },
  { scope: "api", prefix: "/api/accounting/reports/ap-aging", featureKey: "accounting.ap" },
  { scope: "api", prefix: "/api/accounting/reports/vendor-statement", featureKey: "accounting.ap" },
  { scope: "api", prefix: "/api/accounting/reports/vat-summary", featureKey: "accounting.tax" },
  { scope: "api", prefix: "/api/accounting/sales", featureKey: "accounting.ar" },
  { scope: "api", prefix: "/api/accounting/purchases", featureKey: "accounting.ap" },
  { scope: "api", prefix: "/api/accounting/banking", featureKey: "accounting.banking" },
  { scope: "api", prefix: "/api/accounting/assets", featureKey: "accounting.fixed-assets" },
  { scope: "api", prefix: "/api/accounting/budgets", featureKey: "accounting.budgets" },
  { scope: "api", prefix: "/api/accounting/cost-centers", featureKey: "accounting.cost-centers" },
  { scope: "api", prefix: "/api/accounting/currency", featureKey: "accounting.multi-currency" },
  { scope: "api", prefix: "/api/accounting/tax", featureKey: "accounting.tax" },
  { scope: "api", prefix: "/api/accounting/fiscalisation", featureKey: "accounting.zimra.fiscalisation" },
  { scope: "api", prefix: "/api/accounting", featureKey: "accounting.core" },

  { scope: "api", prefix: "/api/work-orders", featureKey: "maintenance.work-orders" },
  { scope: "api", prefix: "/api/equipment", featureKey: "maintenance.equipment" },
  { scope: "api", prefix: "/api/analytics/downtime", featureKey: "reports.downtime-analytics" },
  { scope: "api", prefix: "/api/downtime-codes", featureKey: "maintenance.breakdowns" },

  { scope: "api", prefix: "/api/compliance/permits", featureKey: "compliance.permits" },
  { scope: "api", prefix: "/api/compliance/inspections", featureKey: "compliance.inspections" },
  { scope: "api", prefix: "/api/compliance/incidents", featureKey: "compliance.incidents" },
  { scope: "api", prefix: "/api/compliance/training-records", featureKey: "compliance.training-records" },
];

function normalizePath(pathname: string): string {
  const value = pathname.trim();
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function sortByPrefixLength<T extends { prefix: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.prefix.length - a.prefix.length);
}

const PAGE_PREFIX_SORTED = sortByPrefixLength(PAGE_FEATURE_ROUTES);
const API_PREFIX_SORTED = sortByPrefixLength(API_FEATURE_ROUTES);

export function resolveFeatureKeyForPath(pathname: string): string | null {
  const normalizedPath = normalizePath(pathname).toLowerCase();
  const prefixes = normalizedPath.startsWith("/api/") ? API_PREFIX_SORTED : PAGE_PREFIX_SORTED;
  const match = prefixes.find((row) => normalizedPath.startsWith(row.prefix.toLowerCase()));
  return match?.featureKey ?? null;
}

export function getAllRouteFeatureKeys(): string[] {
  return Array.from(new Set([...PAGE_FEATURE_ROUTES, ...API_FEATURE_ROUTES].map((row) => row.featureKey))).sort();
}
