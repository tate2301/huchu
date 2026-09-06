"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, EmptyState, Stack } from "@corelithzw/react";
import { Avatar } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { ClientDate } from "@/components/ui/client-date";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fieldLabel } from "@/lib/crm/field-history";
import { ArrowRight } from "@/lib/icons";

type FieldChange = {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  changedBy: { id: string; name: string | null } | null;
};

/**
 * Every value this record has held.
 *
 * The activity feed answers "what happened here"; this answers "what was this
 * number before, and who moved it", which is a different question asked on a
 * worse day. Grouping by field rather than by save is the whole point — a
 * value's own history is the thing you are chasing, and reading it out of a
 * chronological list means holding six unrelated changes in your head.
 */
export function FieldHistoryTab({
  entity,
  recordId,
}: {
  entity: string;
  recordId: string;
}) {
  const [groupByField, setGroupByField] = useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-field-history", entity, recordId],
    queryFn: () =>
      fetchJson<{ data: FieldChange[] }>(
        `/api/v2/crm/field-history?entity=${entity}&recordId=${recordId}`,
      ),
  });

  const changes = useMemo(() => data?.data ?? [], [data]);

  const byField = useMemo(() => {
    const map = new Map<string, FieldChange[]>();
    for (const change of changes) {
      const bucket = map.get(change.field);
      if (bucket) bucket.push(change);
      else map.set(change.field, [change]);
    }
    return [...map.entries()].sort((a, b) => fieldLabel(a[0]).localeCompare(fieldLabel(b[0])));
  }, [changes]);

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (error) {
    return (
      <Alert tone="danger" title="Couldn't load the history">
        {getApiErrorMessage(error)}
      </Alert>
    );
  }

  if (changes.length === 0) {
    return (
      <EmptyState
        title="Nothing has been changed yet"
        body="Every edit to a tracked field shows up here with what it was and who moved it."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-muted)]">
          {changes.length} change{changes.length === 1 ? "" : "s"} across{" "}
          {byField.length} field{byField.length === 1 ? "" : "s"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setGroupByField((current) => !current)}
        >
          {groupByField ? "Show in order" : "Group by field"}
        </Button>
      </div>

      {groupByField ? (
        <div className="space-y-4">
          {byField.map(([field, entries]) => (
            <section key={field} className="space-y-1">
              <h3 className="text-base font-semibold text-[var(--text-strong)]">{fieldLabel(field)}</h3>
              <Stack as="ul" gap="xs">
                {entries.map((change) => (
                  <ChangeRow key={change.id} change={change} showField={false} />
                ))}
              </Stack>
            </section>
          ))}
        </div>
      ) : (
        <Stack as="ul" gap="xs">
          {changes.map((change) => (
            <ChangeRow key={change.id} change={change} showField />
          ))}
        </Stack>
      )}
    </div>
  );
}

function Value({ value, muted }: { value: string | null; muted?: boolean }) {
  if (value === null) {
    return <span className="text-sm italic text-[var(--text-subtle)]">empty</span>;
  }
  return (
    <span
      className={
        muted
          ? "text-sm text-[var(--text-muted)] line-through decoration-[var(--border)]"
          : "text-sm font-medium"
      }
    >
      {value}
    </span>
  );
}

function ChangeRow({ change, showField }: { change: FieldChange; showField: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-[var(--surface-subtle)]">
      {change.changedBy?.name ? (
        <Avatar size="sm" name={change.changedBy.name} />
      ) : (
        <span className="size-6" />
      )}

      {showField ? (
        <span className="text-sm text-[var(--text-muted)]">{fieldLabel(change.field)}</span>
      ) : null}

      <Value value={change.oldValue} muted />
      <ArrowRight className="size-3.5 text-[var(--text-subtle)]" aria-hidden="true" />
      <Value value={change.newValue} />

      <span className="ml-auto flex items-center gap-2 text-sm text-[var(--text-subtle)]">
        {change.changedBy?.name ?? "Someone"}
        <ClientDate value={change.createdAt} mode="datetime" />
      </span>
    </li>
  );
}
