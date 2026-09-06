import { hasFeature } from "@corelithzw/platform/features";
import { recordType, type RecordType } from "@corelithzw/module-records/registry";
import { schoolPermissionDenial, type SessionLike } from "@corelithzw/module-campus/permissions";

/**
 * Who may read or write things filed against a record, whichever module owns it.
 *
 * This exists because of a rule discovered twice in one afternoon: **every
 * `/api/v2/crm/**` route is gated on a `crm.*` feature by URL prefix in
 * `lib/platform/gating/route-registry.ts`, and no school tenant has one.** Making
 * a school record a legal value in a shared enum — which S-4.2 and S-4.4 both did
 * — changes the data model and changes nothing about who can reach it. Filing a
 * document against a student returned `Feature disabled: crm.core` while the
 * storage supported it perfectly well.
 *
 * A prefix cannot be gated on two different features, so these routes are
 * registered as always-reachable and check the feature themselves, per SUBJECT
 * TYPE. A CRM subject needs `crm.core`; a school subject needs `schools.students`
 * and the caller's school role. That is what makes one set of routes serve both
 * modules, which is the premise of Iteration 4 — the record surface belongs to no
 * single module.
 *
 * The alternative was a `/api/v2/schools/...` copy of every collaboration route.
 * Two doors onto one engine is a pattern; twelve is a maintenance problem, and it
 * would put the module back into a surface this iteration exists to take it out
 * of.
 */

export type RecordGuardResult = { ok: true } | { ok: false; message: string; status: number };

const OK: RecordGuardResult = { ok: true };

export async function guardRecordSubject(
  session: SessionLike & { user: { companyId: string; role?: string | null } },
  subjectType: RecordType,
  action: "view" | "create",
): Promise<RecordGuardResult> {
  const config = recordType(subjectType);

  if (config.module === "crm") {
    // Matches what the /api/v2/crm prefix already enforces, so moving a caller
    // onto these routes cannot widen its access.
    const enabled = await hasFeature(session.user.companyId, "crm.core");
    if (!enabled) {
      return { ok: false, message: "Feature disabled: crm.core", status: 403 };
    }
    return OK;
  }

  const enabled = await hasFeature(session.user.companyId, "schools.students");
  if (!enabled) {
    return { ok: false, message: "Feature disabled: schools.students", status: 403 };
  }

  // A role check as well as a feature check: the feature says the tenant bought
  // the module, the role says this person may do this to a pupil's record.
  // `edit` rather than `create` for writing, because filing a note or a document
  // against a child is editing that child's record rather than creating a new
  // one — and it is what a class teacher can legitimately do.
  const denied = schoolPermissionDenial(
    session,
    "schools.students",
    action === "view" ? "view" : "edit",
  );
  if (denied) return { ok: false, message: denied, status: 403 };

  return OK;
}
