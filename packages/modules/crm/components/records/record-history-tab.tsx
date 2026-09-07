"use client";

import { useMemo } from "react";

import { isHistoryActivity, type FieldChange } from "../../history";

import { HistoryFeed, type HistoryEvent } from "@corelithzw/module-records/components/history-feed";

/** Same rule `describeChange` uses: an unset field reads as a dash, not "null". */
function emptyToNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

type Activity = {
  id: string;
  type: string;
  subject: string;
  body: string | null;
  metadata: unknown;
  occurredAt: string;
  createdBy?: { id: string; name: string | null } | null;
};

/**
 * Field-level history: who changed what, from what, to what.
 *
 * Reads the same activity rows as the timeline, filtered to the system entries
 * — so a stage change appears in both places without being written twice. The
 * rendering is the shared history feed, which buckets by day, names the actor,
 * folds the diff behind a toggle and exports to CSV for anyone who has to show
 * their working to an auditor.
 */
export function RecordHistoryTab({
  activities,
  exportName = "record-history",
}: {
  activities: Activity[];
  exportName?: string;
}) {
  const events = useMemo<HistoryEvent[]>(
    () =>
      activities.filter(isHistoryActivity).map((entry) => {
        const metadata = (entry as Activity).metadata as { changes?: FieldChange[] } | null;
        const changes = metadata?.changes ?? [];
        const actor = (entry as Activity).createdBy;
        return {
          id: entry.id,
          action: entry.type,
          // The subject is already written as a sentence about the record, so
          // it is the verb phrase — the feed puts the actor's name in front.
          verb: entry.subject,
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? "The system",
          occurredAt: entry.occurredAt,
          note: entry.body,
          // The feed lays the diff out itself, so it wants the two sides
          // separately rather than `describeChange`'s single rendered line —
          // splitting that back apart would break on any label containing the
          // separator.
          changes: changes.map((change) => ({
            field: change.label ?? change.field,
            from: emptyToNull(change.from),
            to: emptyToNull(change.to),
          })),
        };
      }),
    [activities],
  );

  return (
    <HistoryFeed
      events={events}
      emptyMessage="Nothing has been changed on this record yet."
      exportName={exportName}
    />
  );
}
