import { FEATURE_CATALOG } from "../../lib/platform/feature-catalog";
import { FEATURE_CAPABILITIES } from "../../lib/platform/gating/capability-registry";
import { API_FEATURE_ROUTES, PAGE_FEATURE_ROUTES } from "../../lib/platform/gating/route-registry";

function normalizeFeatureKey(value: string): string {
  return value.trim().toLowerCase();
}

function distinct(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function printGroup(title: string, values: string[]) {
  if (values.length === 0) {
    console.log(`- ${title}: none`);
    return;
  }
  console.log(`- ${title} (${values.length}):`);
  for (const value of values) {
    console.log(`  - ${value}`);
  }
}

function runAudit() {
  const catalogKeys = distinct(FEATURE_CATALOG.map((feature) => normalizeFeatureKey(feature.key)));
  const routeKeys = distinct([...PAGE_FEATURE_ROUTES, ...API_FEATURE_ROUTES].map((row) => normalizeFeatureKey(row.featureKey)));
  const capabilityKeys = distinct(FEATURE_CAPABILITIES.map((entry) => normalizeFeatureKey(entry.featureKey)));
  const coveredKeys = distinct([...routeKeys, ...capabilityKeys]);

  const uncoveredCatalogKeys = catalogKeys.filter((key) => !coveredKeys.includes(key));
  const unknownRouteKeys = routeKeys.filter((key) => !catalogKeys.includes(key));
  const unknownCapabilityKeys = capabilityKeys.filter((key) => !catalogKeys.includes(key));

  console.log("Feature Gate Coverage Audit");
  console.log("===========================");
  console.log(`Catalog keys: ${catalogKeys.length}`);
  console.log(`Route-mapped keys: ${routeKeys.length}`);
  console.log(`Capability-mapped keys: ${capabilityKeys.length}`);
  console.log(`Covered keys (union): ${coveredKeys.length}`);

  printGroup("Uncovered catalog keys", uncoveredCatalogKeys);
  printGroup("Unknown route-mapped keys", unknownRouteKeys);
  printGroup("Unknown capability-mapped keys", unknownCapabilityKeys);

  if (uncoveredCatalogKeys.length > 0 || unknownRouteKeys.length > 0 || unknownCapabilityKeys.length > 0) {
    console.log("\nWarnings detected. Policy is warn-only, so this command exits with status 0.");
  } else {
    console.log("\nNo coverage warnings detected.");
  }
}

runAudit();
