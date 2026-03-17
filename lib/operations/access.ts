import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";

export const ATTENDANCE_FEATURE_KEY = "ops.attendance.mark";
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
