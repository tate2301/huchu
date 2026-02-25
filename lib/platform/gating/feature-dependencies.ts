import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";

const FEATURE_DEPENDENCIES: Record<string, string[]> = {
  "gold.intake.pours": ["gold.home"],
  "gold.dispatches": ["gold.home"],
  "gold.receipts": ["gold.home"],
  "gold.reconciliation": ["gold.home"],
  "gold.exceptions": ["gold.home"],
  "gold.audit-trail": ["gold.home"],
  "gold.payouts": ["gold.home"],
  "hr.gold-payouts": ["gold.home"],
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
};

export function getFeatureDependencies(featureKey: string): string[] {
  const normalized = normalizeFeatureKey(featureKey);
  const dependencies = FEATURE_DEPENDENCIES[normalized] ?? [];
  return dependencies.map((dep) => normalizeFeatureKey(dep));
}
