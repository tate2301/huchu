/**
 * The CRM's guard for things filed against its records: what the `/api/v2/crm`
 * prefix already enforces, so moving a caller onto the shared record routes
 * cannot widen its access.
 */
import { hasFeature } from "@corelithzw/platform/features";
import type { RecordSubjectGuard } from "@corelithzw/module-records/subject-guard";

export const crmRecordGuard: RecordSubjectGuard = async (session) => {
  const enabled = await hasFeature(session.user.companyId, "crm.core");
  if (!enabled) return { ok: false, message: "Feature disabled: crm.core", status: 403 };
  return { ok: true };
};
