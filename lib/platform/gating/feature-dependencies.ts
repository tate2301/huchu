import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";

const FEATURE_DEPENDENCIES: Record<string, string[]> = {
  "gold.intake.pours": ["gold.home"],
  "gold.dispatches": ["gold.home"],
  "gold.receipts": ["gold.home"],
  "gold.reconciliation": ["gold.home"],
  "gold.exceptions": ["gold.home"],
  "gold.audit-trail": ["gold.home"],
  "gold.payouts": ["gold.home"],
  "accounting.chart-of-accounts": ["accounting.core"],
  "accounting.journals": ["accounting.core"],
  "accounting.periods": ["accounting.core"],
  "accounting.posting-rules": ["accounting.core"],
  "accounting.trial-balance": ["accounting.core"],
  "accounting.financial-statements": ["accounting.core"],
  "accounting.ar": ["accounting.core"],
  "accounting.ap": ["accounting.core"],
  "accounting.banking": ["accounting.core"],
  "accounting.fixed-assets": ["accounting.core"],
  "accounting.budgets": ["accounting.core"],
  "accounting.cost-centers": ["accounting.core"],
  "accounting.multi-currency": ["accounting.core"],
  "accounting.tax": ["accounting.core"],
  "accounting.zimra.fiscalisation": ["accounting.core", "accounting.tax"],
  "schools.admissions": ["schools.core"],
  "schools.students": ["schools.core"],
  "schools.attendance": ["schools.core"],
  "schools.fees": ["schools.core"],
  "schools.boarding": ["schools.core"],
  "schools.results": ["schools.core"],
  "schools.portal.parent": ["schools.core", "portal.core"],
  "schools.portal.student": ["schools.core", "portal.core"],
  "schools.portal.teacher": ["schools.core", "portal.core"],
  "autos.inventory": ["autos.core"],
  "autos.leads": ["autos.core"],
  "autos.deals": ["autos.core"],
  "autos.financing": ["autos.core"],
  "retail.pos": ["retail.core"],
  "retail.catalog": ["retail.core"],
  "retail.purchasing": ["retail.core"],
  "retail.promotions": ["retail.core"],
  "retail.shifts": ["retail.core"],
  "retail.reports": ["retail.core"],
  "portal.schools": ["portal.core", "schools.core"],
  "portal.autos": ["portal.core", "autos.core"],
  "portal.pos": ["portal.core", "retail.pos"],
};

export function getFeatureDependencies(featureKey: string): string[] {
  const normalized = normalizeFeatureKey(featureKey);
  const dependencies = FEATURE_DEPENDENCIES[normalized] ?? [];
  return dependencies.map((dep) => normalizeFeatureKey(dep));
}
