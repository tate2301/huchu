import { writePlatformAuditEvent } from "@/lib/audit/platform";

import type { ActivityRequest } from "./context";
import { activityEventType, activityModuleForPath } from "./describe";

/** The most changes one event carries; the rest are counted, not listed. */
const MAX_CHANGES = 25;

/**
 * The payload of an activity event, as `payloadJson` holds it.
 *
 * `module` is written first so the log's module filter can match
 * `"module":"<key>"` in the stored JSON: `JSON.stringify` keeps insertion
 * order, so the substring is stable.
 */
export type ActivityPayload = {
  module: string;
  method: string;
  path: string;
  actorName: string | null;
  actorRole: string | null;
  label: string | null;
  changes: ActivityRequest["changes"];
  more: number;
};

/**
 * Write the request's changes as one event on the company's audit chain.
 *
 * One event per request rather than per row, because a request is one thing a
 * person did: saving an invoice writes the invoice, its lines and its totals,
 * and the reviewer wants "Updated sales invoice INV-0042", not five rows. The
 * first change names the event; the rest ride in its payload.
 *
 * Runs after the response (`after()` in `attachActivityActor`), so a slow
 * write here costs nobody a wait, and a failure is logged rather than thrown —
 * the work it describes has already happened.
 */
export async function flushActivity(record: ActivityRequest): Promise<void> {
  if (record.flushed) return;
  record.flushed = true;

  if (record.failed || record.explicit) return;
  if (!record.companyId || !record.actorId || record.changes.length === 0) return;

  const primary = record.changes[0]!;
  const payload: ActivityPayload = {
    module: activityModuleForPath(record.path),
    method: record.method,
    path: record.path,
    actorName: record.actorName,
    actorRole: record.actorRole,
    label: primary.label,
    changes: record.changes.slice(0, MAX_CHANGES),
    more: Math.max(0, record.changes.length - MAX_CHANGES),
  };

  try {
    await writePlatformAuditEvent({
      companyId: record.companyId,
      actorId: record.actorId,
      eventType: activityEventType(primary),
      entityType: primary.model,
      entityId: primary.recordId ?? undefined,
      payload,
    });
  } catch (error) {
    console.error("[activity] failed to write activity event", {
      path: record.path,
      error,
    });
  }
}
