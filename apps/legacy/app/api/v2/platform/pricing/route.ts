import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { getCompanyFeatureMap } from "@corelithzw/platform/entitlements";
import { FEATURE_CATALOG } from "@corelithzw/platform/feature-catalog";
import { normalizeFeatureKey } from "@corelithzw/platform/gating/catalog-utils";

/**
 * What this workspace is paying for, and what it would pay for the rest.
 *
 * The billing page could say what the plan costs but not what made it cost
 * that, which is the question somebody actually has when the number changes.
 * Grouping by module and showing the off ones at their price turns "why is it
 * $34" into a list you can read, and "what would adding Gold cost" into
 * something nobody has to email support about.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const companyMap = await getCompanyFeatureMap(session.user.companyId);

    const isEnabled = (key: string): boolean => {
      const normalized = normalizeFeatureKey(key);
      if (Object.prototype.hasOwnProperty.call(companyMap, normalized)) {
        return companyMap[normalized] === true;
      }
      const catalogue = FEATURE_CATALOG.find(
        (feature) => normalizeFeatureKey(feature.key) === normalized,
      );
      return catalogue?.defaultEnabled === true;
    };

    const byDomain = new Map<
      string,
      Array<{
        key: string;
        name: string;
        description: string;
        monthlyPrice: number;
        isBillable: boolean;
        enabled: boolean;
      }>
    >();

    for (const feature of FEATURE_CATALOG) {
      const domain = feature.domain || "other";
      const bucket = byDomain.get(domain) ?? [];
      bucket.push({
        key: normalizeFeatureKey(feature.key),
        name: feature.name,
        description: feature.description,
        monthlyPrice: feature.monthlyPrice ?? 0,
        isBillable: feature.isBillable === true,
        enabled: isEnabled(feature.key),
      });
      byDomain.set(domain, bucket);
    }

    const modules = [...byDomain.entries()]
      .map(([domain, features]) => {
        const sorted = features.sort((a, b) => a.name.localeCompare(b.name));
        const onNow = sorted.filter((feature) => feature.enabled && feature.isBillable);
        const offNow = sorted.filter((feature) => !feature.enabled && feature.isBillable);
        return {
          domain,
          features: sorted,
          enabledCount: sorted.filter((feature) => feature.enabled).length,
          totalCount: sorted.length,
          monthlyTotal: onNow.reduce((sum, feature) => sum + feature.monthlyPrice, 0),
          availableTotal: offNow.reduce((sum, feature) => sum + feature.monthlyPrice, 0),
        };
      })
      .sort((a, b) => b.monthlyTotal - a.monthlyTotal || a.domain.localeCompare(b.domain));

    return successResponse({
      modules,
      monthlyTotal: modules.reduce((sum, entry) => sum + entry.monthlyTotal, 0),
      availableTotal: modules.reduce((sum, entry) => sum + entry.availableTotal, 0),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/platform/pricing error:", error);
    return errorResponse("Failed to load pricing");
  }
}
