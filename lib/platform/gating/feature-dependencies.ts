import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";

const FEATURE_DEPENDENCIES: Record<string, string[]> = {
  "gold.intake.pours": ["gold.home"],
  "gold.dispatches": ["gold.home"],
  "gold.receipts": ["gold.home"],
  "gold.reconciliation": ["gold.home"],
  "gold.exceptions": ["gold.home"],
  "gold.audit-trail": ["gold.home"],
  "gold.payouts": ["gold.home"],
  // Settlements need somebody to settle with, and gold settlements need the gold
  // allocations they read. Deliberately NOT dependent on `hr.payroll`: a site
  // that settles crews in cash and keeps no payroll at all is a real customer,
  // and the old `hr.settlements` key forced them to buy a payroll they never
  // opened.
  "settlements.core": ["hr.employees"],
  "settlements.gold": ["settlements.core", "gold.payouts"],
  // A register with nobody in it is not a register.
  "hr.attendance": ["hr.employees"],
  "hr.leave": ["hr.employees"],
  // Payroll without an employee directory is runs against nobody.
  "hr.payroll": ["hr.employees"],
  "hr.compensation-rules": ["hr.employees"],
  "hr.statutory-tables": ["hr.payroll"],
  "hr.statutory-returns": ["hr.payroll", "hr.statutory-tables"],
  "hr.payslips": ["hr.payroll"],
  "hr.employee-self-service": ["hr.payslips"],
  // Deliberately NOT declared: payroll does not depend on `accounting.core`.
  // That is the seam the payroll-only product stands on — a run in a workspace
  // with no ledger completes, posts nothing, and says so.
  "accounting.chart-of-accounts": ["accounting.core"],
  "accounting.journals": ["accounting.core"],
  "accounting.periods": ["accounting.core"],
  "accounting.posting-rules": ["accounting.core"],
  "accounting.trial-balance": ["accounting.core"],
  "accounting.financial-statements": ["accounting.core"],
  "accounting.ar": ["accounting.core"],
  "accounting.ap": ["accounting.core"],
  "accounting.banking": ["accounting.core"],
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
  "retail.pos": ["retail.core"],
  "retail.catalog": ["retail.core"],
  "retail.purchasing": ["retail.core"],
  "retail.promotions": ["retail.core"],
  "retail.shifts": ["retail.core"],
  "retail.reports": ["retail.core"],
  "portal.schools": ["portal.core", "schools.core"],
  "portal.pos": ["portal.core", "retail.pos"],
};

export function getFeatureDependencies(featureKey: string): string[] {
  const normalized = normalizeFeatureKey(featureKey);
  const dependencies = FEATURE_DEPENDENCIES[normalized] ?? [];
  return dependencies.map((dep) => normalizeFeatureKey(dep));
}
