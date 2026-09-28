"use client";

import { useQuery } from "@tanstack/react-query";

import { ActivityTrail, type ActivityEvent } from "@/components/management/ui";
import { fetchActivityPage, type ActivityLogEntry } from "@/lib/activity/api";
import { humanizeField } from "@/lib/activity/describe";

/** The trail under a record is its latest changes; the full log has the rest. */
const TRAIL_LENGTH = 10;

const FULL_LOG_HREF = "/preferences/organization/activity";

/**
 * A record's Activity section, filled from the activity log.
 *
 * `entityType` is the Prisma model the record is (`Site`, `JobGrade`). The log
 * matches it two ways: events named for the record, and requests that changed
 * it along the way — creating a department that also moved a site shows on
 * both.
 *
 * The log is the admins' (`GET /api/activity` answers managers and
 * superadmins). For anybody else, or when it fails, the trail draws its own
 * empty state rather than an error under a record they can otherwise use.
 */
export function RecordActivityTrail({
  entityType,
  entityId,
  fullLogHref = FULL_LOG_HREF,
}: {
  entityType: string;
  entityId: string | null | undefined;
  fullLogHref?: string;
}) {
  const { data } = useQuery({
    queryKey: ["activity", "record", entityType, entityId],
    queryFn: () => fetchActivityPage({ entityType, entityId: entityId! }),
    enabled: !!entityId,
    retry: false,
  });

  const events = (data?.entries ?? []).slice(0, TRAIL_LENGTH).map(toTrailEvent);

  return <ActivityTrail events={events} fullLogHref={fullLogHref} />;
}

function toTrailEvent(entry: ActivityLogEntry): ActivityEvent {
  const fields = entry.changes[0]?.fields?.map((field) => humanizeField(field.name)) ?? [];
  return {
    id: entry.id,
    eventType: entry.eventType,
    createdAt: entry.createdAt,
    summary: fields.length ? `${entry.summary} · ${fields.join(", ")}` : entry.summary,
    actor: entry.actor?.id ?? null,
    actorName: entry.actor?.name ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId,
    reason: entry.reason,
  };
}
