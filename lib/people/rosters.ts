import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";

export const ROSTERS_FEATURE_KEY = "hr.rosters";

/** Whether this session may manage shift rosters and crews. */
export function canSessionManageRosters(session: AuthenticatedSession): boolean {
  return hasTokenFeature(session.user.enabledFeatures, ROSTERS_FEATURE_KEY);
}

/** Whether the client features allow managing rosters. Defaults to true if unconfigured or feature present. */
export function canManageRosters(enabledFeatures: string[] | undefined): boolean {
  if (!enabledFeatures || enabledFeatures.length === 0) return true;
  return hasTokenFeature(enabledFeatures, ROSTERS_FEATURE_KEY);
}
