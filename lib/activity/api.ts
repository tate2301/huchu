import { fetchJson } from "@/lib/api-client";

import type { ActivityAction, ActivityChange } from "./describe";

/** One row of the activity log, as `GET /api/activity` returns it. */
export type ActivityLogEntry = {
  id: string;
  createdAt: string;
  /** `PlatformAuditEvent.eventType`, e.g. `EMPLOYEE.UPDATED`. */
  eventType: string;
  action: ActivityAction | null;
  module: string | null;
  moduleLabel: string | null;
  /** What happened: "Updated employee", "Fee invoice written off". */
  summary: string;
  /** What it happened to: "Rudo Moyo", "INV-0042". */
  recordLabel: string | null;
  entityType: string | null;
  entityId: string | null;
  actor: { id: string | null; name: string; email: string | null } | null;
  /** Every record the request changed, the first being the one it is named for. */
  changes: ActivityChange[];
  /** Changes past the ones listed. */
  more: number;
  reason: string | null;
};

export type ActivityLogPage = {
  entries: ActivityLogEntry[];
  nextCursor: string | null;
};

export type ActivityLogFilters = {
  actorId?: string;
  module?: string;
  action?: ActivityAction;
  /** ISO date-times. `to` is exclusive. */
  from?: string;
  to?: string;
  q?: string;
  /** One record's trail: events about it, or that changed it along the way. */
  entityType?: string;
  entityId?: string;
};

export type ActivityPerson = { id: string; name: string };

export function fetchActivityPage(filters: ActivityLogFilters, cursor?: string | null) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (cursor) params.set("cursor", cursor);
  return fetchJson<ActivityLogPage>(`/api/activity?${params.toString()}`);
}

export function fetchActivityPeople() {
  return fetchJson<{ people: ActivityPerson[] }>("/api/activity/people");
}
