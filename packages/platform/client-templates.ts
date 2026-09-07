import { FEATURE_BUNDLES, FEATURE_CATALOG, TIERS } from "./feature-catalog";
import { normalizeFeatureKey } from "./gating/catalog-utils";
import {
  getVerticalProductBundleForTemplate,
  type VerticalProductId,
} from "./workspace-products";

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
  /**
   * Offered no longer. The template stays so a tenant provisioned from it can
   * be read, re-applied and audited; it is absent from the operator's picker
   * for a new tenant. The mine's template, since Phase 4.
   */
  delisted?: boolean;
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

/**
 * The till. GROW and above bundle `ADDON_RETAIL_SUITE` because that is what the
 * tier is *for* — three tills across two branches is the shape GROW is priced
 * against. A template inherits its recommended tier's features, so a workshop,
 * a CRM tenant or a payroll bureau that sits on GROW would silently be handed a
 * point-of-sale, and `inferWorkspaceProfileFromEnabledFeatures` reads `retail.*`
 * as the strongest possible signal that a tenant is a shop — so the workspace
 * came up as Retail for a business that has never sold anything over a counter.
 *
 * Non-retail templates strip these keys explicitly. Buying the tier still buys
 * the capability; provisioning from a template that is not about selling in a
 * shop just does not switch it on.
 */
const RETAIL_TILL_FEATURE_KEYS = [
  "retail.core",
  "retail.pos",
  "retail.catalog",
  "retail.purchasing",
  "retail.promotions",
  "retail.shifts",
  "retail.reports",
  "portal.pos",
] as const;

/**
 * The sales desk. Same inheritance problem as the till: `ADDON_RETAIL_SUITE`
 * carries `crm.customers` (the shared customer directory) and `ADDON_CRM_SUITE`
 * rides on SCALE and ENTERPRISE, so a template on either tier inherits a CRM it
 * never asked for. Templates that are not about selling strip these.
 */
const CRM_FEATURE_KEYS = [
  "crm.customers",
  "crm.core",
  "crm.leads",
  "crm.clients",
  "crm.appointments",
  "crm.intake",
  "crm.documents",
  "crm.insights",
  "crm.commissions",
  "crm.settings",
] as const;

export const CLIENT_BUNDLE_TEMPLATES: ClientBundleTemplateDefinition[] = [
  {
    code: "TEMPLATE_CORE_STARTER",
    label: "General Business Starter",
    description: "Shared finance, stock, people, and operating controls for growing businesses.",
    targetClients: ["Small company", "Starter operations"],
    recommendedTierCode: "START",
    bundleCodes: ["ADDON_OPERATIONS_CORE", "ADDON_STORES_CORE", "ADDON_WORKFORCE_CORE"],
    featureKeys: [],
    verticalProductId: "general-business",
    disabledFeatureKeys: [
      ...MINE_DAILY_OPS_FEATURE_KEYS,
      // A general business starter is not a shop. START bundles the retail
      // suite because START is the single-shop self-serve tier; provisioning a
      // general business from this template does not turn the till on.
      ...RETAIL_TILL_FEATURE_KEYS,
      ...CRM_FEATURE_KEYS,
    ],
  },
  {
    code: "TEMPLATE_GOLD_MINE",
    delisted: true,
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
    disabledFeatureKeys: [
      // Gold Edition and ENTERPRISE both carry the retail and CRM suites. A
      // mine sells to Fidelity on a dispatch, not over a counter, and a
      // point-of-sale in its sidebar is noise at best and a wrong turn at worst.
      ...RETAIL_TILL_FEATURE_KEYS,
      ...CRM_FEATURE_KEYS,
    ],
  },
  {
    code: "TEMPLATE_TECH_WORKSHOP",
    label: "Service Workshop",
    description: "Parts, maintenance, payroll, and job operations for workshop and technician businesses.",
    targetClients: ["Mechanic workshop", "Technician services", "Engineering workshop"],
    recommendedTierCode: "GROW",
    bundleCodes: [
      "ADDON_OPERATIONS_CORE",
      "ADDON_STORES_CORE",
      "ADDON_WORKFORCE_CORE",
      "ADDON_MAINTENANCE_PRO",
      "ADDON_ADVANCED_PAYROLL",
    ],
    featureKeys: [],
    verticalProductId: "service-workshop",
    disabledFeatureKeys: [
      ...MINE_DAILY_OPS_FEATURE_KEYS,
      // A workshop takes payment on a job, not over a till.
      ...RETAIL_TILL_FEATURE_KEYS,
    ],
  },
  {
    code: "TEMPLATE_SCHOOLS",
    label: "School Operations",
    description: "Student, teacher, academics, boarding, finance, and portal workflows for schools.",
    targetClients: ["Schools", "Training institutions", "Education operators"],
    recommendedTierCode: "START",
    bundleCodes: ["ADDON_SCHOOLS_SUITE", "ADDON_PORTAL_SUITE"],
    featureKeys: [],
    verticalProductId: "school-operations",
    disabledFeatureKeys: [
      "ops.shift-report.submit",
      "ops.attendance.mark",
      "ops.plant-report.submit",
      // A school has guardians and students, not customers. The shared
      // directory arrives via START's retail suite; it has no place here.
      ...CRM_FEATURE_KEYS,
      "stores.dashboard",
      "stores.inventory",
      "stores.movements",
      "stores.issue",
      "stores.receive",
      "stores.catalogue",
      "stores.price-lists",
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
      // The settlement keys are different and stay blocked: they are the gold
      // payout surface, which a school has no use for and which would render
      // payout screens for a commodity it does not handle.
      "settlements.core",
      "settlements.gold",
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
      "admin.sites-sections",
      "admin.payroll-config",
      "admin.feature-flags-console",
      "admin.subscription-console",
      "retail.core",
      "retail.catalog",
      "retail.pos",
      "retail.purchasing",
      "retail.promotions",
      "retail.shifts",
      "retail.reports",
      "portal.pos",
    ],
  },
  {
    code: "TEMPLATE_RETAIL",
    label: "Retail",
    description: "Retail, POS, purchasing, merchandising, and cash-up workflows for shop operators.",
    targetClients: ["Small retailers", "Second-hand retail", "Resale marketplaces"],
    recommendedTierCode: "GROW",
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
      "gold.home",
      "gold.intake.pours",
      "gold.dispatches",
      "gold.receipts",
      "gold.reconciliation",
      "gold.exceptions",
      "gold.audit-trail",
      "gold.payouts",
      "portal.schools",
    ],
  },
  {
    code: "TEMPLATE_CRM",
    label: "Sales & CRM",
    description: "Lead-to-cash CRM with pipeline, site visits, intake forms, quoting/invoicing, and commissions for sales-led businesses.",
    targetClients: ["Field-sales businesses", "Installers & fitters", "Service sales teams"],
    recommendedTierCode: "GROW",
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
      // A sales desk is not a shop floor; GROW bundles the till, this template
      // does not switch it on.
      ...RETAIL_TILL_FEATURE_KEYS,
      "stores.fuel-ledger",
      "schools.core",
      "gold.home",
      "gold.intake.pours",
      "gold.dispatches",
      "gold.receipts",
      "gold.reconciliation",
      "gold.exceptions",
      "gold.audit-trail",
      "gold.payouts",
      "portal.schools",
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
    recommendedTierCode: "GROW",
    bundleCodes: [
      "ADDON_WORKFORCE_CORE",
      "ADDON_ADVANCED_PAYROLL",
      "ADDON_ZIMBABWE_PAYROLL",
    ],
    featureKeys: [],
    verticalProductId: "payroll-services",
    disabledFeatureKeys: [
      ...MINE_DAILY_OPS_FEATURE_KEYS,
      // A bureau runs other people's payroll; it has no counter of its own.
      ...RETAIL_TILL_FEATURE_KEYS,
      "stores.dashboard",
      "stores.inventory",
      "stores.movements",
      "stores.issue",
      "stores.receive",
      "stores.catalogue",
      "stores.price-lists",
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
      "schools.core",
      "retail.core",
      "retail.pos",
      "maintenance.dashboard",
      "maintenance.equipment",
      "maintenance.work-orders",
      "maintenance.breakdowns",
      "maintenance.schedule",
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

/** The templates offered for a new tenant; a delisted one is still resolvable by code. */
export const LISTED_CLIENT_BUNDLE_TEMPLATES: ClientBundleTemplateDefinition[] = CLIENT_BUNDLE_TEMPLATES.filter(
  (template) => !template.delisted,
);

const TEMPLATE_ALIASES: Record<string, string> = {
  BASE: "TEMPLATE_CORE_STARTER",
  GOLD: "TEMPLATE_GOLD_MINE",
  SCHOOL: "TEMPLATE_SCHOOLS",
  SCHOOLS: "TEMPLATE_SCHOOLS",
  // Dropped verticals (CCTV/security, scrap metal, car sales). The aliases stay
  // so provisioning with a legacy code degrades to the core starter instead of
  // throwing at a tenant that was created before the drop.
  TEMPLATE_SCRAP_METAL: "TEMPLATE_CORE_STARTER",
  TEMPLATE_CAR_SALES: "TEMPLATE_CORE_STARTER",
  TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK: "TEMPLATE_CORE_STARTER",
  SCRAP: "TEMPLATE_CORE_STARTER",
  SCRAP_METAL: "TEMPLATE_CORE_STARTER",
  AUTOS: "TEMPLATE_CORE_STARTER",
  "CAR-SALES": "TEMPLATE_CORE_STARTER",
  CAR_SALES: "TEMPLATE_CORE_STARTER",
  SECURITY: "TEMPLATE_CORE_STARTER",
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
    case "TEMPLATE_SCHOOLS":
      return "SCHOOLS";
    case "TEMPLATE_RETAIL":
      return "RETAIL";
    case "TEMPLATE_PAYROLL_BUREAU":
      return "PAYROLL";
    case "TEMPLATE_CRM":
    case "TEMPLATE_CORE_STARTER":
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
