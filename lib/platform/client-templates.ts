import { FEATURE_BUNDLES, FEATURE_CATALOG, TIERS } from "./feature-catalog";

export interface ClientBundleTemplateDefinition {
  code: string;
  label: string;
  description: string;
  targetClients: string[];
  recommendedTierCode: string;
  bundleCodes: string[];
  featureKeys: string[];
  disabledFeatureKeys?: string[];
  includeAllFeatures?: boolean;
}

const allBundleCodes = FEATURE_BUNDLES.map((bundle) => bundle.code);

export const CLIENT_BUNDLE_TEMPLATES: ClientBundleTemplateDefinition[] = [
  {
    code: "TEMPLATE_CORE_STARTER",
    label: "Core Starter",
    description: "Baseline ERP setup for smaller operators.",
    targetClients: ["Small company", "Starter operations"],
    recommendedTierCode: "BASIC",
    bundleCodes: [],
    featureKeys: [],
  },
  {
    code: "TEMPLATE_GOLD_MINE",
    label: "Gold Mine Operations",
    description: "Gold-focused stack with compliance, maintenance, and analytics depth.",
    targetClients: ["Gold mine", "Mineral processing operation"],
    recommendedTierCode: "ENTERPRISE",
    bundleCodes: ["ADDON_GOLD_ADVANCED", "ADDON_COMPLIANCE_PRO", "ADDON_MAINTENANCE_PRO", "ADDON_ANALYTICS_PRO"],
    featureKeys: [],
  },
  {
    code: "TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK",
    label: "Small Business Security + Stock",
    description: "HR + CCTV + stock + fuel monitoring for smaller multi-site teams.",
    targetClients: ["Shops", "SMEs", "Small multi-site company"],
    recommendedTierCode: "STANDARD",
    bundleCodes: ["ADDON_CCTV_SUITE", "ADDON_ANALYTICS_PRO"],
    featureKeys: [],
  },
  {
    code: "TEMPLATE_TECH_WORKSHOP",
    label: "Mechanics / Technician Workshop",
    description: "Stock + maintenance + HR workflows with payroll depth.",
    targetClients: ["Mechanic workshop", "Technician services", "Engineering workshop"],
    recommendedTierCode: "STANDARD",
    bundleCodes: ["ADDON_MAINTENANCE_PRO", "ADDON_ADVANCED_PAYROLL"],
    featureKeys: [],
  },
  {
    code: "TEMPLATE_SCRAP_METAL",
    label: "Scrap Metal Operations",
    description: "Purpose-built scrap buying, batching, settlements, and sales workspace.",
    targetClients: ["Scrap yards", "Metal recyclers", "Industrial scrap traders"],
    recommendedTierCode: "STANDARD",
    bundleCodes: ["ADDON_SCRAP_METAL_SUITE", "ADDON_ADVANCED_PAYROLL", "ADDON_ANALYTICS_PRO"],
    featureKeys: [],
    disabledFeatureKeys: [
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
      "thrift.core",
      "portal.schools",
      "portal.autos",
      "portal.thrift",
    ],
  },
  {
    code: "TEMPLATE_SCHOOLS",
    label: "School Operations",
    description: "Purpose-built school management workspace with admin and portal workflows.",
    targetClients: ["Schools", "Training institutions", "Education operators"],
    recommendedTierCode: "BASIC",
    bundleCodes: ["ADDON_SCHOOLS_SUITE", "ADDON_PORTAL_SUITE"],
    featureKeys: [],
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
      "hr.employees",
      "hr.incidents",
      "hr.disciplinary-actions",
      "hr.compensation-rules",
      "hr.salaries",
      "hr.payroll",
      "hr.disbursements",
      "hr.approvals-history",
      "hr.gold-payouts",
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
      "thrift.core",
      "thrift.intake",
      "thrift.catalog",
      "thrift.checkout",
      "portal.autos",
      "portal.thrift",
    ],
  },
  {
    code: "TEMPLATE_CAR_SALES",
    label: "Auto Sales",
    description: "Purpose-built auto sales workspace for leads, inventory, and deal execution.",
    targetClients: ["Car dealerships", "Vehicle traders", "Auto sales operators"],
    recommendedTierCode: "BASIC",
    bundleCodes: ["ADDON_AUTOS_SUITE", "ADDON_PORTAL_SUITE"],
    featureKeys: [],
    disabledFeatureKeys: ["schools.core", "thrift.core", "portal.schools", "portal.thrift"],
  },
  {
    code: "TEMPLATE_THRIFT",
    label: "Smart Shop",
    description: "Purpose-built shop workspace for intake, catalog, sales, and POS touchpoints.",
    targetClients: ["Small retailers", "Second-hand retail", "Resale marketplaces"],
    recommendedTierCode: "BASIC",
    bundleCodes: ["ADDON_THRIFT_SUITE", "ADDON_PORTAL_SUITE"],
    featureKeys: [],
    disabledFeatureKeys: ["schools.core", "autos.core", "portal.schools", "portal.autos"],
  },
  {
    code: "TEMPLATE_ALL_FEATURES",
    label: "All Features",
    description: "Enable every feature in the platform catalog.",
    targetClients: ["Power users", "Large operators", "Custom enterprise tenants"],
    recommendedTierCode: "ENTERPRISE",
    bundleCodes: allBundleCodes,
    featureKeys: [],
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
  THRIFT: "TEMPLATE_THRIFT",
  FULL: "TEMPLATE_ALL_FEATURES",
  ALL: "TEMPLATE_ALL_FEATURES",
};

function normalizeCode(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function toCanonicalFeatureKey(key: string): string {
  const normalized = String(key || "").trim().toLowerCase();
  const exact = FEATURE_CATALOG.find((feature) => feature.key.toLowerCase() === normalized);
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
    case "TEMPLATE_THRIFT":
      return "THRIFT";
    case "TEMPLATE_CORE_STARTER":
    case "TEMPLATE_ALL_FEATURES":
      return "GENERAL";
    default:
      return null;
  }
}
