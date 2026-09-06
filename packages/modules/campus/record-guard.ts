/**
 * The school's guard for things filed against a pupil's record: the feature
 * says the tenant bought the module, the role says this person may do this to
 * a pupil's record. `edit` rather than `create` for writing, because filing a
 * note or a document against a child is editing that child's record rather
 * than creating a new one — and it is what a class teacher can legitimately do.
 */
import { hasFeature } from "@corelithzw/platform/features";
import type { RecordSubjectGuard } from "@corelithzw/module-records/subject-guard";
import { schoolPermissionDenial } from "./permissions";

export const schoolRecordGuard: RecordSubjectGuard = async (session, action) => {
  const enabled = await hasFeature(session.user.companyId, "schools.students");
  if (!enabled) return { ok: false, message: "Feature disabled: schools.students", status: 403 };
  const denied = schoolPermissionDenial(session, "schools.students", action === "view" ? "view" : "edit");
  if (denied) return { ok: false, message: denied, status: 403 };
  return { ok: true };
};
