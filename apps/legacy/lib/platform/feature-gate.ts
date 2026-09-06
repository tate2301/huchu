import { NextResponse } from "next/server";
import { resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";
import { hasEnabledFeature } from "@/lib/platform/gating/enforcer";
import { canAccessRouteForCompany } from "@/lib/platform/gating/enforcer-server";

export function getFeatureForPath(pathname: string): string | null {
  return resolveFeatureKeyForPath(pathname);
}

export function hasTokenFeature(enabledFeatures: string[] | undefined, featureKey: string): boolean {
  return hasEnabledFeature(enabledFeatures, featureKey);
}

export async function enforceFeatureForCompany(
  companyId: string | undefined,
  pathname: string,
): Promise<NextResponse | null> {
  const decision = await canAccessRouteForCompany(companyId, pathname);
  if (decision.allowed) return null;

  return NextResponse.json(
    {
      error: decision.message ?? "Feature disabled for this company.",
      code: decision.code ?? "FEATURE_DISABLED",
      feature: decision.featureKey ?? null,
      path: pathname,
    },
    { status: decision.code === "UNAUTHORIZED" ? 401 : 403 },
  );
}
