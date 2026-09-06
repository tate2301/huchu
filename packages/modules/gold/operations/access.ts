import type { AuthenticatedSession } from "@corelithzw/platform/auth-core/types";
import { hasTokenFeature } from "@corelithzw/platform/gating/token-check";

// The attendance key used to live here. It moved to `lib/people/attendance.ts`
// with the register itself: shift and plant reports are mining, a register is not.
export const SHIFT_REPORT_FEATURE_KEY = "ops.shift-report.submit";
export const PLANT_REPORT_FEATURE_KEY = "ops.plant-report.submit";

export function canAccessOperationalFeature(
  enabledFeatures: string[] | undefined,
  featureKey: string,
): boolean {
  return hasTokenFeature(enabledFeatures, featureKey);
}

export function canSessionAccessOperationalFeature(
  session: AuthenticatedSession,
  featureKey: string,
): boolean {
  return canAccessOperationalFeature(session.user.enabledFeatures, featureKey);
}
