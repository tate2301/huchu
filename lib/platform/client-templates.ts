import { FEATURE_BUNDLES, FEATURE_CATALOG, TIERS } from "./feature-catalog";

export interface ClientBundleTemplateDefinition {
  code: string;
  label: string;
  description: string;
  targetClients: string[];
  recommendedTierCode: string;
  bundleCodes: string[];
  featureKeys: string[];
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

export function getClientTemplateFeatureKeys(code: string | null | undefined, tierCodeOverride?: string | null): string[] {
  const template = getClientTemplateDefinition(code);
  if (!template) return [];
  if (template.includeAllFeatures) {
    return FEATURE_CATALOG.map((feature) => feature.key);
  }

  const tierCode = normalizeCode(tierCodeOverride || template.recommendedTierCode);
  const keys = new Set<string>();
  for (const key of collectFeaturesFromTier(tierCode)) keys.add(key);
  for (const key of collectFeaturesFromBundles(getClientTemplateBundleCodes(template.code))) keys.add(key);
  for (const key of template.featureKeys.map(toCanonicalFeatureKey)) keys.add(key);
  return [...keys];
}
