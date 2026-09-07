/**
 * Who may read or write things filed against a record, whichever module owns it.
 *
 * Every `/api/v2/crm/**` route is gated on a `crm.*` feature by URL prefix, and
 * no school tenant has one; a prefix cannot be gated on two different
 * features. So the shared record routes are registered as always reachable and
 * check per SUBJECT TYPE, and the check is the owning module's: a CRM subject
 * needs `crm.core`, a school subject needs `schools.students` and the caller's
 * school role. Each module registers its guard from the host's `modules.ts`
 * (`registerRecordSubjectGuard`); a type whose module registered none is
 * refused, never let through.
 */
import { registry } from "@corelithzw/platform/registry";
import { recordType, type RecordType } from "./registry";

export type RecordGuardSession = { user: { companyId: string; role?: string | null } };
export type RecordGuardResult = { ok: true } | { ok: false; message: string; status: number };
export type RecordSubjectGuard = (session: RecordGuardSession, action: "view" | "create") => Promise<RecordGuardResult>;

const guards = registry<Map<string, RecordSubjectGuard>>("records.subject-guards", () => new Map());

/** A module's guard for the record types it owns, registered by the host that composes it. */
export function registerRecordSubjectGuard(module: string, guard: RecordSubjectGuard): void {
  guards.set(module, guard);
}

export async function guardRecordSubject(
  session: RecordGuardSession,
  subjectType: RecordType,
  action: "view" | "create",
): Promise<RecordGuardResult> {
  const config = recordType(subjectType);
  const guard = guards.get(config.module);
  if (!guard) {
    return { ok: false, message: `No guard registered for ${config.module} records`, status: 403 };
  }
  return guard(session, action);
}
