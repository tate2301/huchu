"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageChrome } from "@/components/layout/page-chrome";
import { getApiErrorMessage } from "@/lib/api-client";
import { ListBullets } from "@/lib/icons";
import { fetchCrmLeads, fetchCrmList } from "@/lib/crm/crm-v2";

import { RecordList, type RecordListRow } from "@/components/records/record-list";
import { RecordMark, type RecordKind } from "@/components/records/record-mark";

/**
 * What each entity's list rows look like, and where a row goes.
 *
 * One page serves every kind of list because a list is the same idea whatever
 * it holds — a set of records somebody put together by hand. Only the row
 * differs, so only the row is per-entity.
 */
const ENTITY: Record<
  string,
  { label: string; kind: RecordKind; href: (id: string) => string }
> = {
  LEAD: { label: "Leads", kind: "lead", href: (id) => `/crm/leads/${id}` },
};

export function ListDetailPage({ listId }: { listId: string }) {
  const listQuery = useQuery({
    queryKey: ["crm", "list", listId],
    queryFn: () => fetchCrmList(listId),
  });

  const list = listQuery.data;
  const entity = list ? ENTITY[list.entity] : undefined;

  // The group stores plain record ids, so the records themselves come from
  // the leads they are. Fetched once and filtered here rather than one
  // request per member, which for a group of two hundred would be two hundred
  // round trips.
  const recordsQuery = useQuery({
    queryKey: ["crm", "list-records", list?.entity, listId],
    enabled: list?.entity === "LEAD",
    queryFn: async () =>
      (await fetchCrmLeads({ page: 1, limit: 100 })).data.map((lead) => ({
        id: lead.id,
        title: lead.title ?? lead.contactName ?? lead.leadNo,
        subtitle: [lead.leadNo, lead.client?.name].filter(Boolean).join(" · "),
        emoji: null as string | null,
        avatarUrl: null as string | null,
      })),
  });

  const rows = useMemo<RecordListRow[]>(() => {
    if (!list || !entity || !recordsQuery.data) return [];
    const byId = new Map(recordsQuery.data.map((record) => [record.id, record]));
    // Membership order is the list's own order — most recently added first —
    // and a record that has since been deleted simply drops out.
    return list.recordIds
      .map((id) => byId.get(id))
      .filter((record): record is NonNullable<typeof record> => Boolean(record))
      .map((record) => ({
        id: record.id,
        href: entity.href(record.id),
        title: record.title,
        subtitle: record.subtitle || undefined,
        leading: (
          <RecordMark
            kind={entity.kind}
            name={record.title}
            emoji={record.emoji}
            avatarUrl={record.avatarUrl}
            size="md"
          />
        ),
      }));
  }, [list, entity, recordsQuery.data]);

  if (listQuery.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (listQuery.error || !list) {
    return (
      <Alert variant="destructive">
        <AlertTitle>List not found</AlertTitle>
        <AlertDescription>
          {listQuery.error
            ? getApiErrorMessage(listQuery.error)
            : "It may have been deleted, or it belongs to somebody else."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <PageChrome title={list.name} icon={ListBullets} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm text-[var(--text-muted)]">
          {entity?.label ?? list.entity} · {list.recordIds.length} in this list
        </span>
        {list.isShared ? (
          <span className="text-sm text-[var(--text-muted)]">Shared with the team</span>
        ) : null}
      </div>

      {list.description ? (
        <p className="max-w-prose text-sm text-[var(--text-muted)]">{list.description}</p>
      ) : null}

      <RecordList
        rows={rows}
        isLoading={recordsQuery.isLoading}
        emptyTitle="Nothing in this list yet"
        emptyBody="Select records anywhere in the CRM and add them to this list."
      />
    </div>
  );
}
