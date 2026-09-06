import { AttendanceStatus } from "@corelithzw/db";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";

/**
 * The attendance statuses, once, from the schema.
 *
 * `Attendance.status` used to be a `String` with `// PRESENT, ABSENT, LATE` after
 * it, and that comment was duplicated as a literal array in three places: a zod
 * enum in the mark-attendance route, a second zod enum in gold's shift-output
 * route, and an `includes` check driving the register's search box. Three copies
 * of a rule the database did not enforce.
 *
 * Now the schema enforces it and this derives from it, so adding a status to
 * `enum AttendanceStatus` reaches every caller. The list is ordered as the enum
 * is, which is also the order a register offers them in.
 */
export const ATTENDANCE_STATUSES = Object.values(AttendanceStatus);

/**
 * A query-string value as a status, or null if it is not one.
 *
 * This exists because of a regression the enum would otherwise have introduced.
 * The register's list route took `?status=` straight off the URL and assigned it
 * into a `Record<string, unknown>` where clause — which typechecks, and which
 * used to answer `?status=bogus` with an empty list. Against an enum column
 * Postgres raises instead, so an unrecognised filter turned a page of attendance
 * into a 500. Unknown means "no such status", which means no rows, not an error.
 */
export function parseAttendanceStatus(value: string | null | undefined): AttendanceStatus | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return (ATTENDANCE_STATUSES as string[]).includes(upper)
    ? (upper as AttendanceStatus)
    : null;
}

/**
 * How a status reads to somebody looking at a register.
 *
 * `ON_LEAVE` and `REST_DAY` are the two that matter here: both are absences, and
 * a register that prints them as raw enum names invites being read as the same
 * kind of absence as `ABSENT`, which is the one that costs somebody a day's pay.
 */
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  ON_LEAVE: "On leave",
  REST_DAY: "Rest day",
  HOLIDAY: "Public holiday",
};

/**
 * The feature that lets somebody mark a register.
 *
 * Was `ops.attendance.mark`, living in `lib/operations/access.ts` alongside the
 * shift and plant report keys, because attendance arrived as part of Mine Daily
 * Operations. It is not a mining concern: a school, a bureau and a yard all keep a
 * register, and the ones with no shafts could not reach it.
 *
 * `ops.attendance.mark` is deliberately still in the catalogue and still in
 * `ADDON_MINE_DAILY_OPS`. It now gates no route, which is a loose end worth naming
 * rather than tidying: the key exists on live `CompanyFeatureFlag` rows, and
 * removing it is a data migration.
 */
export const ATTENDANCE_FEATURE_KEY = "hr.attendance";

/** Whether this session may mark or amend a register. */
export function canSessionMarkAttendance(session: AuthenticatedSession): boolean {
  return hasTokenFeature(session.user.enabledFeatures, ATTENDANCE_FEATURE_KEY);
}

/** The same question from the client, which holds the feature list and no session. */
export function canMarkAttendance(enabledFeatures: string[] | undefined): boolean {
  return hasTokenFeature(enabledFeatures, ATTENDANCE_FEATURE_KEY);
}
