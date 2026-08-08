import { FEATURE_BUNDLES, FEATURE_CATALOG, TIERS } from "./feature-catalog";
import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import {
  getVerticalProductBundleForTemplate,
  type VerticalProductId,
} from "@/lib/workspace-products";

export interface ClientBundleTemplateDefinition {
  code: string;
  label: string;
  description: string;
  targetClients: string[];
  recommendedTierCode: string;
  bundleCodes: string[];
  featureKeys: string[];
  verticalProductId: VerticalProductId;
  disabledFeatureKeys?: string[];
  includeAllFeatures?: boolean;
}

const allBundleCodes = FEATURE_BUNDLES.map((bundle) => bundle.code);

// Mining-only daily capture surfaces. These began life as the original
// mine-focused build and must never reach non-mining verticals, so every
// non-mining template disables them explicitly even though none of their
// bundles grant them anymore.
const MINE_DAILY_OPS_FEATURE_KEYS = [
  "ops.shift-report.submit",
  "ops.attendance.mark",
  "ops.plant-report.submit",
  "reports.shift",
  "reports.attendance",
  "reports.plant",
] as const;

export const CLIENT_BUNDLE_TEMPLATES: ClientBundleTemplateDefinition[] = [
  {
    code: "TEMPLATE_CORE_STARTER",
    label: "General Business Starter",
    description: "Shared finance, stock, people, and operating controls for growing businesses.",
    targetClients: ["Small company", "Starter operations"],
    recommendedTierCode: "BASIC",
    bundleCodes: ["ADDON_OPERATIONS_CORE", "ADDON_STORES_CORE", "ADDON_WORKFORCE_CORE"],
    featureKeys: [],
    verticalProductId: "general-business",
    disabledFeatureKeys: [...MINE_DAILY_OPS_FEATURE_KEYS],
  },
  {
    code: "TEMPLATE_GOLD_MINE",
    label: "Gold Mine Operations",
    description: "Gold production, settlement, controls, and reporting for mining and mineral-buying operations.",
    targetClients: ["Gold mine", "Mineral processing operation"],
    recommendedTierCode: "ENTERPRISE",
    bundleCodes: [
      "ADDON_OPERATIONS_CORE",
      "ADDON_MINE_DAILY_OPS",
      "ADDON_STORES_CORE",
      "ADDON_WORKFORCE_CORE",
      "ADDON_GOLD_CORE",
      "ADDON_GOLD_ADVANCED",
      "ADDON_COMPLIANCE_PRO",
      "ADDON_MAINTENANCE_PRO",
      "ADDON_ANALYTICS_PRO",
    ],
    featureKeys: [],
    verticalProductId: "gold-operations",
  },
  {
    code: "TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK",
    label: "Multi-Site Operations",
    description: "People, stock, CCTV, and shared controls for smaller companies operating across several sites.",
    targetClients: ["Shops", "SMEs", "Small multi-site company"],
    recommendedTierCode: "STANDARD",
    bundleCodes: [
      "ADDON_OPERATIONS_CORE",
      "ADDON_STORES_CORE",
      "ADDON_WORKFORCE_CORE",
      "ADDON_CCTV_SUITE",
      "ADDON_ANALYTICS_PRO",
    ],
    featureKeys: [],
    verticalProductId: "multi-site-operations",
    disabledFeatureKeys: [...MINE_DAILY_OPS_FEATURE_KEYS],
  },
  {
    code: "TEMPLATE_TECH_WORKSHOP",
    label: "Service Workshop",
    description: "Parts, maintenance, payroll, and job operations for workshop and technician businesses.",
    targetClients: ["Mechanic workshop", "Technician services", "Engineering workshop"],
    recommendedTierCode: "STANDARD",
    bundleCodes: [
      "ADDON_OPERATIONS_CORE",
      "ADDON_STORES_CORE",
      "ADDON_WORKFORCE_CORE",
      "ADDON_MAINTENANCE_PRO",
      "ADDON_ADVANCED_PAYROLL",
    ],
    featureKeys: [],
    verticalProductId: "service-workshop",
    disabledFeatureKeys: [...MINE_DAILY_OPS_FEATURE_KEYS],
  },
  {
    code: "TEMPLATE_SCRAP_METAL",
    label: "Scrap & Recycling",
    description: "Scrap buying, pricing, batching, settlements, and sales for recyclers and scrap traders.",
    targetClients: ["Scrap yards", "Metal recyclers", "Industrial scrap traders"],
    recommendedTierCode: "STANDARD",
    bundleCodes: ["ADDON_WORKFORCE_CORE", "ADDON_SCRAP_METAL_SUITE", "ADDON_ADVANCED_PAYROLL", "ADDON_ANALYTICS_PRO"],
    featureKeys: [],
    verticalProductId: "scrap-recycling",
    disabledFeatureKeys: [
      ...MINE_DAILY_OPS_FEATURE_KEYS,
      "stores.fuel-ledger",
      "maintenance.dashboard",
      "maintenance.equipment",
      "maintenance.work-orders",
      "maintenance.breakdowns",
      "maintenance.schedule",
      "gold.home",
      "gold.intake.pours",
      "gold.dispatches",
      "gold.receipts",
      "gold.reconciliation",
      "gold.exceptions",
      "gold.audit-trail",
      "gold.payouts",
      "schools.core",
      "autos.core",
      "retail.core",
      "portal.schools",
      "portal.autos",
      "portal.pos",
    ],
  },
  {
    code: "TEMPLATE_SCHOOLS",
    label: "School Operations",
    description: "Student, teacher, academics, boarding, finance, and portal workflows for schools.",
    targetClients: ["Schools", "Training institutions", "Education operators"],
    recommendedTierCode: "BASIC",
    bundleCodes: ["ADDON_SCHOOLS_SUITE", "ADDON_PORTAL_SUITE"],
    featureKeys: [],
    verticalProductId: "school-operations",
    disabledFeatureKeys: [
      "ops.shift-report.submit",
      "ops.attendance.mark",
      "ops.plant-report.submit",
      "stores.dashboard",
      "stores.inventory",
      "stores.movements",
      "stores.issue",
      "stores.receive",
      "stores.fuel-ledger",
      "gold.home",
      "gold.intake.pours",
      "gold.dispatches",
      "gold.receipts",
      "gold.reconciliation",
      "gold.exceptions",
      "gold.audit-trail",
      "gold.payouts",
      // The HR keys stay off by default — a school template should not silently
      // bill for payroll — but they are NOT in the disable list any more.
      //
      // `disabledFeatureKeys` is a hard block, not a default: while `hr.payroll`
      // sat here a school could not buy payroll at all, even by adding
      // ADDON_ZIMBABWE_PAYROLL, because provisioning turned it straight back off.
      // A school that wants to pay its teachers from the same `Employee` rows
      // the timetable already uses now can, by buying the addon.
      //
      // The settlement keys are different and stay blocked: they are the gold and
      // scrap payout surface, which a school has no use for and which would render
      // payout screens for commodities it does not handle.
      "settlements.core",
      "settlements.gold",
      "settlements.scrap",
      "maintenance.dashboard",
      "maintenance.equipment",
      "maintenance.work-orders",
      "maintenance.breakdowns",
      "maintenance.schedule",
      "compliance.overview",
      "compliance.permits",
      "compliance.inspections",
      "compliance.incidents",
      "compliance.training-records",
      "cctv.overview",
      "cctv.live",
      "cctv.cameras",
      "cctv.nvrs",
      "cctv.events",
      "cctv.playback",
      "cctv.access-logs",
      "cctv.streaming-control",
      "reports.shift",
      "reports.attendance",
      "reports.plant",
      "reports.dashboard",
      "reports.stores-movements",
      "reports.fuel-ledger",
      "reports.maintenance-work-orders",
      "reports.maintenance-equipment",
      "reports.gold-chain",
      "reports.gold-receipts",
      "reports.audit-trails",
      "reports.downtime-analytics",
      "reports.compliance-incidents",
      "reports.cctv-events",
      "admin.sites-sections",
      "admin.payroll-config",
      "admin.feature-flags-console",
      "admin.subscription-console",
      "autos.core",
      "autos.inventory",
      "autos.leads",
      "autos.deals",
      "autos.financing",
      "retail.core",
      "retail.catalog",
      "retail.pos",
      "retail.purchasing",
      "retail.promotions",
      "retail.shifts",
      "retail.reports",
      "portal.autos",
      "portal.pos",
    ],
  },
  {
    code: "TEMPLATE_CAR_SALES",
    label: "Auto Sales",
    description: "Leads, vehicle inventory, financing, and deal execution for dealerships and traders.",
    targetClients: ["Car dealerships", "Vehicle traders", "Auto sales operators"],
    recommendedTierCode: "BASIC",
    bundleCodes: ["ADDON_AUTOS_SUITE", "ADDON_PORTAL_SUITE"],
    featureKeys: [],
    verticalProductId: "auto-sales",
    disabledFeatureKeys: [
      ...MINE_DAILY_OPS_FEATURE_KEYS,
      "schools.core",
      "retail.core",
      "portal.schools",
      "portal.pos",
    ],
  },
  {
    code: "TEMPLATE_RETAIL",
    label: "Retail",
    description: "Retail, POS, purchasing, merchandising, and cash-up workflows for shop operators.",
    targetClients: ["Small retailers", "Second-hand retail", "Resale marketplaces"],
    recommendedTierCode: "STANDARD",
    bundleCodes: [
      "ADDON_RETAIL_SUITE",
      "ADDON_STORES_CORE",
      "ADDON_WORKFORCE_CORE",
      "ADDON_ACCOUNTING_CORE",
      "ADDON_ACCOUNTING_ADVANCED",
      "ADDON_MAINTENANCE_PRO",
    ],
    featureKeys: [],
    verticalProductId: "retail-operations",
    disabledFeatureKeys: [
      ...MINE_DAILY_OPS_FEATURE_KEYS,
      "stores.fuel-ledger",
      "schools.core",
      "autos.core",
      "gold.home",
      "gold.intake.pours",
      "gold.dispatches",
      "gold.receipts",
      "gold.reconciliation",
      "gold.exceptions",
      "gold.audit-trail",
      "gold.payouts",
      "scrap-metal.home",
      "scrap-metal.purchases",
      "scrap-metal.batches",
      "scrap-metal.sales",
      "scrap-metal.pricing",
      "portal.schools",
      "portal.autos",
    ],
  },
  {
    code: "TEMPLATE_CRM",
    label: "Sales & CRM",
    description: "Lead-to-cash CRM with pipeline, site visits, intake forms, quoting/invoicing, and commissions for sales-led businesses.",
    targetClients: ["Field-sales businesses", "Installers & fitters", "Service sales teams"],
    recommendedTierCode: "STANDARD",
    bundleCodes: [
      "ADDON_CRM_SUITE",
      "ADDON_ACCOUNTING_CORE",
      "ADDON_ACCOUNTING_ADVANCED",
      "ADDON_WORKFORCE_CORE",
    ],
    featureKeys: [],
    verticalProductId: "crm-sales",
    disabledFeatureKeys: [
      ...MINE_DAILY_OPS_FEATURE_KEYS,
      "stores.fuel-ledger",
      "schools.core",
      "autos.core",
      "retail.core",
      "gold.home",
      "gold.intake.pours",
      "gold.dispatches",
      "gold.receipts",
      "gold.reconciliation",
      "gold.exceptions",
      "gold.audit-trail",
      "gold.payouts",
      "scrap-metal.home",
      "scrap-metal.purchases",
      "scrap-metal.batches",
      "scrap-metal.sales",
      "scrap-metal.pricing",
      "portal.schools",
      "portal.autos",
      "portal.pos",
    ],
  },
  {
    // Payroll on its own. The template a client who wants nothing else is
    // provisioned from — everything they need and nothing they will never open.
    //
    // Accounting is deliberately *not* in the disable list even though it is not
    // bundled: a bureau that later wants a ledger buys `ADDON_*` for it and the
    // payroll starts posting. Blocking it would make that upgrade impossible,
    // which is the mistake `TEMPLATE_SCHOOLS` made with `hr.payroll`.
    code: "TEMPLATE_PAYROLL_BUREAU",
    label: "Payroll",
    description:
      "Zimbabwe payroll on its own — employees, compensation, statutory tables, runs, payslips and the monthly returns.",
    targetClients: [
      "Payroll bureaux",
      "Accounting practices running client payrolls",
      "Companies that want payroll only",
    ],
    recommendedTierCode: "STANDARD",
    bundleCodes: [
      "ADDON_WORKFORCE_CORE",
      "ADDON_ADVANCED_PAYROLL",
      "ADDON_ZIMBABWE_PAYROLL",
    ],
    featureKeys: [],
    verticalProductId: "payroll-services",
    disabledFeatureKeys: [
      ...MINE_DAILY_OPS_FEATURE_KEYS,
      "stores.dashboard",
      "stores.inventory",
      "stores.movements",
      "stores.issue",
      "stores.receive",
      "stores.fuel-ledger",
      // The reports that read those modules. Leaving them on puts a Stores
      // entry back in a sidebar whose stores pages are all disabled.
      "reports.stores-movements",
      "reports.downtime-analytics",
      "gold.home",
      "gold.intake.pours",
      "gold.dispatches",
      "gold.receipts",
      "gold.reconciliation",
      "gold.exceptions",
      "gold.audit-trail",
      "gold.payouts",
      // A bureau paying salaries has no commodity to settle, and the screens
      // would be empty tabs.
      "settlements.core",
      "settlements.gold",
      "settlements.scrap",
      "schools.core",
      "retail.core",
      "retail.pos",
      "autos.core",
      "maintenance.dashboard",
      "maintenance.equipment",
      "maintenance.work-orders",
      "maintenance.breakdowns",
      "maintenance.schedule",
      "cctv.overview",
      "cctv.live",
      "cctv.cameras",
      "cctv.nvrs",
      "cctv.events",
      "cctv.playback",
      "cctv.access-logs",
      "cctv.streaming-control",
    ],
  },
  {
    code: "TEMPLATE_ALL_FEATURES",
    label: "All Features",
    description: "Enable every feature in the platform catalog for complex or custom enterprise estates.",
    targetClients: ["Power users", "Large operators", "Custom enterprise tenants"],
    recommendedTierCode: "ENTERPRISE",
    bundleCodes: allBundleCodes,
    featureKeys: [],
    verticalProductId: "general-business",
    includeAllFeatures: true,
  },
];

const TEMPLATE_ALIASES: Record<string, string> = {
  BASE: "TEMPLATE_CORE_STARTER",
  GOLD: "TEMPLATE_GOLD_MINE",
  SCHOOL: "TEMPLATE_SCHOOLS",
  SCHOOLS: "TEMPLATE_SCHOOLS",
  SCRAP: "TEMPLATE_SCRAP_METAL",
  SCRAP_METAL: "TEMPLATE_SCRAP_METAL",
  AUTOS: "TEMPLATE_CAR_SALES",
  "CAR-SALES": "TEMPLATE_CAR_SALES",
  CAR_SALES: "TEMPLATE_CAR_SALES",
  THRIFT: "TEMPLATE_RETAIL",
  RETAIL: "TEMPLATE_RETAIL",
  CRM: "TEMPLATE_CRM",
  SALES: "TEMPLATE_CRM",
  FULL: "TEMPLATE_ALL_FEATURES",
  ALL: "TEMPLATE_ALL_FEATURES",
  PAYROLL: "TEMPLATE_PAYROLL_BUREAU",
  BUREAU: "TEMPLATE_PAYROLL_BUREAU",
  HR: "TEMPLATE_PAYROLL_BUREAU",
};

function normalizeCode(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function toCanonicalFeatureKey(key: string): string {
  const normalized = normalizeFeatureKey(String(key || ""));
  const exact = FEATURE_CATALOG.find(
    (feature) => normalizeFeatureKey(feature.key) === normalized,
  );
  return exact?.key ?? normalized;
}

export function getClientTemplateDefinition(code: string | null | undefined): ClientBundleTemplateDefinition | null {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const resolved = TEMPLATE_ALIASES[normalized] ?? normalized;
  return CLIENT_BUNDLE_TEMPLATES.find((template) => template.code === resolved) ?? null;
}

export function resolveClientTemplateCode(code: string | null | undefined): string | null {
  return getClientTemplateDefinition(code)?.code ?? null;
}

export function getClientTemplateBundleCodes(code: string | null | undefined): string[] {
  const template = getClientTemplateDefinition(code);
  if (!template) return [];
  const existingCodes = new Set(FEATURE_BUNDLES.map((bundle) => bundle.code));
  return template.bundleCodes.filter((bundleCode, index, arr) => arr.indexOf(bundleCode) === index && existingCodes.has(bundleCode));
}

function collectFeaturesFromTier(tierCode: string): string[] {
  const tier = TIERS.find((row) => row.code === normalizeCode(tierCode));
  if (!tier) return [];
  const keys: string[] = [...tier.includedFeatures];
  for (const bundleCode of tier.includedBundles) {
    const bundle = FEATURE_BUNDLES.find((row) => row.code === bundleCode);
    if (!bundle) continue;
    keys.push(...bundle.features);
  }
  return keys.map(toCanonicalFeatureKey);
}

function collectFeaturesFromBundles(bundleCodes: string[]): string[] {
  const keys: string[] = [];
  for (const bundleCode of bundleCodes) {
    const bundle = FEATURE_BUNDLES.find((row) => row.code === bundleCode);
    if (!bundle) continue;
    keys.push(...bundle.features);
  }
  return keys.map(toCanonicalFeatureKey);
}

function uniqueFeatureKeys(featureKeys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of featureKeys.map(toCanonicalFeatureKey)) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function getClientTemplateDisabledFeatureKeys(code: string | null | undefined): string[] {
  const template = getClientTemplateDefinition(code);
  if (!template) return [];
  return uniqueFeatureKeys(template.disabledFeatureKeys ?? []);
}

export function getClientTemplateFeatureKeys(code: string | null | undefined, tierCodeOverride?: string | null): string[] {
  const template = getClientTemplateDefinition(code);
  if (!template) return [];
  const disabledFeatureKeys = new Set(getClientTemplateDisabledFeatureKeys(template.code));

  if (template.includeAllFeatures) {
    return FEATURE_CATALOG.map((feature) => feature.key).filter((featureKey) => !disabledFeatureKeys.has(featureKey));
  }

  const tierCode = normalizeCode(tierCodeOverride || template.recommendedTierCode);
  const keys = new Set<string>();
  for (const key of collectFeaturesFromTier(tierCode)) {
    if (!disabledFeatureKeys.has(key)) keys.add(key);
  }
  for (const key of collectFeaturesFromBundles(getClientTemplateBundleCodes(template.code))) {
    if (!disabledFeatureKeys.has(key)) keys.add(key);
  }
  for (const key of template.featureKeys.map(toCanonicalFeatureKey)) {
    if (!disabledFeatureKeys.has(key)) keys.add(key);
  }
  return [...keys];
}

export function getClientTemplateWorkspaceProfile(code: string | null | undefined): string | null {
  const template = getClientTemplateDefinition(code);
  if (!template) return null;

  switch (template.code) {
    case "TEMPLATE_GOLD_MINE":
      return "GOLD_MINE";
    case "TEMPLATE_SCRAP_METAL":
      return "SCRAP_METAL";
    case "TEMPLATE_SCHOOLS":
      return "SCHOOLS";
    case "TEMPLATE_CAR_SALES":
      return "AUTOS";
    case "TEMPLATE_RETAIL":
      return "RETAIL";
    case "TEMPLATE_PAYROLL_BUREAU":
      return "PAYROLL";
    case "TEMPLATE_CRM":
    case "TEMPLATE_CORE_STARTER":
    case "TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK":
    case "TEMPLATE_TECH_WORKSHOP":
    case "TEMPLATE_ALL_FEATURES":
      return "GENERAL";
    default:
      return null;
  }
}

export function getClientTemplateVerticalProductId(code: string | null | undefined): VerticalProductId | null {
  return getClientTemplateDefinition(code)?.verticalProductId ?? null;
}

export function getClientTemplateVerticalProductLabel(code: string | null | undefined): string | null {
  return getVerticalProductBundleForTemplate(code)?.label ?? null;
}
