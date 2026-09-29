import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";
import { navSections, schoolBandGrant, type SchoolNavGrant } from "@/lib/navigation";
import { hasEnabledFeature } from "@/lib/platform/gating/enforcer";
import { resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";
import type { ReportDefinition } from "@/lib/reports/types";
import { schoolAccess } from "@/lib/schools/access";

/**
 * Who may read a report: whoever may open the page it is about.
 *
 * A report is that page's rows seen another way, so it is gated the same way —
 * by the feature the page's route needs, by the roles its navigation entry
 * names, by the campus grant a school page asks for, and by any role pinned to
 * one area of the app. Nothing is granted
 * here that the page itself would refuse, and a workspace provisioned without
 * a module never sees a report about it.
 */

export type ReportAccess = {
  role: string;
  enabledFeatures: string[] | undefined;
};

type PageRule = { roles?: string[]; grant: SchoolNavGrant | null };

const pageRules = new Map<string, PageRule>();
for (const section of navSections) {
  for (const item of section.items) {
    // The first declaration wins, the way the navigation resolves it. A campus
    // page asks for its own grant, else its band's — as the rail does.
    if (pageRules.has(item.href)) continue;
    pageRules.set(item.href, {
      roles: item.roles,
      grant: item.grant ?? (section.id === "schools" && item.group ? schoolBandGrant(item.group) : null),
    });
  }
}

export function reportFeatureKey(source: Pick<ReportDefinition, "href" | "featureKey">): string | null {
  return source.featureKey ?? resolveFeatureKeyForPath(source.href);
}

export function canReadReport(
  source: Pick<ReportDefinition, "href" | "featureKey" | "roles">,
  access: ReportAccess,
): boolean {
  const featureKey = reportFeatureKey(source);
  if (featureKey && !hasEnabledFeature(access.enabledFeatures, featureKey)) return false;
  if (!isRouteAllowedForRole(access.role, source.href)) return false;
  if (source.roles && !source.roles.includes(access.role)) return false;
  const rule = pageRules.get(source.href);
  if (rule?.roles && !rule.roles.includes(access.role)) return false;
  if (rule?.grant) {
    // As the rail reads it: a role the campus personas do not describe is not
    // refused by them, only one they do describe and do not grant.
    const campus = schoolAccess(access.role);
    if (campus.persona && !campus.can(rule.grant.resource, rule.grant.action ?? "view")) return false;
  }
  return true;
}

/** Whether a row action is offered to this role. */
export function canUseAction(action: { roles?: string[] }, role: string): boolean {
  return !action.roles || action.roles.includes(role);
}
