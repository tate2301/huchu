import { resolveFeatureKeyForPath as resolveFeatureKeyForPathFromRegistry } from "@/lib/platform/gating/route-registry";

export type FeatureDomain =
  | "core"
  | "operations"
  | "stores"
  | "gold"
  | "hr"
  | "maintenance"
  | "compliance"
  | "cctv"
  | "reports"
  | "admin";

export interface FeatureCatalogEntry {
  key: string;
  name: string;
  description: string;
  domain: FeatureDomain;
  defaultEnabled: boolean;
  isBillable: boolean;
  monthlyPrice: number;
}

export interface FeatureBundleDefinition {
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  additionalSiteMonthlyPrice: number;
  features: string[];
}

export interface TierDefinition {
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  includedSites: number;
  additionalSiteMonthlyPrice: number;
  warningDays: number;
  graceDays: number;
  includedFeatures: string[];
  includedBundles: string[];
}

function f(entry: FeatureCatalogEntry): FeatureCatalogEntry {
  return entry;
}

export const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  f({ key: "core.auth.login", name: "Login", description: "Authentication and session access.", domain: "core", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "core.help.quick-tips", name: "Quick Tips", description: "In-app quick tips and onboarding help.", domain: "core", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "core.notifications.center", name: "Notification Center", description: "In-app notification center.", domain: "core", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "core.notifications.push", name: "Push Notifications", description: "Web push notifications and subscriptions.", domain: "core", defaultEnabled: true, isBillable: true, monthlyPrice: 5 }),
  f({ key: "core.multitenancy.tenant-host-enforcement", name: "Tenant Host Enforcement", description: "Tenant host-based access enforcement.", domain: "core", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),

  f({ key: "ops.shift-report.submit", name: "Shift Reports", description: "Submit and manage shift reports.", domain: "operations", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "ops.attendance.mark", name: "Attendance", description: "Attendance capture and attendance APIs.", domain: "operations", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "ops.plant-report.submit", name: "Plant Reports", description: "Plant report submission and tracking.", domain: "operations", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),

  f({ key: "stores.dashboard", name: "Stores Dashboard", description: "Stores dashboard and summaries.", domain: "stores", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "stores.inventory", name: "Inventory", description: "Inventory item and stock control.", domain: "stores", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "stores.movements", name: "Stock Movements", description: "Stock movement logs and actions.", domain: "stores", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "stores.issue", name: "Issue Stock", description: "Issue stock workflows.", domain: "stores", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "stores.receive", name: "Receive Stock", description: "Receive stock workflows.", domain: "stores", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "stores.fuel-ledger", name: "Fuel Ledger", description: "Fuel-related stock and reporting.", domain: "stores", defaultEnabled: true, isBillable: true, monthlyPrice: 12 }),

  f({ key: "gold.home", name: "Gold Home", description: "Gold module landing and navigation.", domain: "gold", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "gold.intake.pours", name: "Gold Pours", description: "Gold pour intake workflows.", domain: "gold", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "gold.dispatches", name: "Gold Dispatches", description: "Gold dispatch registration and tracking.", domain: "gold", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "gold.receipts", name: "Gold Receipts", description: "Buyer receipts and settlement records.", domain: "gold", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "gold.reconciliation", name: "Gold Reconciliation", description: "Gold reconciliation workflows.", domain: "gold", defaultEnabled: true, isBillable: true, monthlyPrice: 20 }),
  f({ key: "gold.exceptions", name: "Gold Exceptions", description: "Exception and anomaly tracking in gold flows.", domain: "gold", defaultEnabled: true, isBillable: true, monthlyPrice: 8 }),
  f({ key: "gold.audit-trail", name: "Gold Audit Trail", description: "Gold audit and traceability pages.", domain: "gold", defaultEnabled: true, isBillable: true, monthlyPrice: 10 }),
  f({ key: "gold.payouts", name: "Gold Payouts", description: "Gold payout workflows.", domain: "gold", defaultEnabled: true, isBillable: true, monthlyPrice: 18 }),

  f({ key: "hr.employees", name: "Employees", description: "Employee records and directory.", domain: "hr", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "hr.incidents", name: "HR Incidents", description: "HR incident management.", domain: "hr", defaultEnabled: true, isBillable: true, monthlyPrice: 10 }),
  f({ key: "hr.disciplinary-actions", name: "Disciplinary Actions", description: "Disciplinary action lifecycle.", domain: "hr", defaultEnabled: true, isBillable: true, monthlyPrice: 10 }),
  f({ key: "hr.compensation-rules", name: "Compensation Rules", description: "Compensation profiles/rules/templates.", domain: "hr", defaultEnabled: true, isBillable: true, monthlyPrice: 14 }),
  f({ key: "hr.salaries", name: "Salaries", description: "Salary records and salary operations.", domain: "hr", defaultEnabled: true, isBillable: true, monthlyPrice: 12 }),
  f({ key: "hr.payroll", name: "Payroll", description: "Payroll periods and runs.", domain: "hr", defaultEnabled: true, isBillable: true, monthlyPrice: 20 }),
  f({ key: "hr.disbursements", name: "Disbursements", description: "Cash disbursement batch operations.", domain: "hr", defaultEnabled: true, isBillable: true, monthlyPrice: 12 }),
  f({ key: "hr.approvals-history", name: "Approvals History", description: "Approval history and audit approvals.", domain: "hr", defaultEnabled: true, isBillable: true, monthlyPrice: 6 }),
  f({ key: "hr.gold-payouts", name: "HR Gold Payouts", description: "Gold payouts from HR perspective.", domain: "hr", defaultEnabled: true, isBillable: true, monthlyPrice: 8 }),

  f({ key: "maintenance.dashboard", name: "Maintenance Dashboard", description: "Maintenance dashboard.", domain: "maintenance", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "maintenance.equipment", name: "Equipment Register", description: "Equipment lifecycle and maintenance meta.", domain: "maintenance", defaultEnabled: true, isBillable: true, monthlyPrice: 12 }),
  f({ key: "maintenance.work-orders", name: "Work Orders", description: "Work order operations and workflows.", domain: "maintenance", defaultEnabled: true, isBillable: true, monthlyPrice: 12 }),
  f({ key: "maintenance.breakdowns", name: "Breakdown Tracking", description: "Breakdown logging and remediation.", domain: "maintenance", defaultEnabled: true, isBillable: true, monthlyPrice: 8 }),
  f({ key: "maintenance.schedule", name: "Maintenance Schedule", description: "Planned maintenance schedule.", domain: "maintenance", defaultEnabled: true, isBillable: true, monthlyPrice: 8 }),

  f({ key: "compliance.overview", name: "Compliance Overview", description: "Compliance dashboard/overview.", domain: "compliance", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "compliance.permits", name: "Permits", description: "Permit lifecycle management.", domain: "compliance", defaultEnabled: true, isBillable: true, monthlyPrice: 10 }),
  f({ key: "compliance.inspections", name: "Inspections", description: "Inspection records and actions.", domain: "compliance", defaultEnabled: true, isBillable: true, monthlyPrice: 10 }),
  f({ key: "compliance.incidents", name: "Compliance Incidents", description: "Compliance incident tracking.", domain: "compliance", defaultEnabled: true, isBillable: true, monthlyPrice: 12 }),
  f({ key: "compliance.training-records", name: "Training Records", description: "Training records and expiries.", domain: "compliance", defaultEnabled: true, isBillable: true, monthlyPrice: 8 }),

  f({ key: "cctv.overview", name: "CCTV Overview", description: "CCTV overview and site status.", domain: "cctv", defaultEnabled: false, isBillable: true, monthlyPrice: 20 }),
  f({ key: "cctv.live", name: "Live Monitor", description: "Live CCTV stream viewing.", domain: "cctv", defaultEnabled: false, isBillable: true, monthlyPrice: 25 }),
  f({ key: "cctv.cameras", name: "CCTV Cameras", description: "Camera inventory and management.", domain: "cctv", defaultEnabled: false, isBillable: true, monthlyPrice: 15 }),
  f({ key: "cctv.nvrs", name: "CCTV NVRs", description: "NVR inventory and management.", domain: "cctv", defaultEnabled: false, isBillable: true, monthlyPrice: 15 }),
  f({ key: "cctv.events", name: "CCTV Events", description: "Event ingestion and event browsing.", domain: "cctv", defaultEnabled: false, isBillable: true, monthlyPrice: 18 }),
  f({ key: "cctv.playback", name: "CCTV Playback", description: "Playback search and review.", domain: "cctv", defaultEnabled: false, isBillable: true, monthlyPrice: 18 }),
  f({ key: "cctv.access-logs", name: "CCTV Access Logs", description: "Access logs for CCTV usage.", domain: "cctv", defaultEnabled: false, isBillable: true, monthlyPrice: 10 }),
  f({ key: "cctv.streaming-control", name: "CCTV Streaming Control", description: "Streaming session APIs and stream-token flows.", domain: "cctv", defaultEnabled: false, isBillable: true, monthlyPrice: 18 }),

  f({ key: "reports.dashboard", name: "Reports Dashboard", description: "Top-level reports dashboard.", domain: "reports", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "reports.shift", name: "Shift Reports", description: "Shift reports analytics pages.", domain: "reports", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "reports.attendance", name: "Attendance Reports", description: "Attendance analytics pages.", domain: "reports", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "reports.plant", name: "Plant Reports", description: "Plant analytics pages.", domain: "reports", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "reports.stores-movements", name: "Stores Movements Reports", description: "Stores movement reports.", domain: "reports", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "reports.fuel-ledger", name: "Fuel Ledger Reports", description: "Fuel ledger reports.", domain: "reports", defaultEnabled: true, isBillable: true, monthlyPrice: 6 }),
  f({ key: "reports.maintenance-work-orders", name: "Maintenance Work Order Reports", description: "Work order reporting.", domain: "reports", defaultEnabled: true, isBillable: true, monthlyPrice: 6 }),
  f({ key: "reports.maintenance-equipment", name: "Maintenance Equipment Reports", description: "Equipment performance reporting.", domain: "reports", defaultEnabled: true, isBillable: true, monthlyPrice: 6 }),
  f({ key: "reports.gold-chain", name: "Gold Chain Reports", description: "Gold chain reporting.", domain: "reports", defaultEnabled: true, isBillable: true, monthlyPrice: 8 }),
  f({ key: "reports.gold-receipts", name: "Gold Receipt Reports", description: "Gold receipt reporting.", domain: "reports", defaultEnabled: true, isBillable: true, monthlyPrice: 8 }),
  f({ key: "reports.audit-trails", name: "Audit Trail Reports", description: "Audit trail reporting pages.", domain: "reports", defaultEnabled: true, isBillable: true, monthlyPrice: 6 }),
  f({ key: "reports.downtime-analytics", name: "Downtime Analytics", description: "Downtime analysis reports.", domain: "reports", defaultEnabled: true, isBillable: true, monthlyPrice: 8 }),
  f({ key: "reports.compliance-incidents", name: "Compliance Incidents Reports", description: "Compliance incident reports.", domain: "reports", defaultEnabled: true, isBillable: true, monthlyPrice: 8 }),
  f({ key: "reports.cctv-events", name: "CCTV Event Reports", description: "CCTV event reports.", domain: "reports", defaultEnabled: false, isBillable: true, monthlyPrice: 10 }),

  f({ key: "admin.users", name: "User Administration", description: "User and role administration.", domain: "admin", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "admin.sites-sections", name: "Sites and Sections", description: "Site/section administration.", domain: "admin", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "admin.payroll-config", name: "Payroll Configuration", description: "Payroll configuration endpoints.", domain: "admin", defaultEnabled: true, isBillable: true, monthlyPrice: 6 }),
  f({ key: "admin.feature-flags-console", name: "Feature Flags Console", description: "Platform feature flag operations.", domain: "admin", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
  f({ key: "admin.subscription-console", name: "Subscription Console", description: "Subscription/tier controls in platform.", domain: "admin", defaultEnabled: true, isBillable: false, monthlyPrice: 0 }),
];

export const FEATURE_BUNDLES: FeatureBundleDefinition[] = [
  {
    code: "ADDON_CCTV_SUITE",
    name: "CCTV Suite",
    description: "CCTV operations, streams, events and playback.",
    monthlyPrice: 300,
    additionalSiteMonthlyPrice: 40,
    features: [
      "cctv.overview",
      "cctv.live",
      "cctv.cameras",
      "cctv.nvrs",
      "cctv.events",
      "cctv.playback",
      "cctv.access-logs",
      "cctv.streaming-control",
      "reports.cctv-events",
    ],
  },
  {
    code: "ADDON_ADVANCED_PAYROLL",
    name: "Advanced Payroll",
    description: "Payroll and disbursement heavy workflows.",
    monthlyPrice: 250,
    additionalSiteMonthlyPrice: 30,
    features: ["hr.payroll", "hr.disbursements", "hr.compensation-rules", "admin.payroll-config"],
  },
  {
    code: "ADDON_GOLD_ADVANCED",
    name: "Gold Advanced Controls",
    description: "Advanced gold controls and audit/reconciliation.",
    monthlyPrice: 220,
    additionalSiteMonthlyPrice: 25,
    features: ["gold.reconciliation", "gold.audit-trail", "gold.payouts", "reports.gold-chain", "reports.gold-receipts"],
  },
  {
    code: "ADDON_COMPLIANCE_PRO",
    name: "Compliance Pro",
    description: "Compliance deep controls and reporting.",
    monthlyPrice: 200,
    additionalSiteMonthlyPrice: 25,
    features: ["compliance.overview", "compliance.permits", "compliance.inspections", "compliance.incidents", "compliance.training-records", "reports.compliance-incidents"],
  },
  {
    code: "ADDON_MAINTENANCE_PRO",
    name: "Maintenance Pro",
    description: "Maintenance operations and analytics.",
    monthlyPrice: 180,
    additionalSiteMonthlyPrice: 20,
    features: ["maintenance.equipment", "maintenance.work-orders", "maintenance.breakdowns", "maintenance.schedule", "reports.maintenance-work-orders", "reports.maintenance-equipment"],
  },
  {
    code: "ADDON_ANALYTICS_PRO",
    name: "Analytics Pro",
    description: "Advanced reports and analytical surfaces.",
    monthlyPrice: 160,
    additionalSiteMonthlyPrice: 15,
    features: ["reports.downtime-analytics", "reports.audit-trails", "reports.fuel-ledger"],
  },
];

export const TIERS: TierDefinition[] = [
  {
    code: "BASIC",
    name: "Basic",
    description: "Core ERP operations with standard reporting.",
    monthlyPrice: 450,
    includedSites: 1,
    additionalSiteMonthlyPrice: 90,
    warningDays: 14,
    graceDays: 7,
    includedFeatures: [
      "ops.shift-report.submit",
      "ops.attendance.mark",
      "ops.plant-report.submit",
      "stores.dashboard",
      "stores.inventory",
      "stores.movements",
      "stores.issue",
      "stores.receive",
      "gold.home",
      "gold.intake.pours",
      "gold.dispatches",
      "gold.receipts",
      "hr.employees",
      "maintenance.dashboard",
      "reports.dashboard",
      "reports.shift",
      "reports.attendance",
      "reports.plant",
      "reports.stores-movements",
      "admin.users",
      "admin.sites-sections",
    ],
    includedBundles: [],
  },
  {
    code: "STANDARD",
    name: "Standard",
    description: "Expanded operations and compliance controls.",
    monthlyPrice: 900,
    includedSites: 3,
    additionalSiteMonthlyPrice: 140,
    warningDays: 14,
    graceDays: 7,
    includedFeatures: [
      "stores.fuel-ledger",
      "gold.reconciliation",
      "gold.exceptions",
      "hr.incidents",
      "hr.disciplinary-actions",
      "hr.compensation-rules",
      "hr.salaries",
      "hr.approvals-history",
      "maintenance.equipment",
      "maintenance.work-orders",
      "maintenance.breakdowns",
      "maintenance.schedule",
      "compliance.overview",
      "compliance.permits",
      "compliance.inspections",
      "compliance.incidents",
      "reports.fuel-ledger",
      "reports.maintenance-work-orders",
      "reports.maintenance-equipment",
      "reports.gold-chain",
      "reports.gold-receipts",
      "reports.audit-trails",
      "reports.compliance-incidents",
      "admin.payroll-config",
    ],
    includedBundles: [],
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    description: "Full operating suite with advanced modules.",
    monthlyPrice: 1800,
    includedSites: 8,
    additionalSiteMonthlyPrice: 220,
    warningDays: 21,
    graceDays: 14,
    includedFeatures: [
      "gold.audit-trail",
      "gold.payouts",
      "hr.payroll",
      "hr.disbursements",
      "hr.gold-payouts",
      "compliance.training-records",
      "reports.downtime-analytics",
      "admin.feature-flags-console",
      "admin.subscription-console",
      "core.notifications.push",
    ],
    includedBundles: ["ADDON_ANALYTICS_PRO"],
  },
];

export function getTierDefinition(planCode: string | null | undefined): TierDefinition | null {
  if (!planCode) return null;
  const normalized = planCode.trim().toUpperCase();
  return TIERS.find((tier) => tier.code === normalized) ?? null;
}

export function getBundleDefinition(code: string | null | undefined): FeatureBundleDefinition | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return FEATURE_BUNDLES.find((bundle) => bundle.code === normalized) ?? null;
}

export function resolveFeatureKeyForPath(pathname: string): string | null {
  return resolveFeatureKeyForPathFromRegistry(pathname);
}

export function isKnownFeatureKey(featureKey: string): boolean {
  return FEATURE_CATALOG.some((feature) => feature.key === featureKey);
}
