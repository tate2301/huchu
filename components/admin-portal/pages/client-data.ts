import type { FeatureBundleDefinition, FeatureCatalogEntry, TierDefinition } from "@/lib/platform/feature-catalog";
import { FEATURE_CATALOG, TIERS, getBundleDefinition, getTierDefinition } from "@/lib/platform/feature-catalog";
import type { CompanyWorkspace } from "../types";

export type ClientStatus = "ACTIVE" | "EXPIRING_SOON" | "IN_GRACE" | "PAST_DUE" | "CANCELED";

export type EnrichedClient = CompanyWorkspace & {
  tierCode: TierDefinition["code"];
  tierName: TierDefinition["name"];
  status: ClientStatus;
  activeSites: number;
  addonCodes: FeatureBundleDefinition["code"][];
  monthlyAmount: number;
  lastUpdated: string;
};

const STATUS_ORDER: ClientStatus[] = ["ACTIVE", "EXPIRING_SOON", "IN_GRACE", "PAST_DUE", "CANCELED"];
const ADDON_ROTATION: FeatureBundleDefinition["code"][] = [
  "ADDON_CUSTOM_BRANDING",
  "ADDON_CCTV_SUITE",
  "ADDON_ADVANCED_PAYROLL",
  "ADDON_GOLD_ADVANCED",
  "ADDON_COMPLIANCE_PRO",
  "ADDON_MAINTENANCE_PRO",
  "ADDON_USER_MANAGEMENT_PRO",
  "ADDON_ANALYTICS_PRO",
  "ADDON_ACCOUNTING_CORE",
  "ADDON_ACCOUNTING_ADVANCED",
  "ADDON_ZIMRA_FISCAL",
  "ADDON_SCRAP_METAL_SUITE",
];

function computeMonthlyTotal(tier: TierDefinition, addonCodes: string[], activeSites: number) {
  const siteOverage = Math.max(0, activeSites - tier.includedSites) * tier.additionalSiteMonthlyPrice;
  const addonBaseTotal = addonCodes.reduce((acc, code) => acc + (getBundleDefinition(code)?.monthlyPrice ?? 0), 0);
  const addonSiteTotal = addonCodes.reduce(
    (acc, code) => acc + activeSites * (getBundleDefinition(code)?.additionalSiteMonthlyPrice ?? 0),
    0,
  );

  return {
    tierBase: tier.monthlyPrice,
    siteOverage,
    addonBaseTotal,
    addonSiteTotal,
    standaloneFeatureTotal: 0,
    total:
      tier.monthlyPrice +
      siteOverage +
      addonBaseTotal +
      addonSiteTotal,
  };
}

export function enrichClients(companies: CompanyWorkspace[]): EnrichedClient[] {
  return companies.map((company, index) => {
    const tier = TIERS[index % TIERS.length];
    const status = STATUS_ORDER[index % STATUS_ORDER.length];
    const addonCount = index % 4;
    const addonCodes = ADDON_ROTATION.slice(0, addonCount);
    const activeSites = Math.max(1, (index % 5) + 1);
    const lastUpdated = new Date(Date.now() - index * 86_400_000).toISOString();
    const monthlyAmount = computeMonthlyTotal(tier, addonCodes, activeSites).total;

    return {
      ...company,
      tierCode: tier.code,
      tierName: tier.name,
      status,
      activeSites,
      addonCodes,
      monthlyAmount,
      lastUpdated,
    };
  });
}

export function getEnrichedClient(companies: CompanyWorkspace[], companyId: string): EnrichedClient | undefined {
  return enrichClients(companies).find((company) => company.id === companyId);
}

export function getPricingBreakdown(client: EnrichedClient) {
  const tier = getTierDefinition(client.tierCode) ?? TIERS[0];
  return computeMonthlyTotal(tier, client.addonCodes, client.activeSites);
}

export function getFeaturesForClient(client: EnrichedClient): FeatureCatalogEntry[] {
  const tier = getTierDefinition(client.tierCode);
  const tierFeatures = tier?.includedFeatures ?? [];
  const addonFeatures = client.addonCodes.flatMap((code) => getBundleDefinition(code)?.features ?? []);
  const keys = new Set([...tierFeatures, ...addonFeatures]);
  return FEATURE_CATALOG.filter((entry) => keys.has(entry.key));
}
