"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ListBullets } from "@corelithzw/ui/lib/icons";
import {
  fetchCrmCompanies,
  fetchCrmDeals,
  fetchCrmList,
  fetchCrmPeople,
  fetchCrmSites,
} from "@/lib/crm/crm-v2";

import { RecordList, type RecordListRow } from "./record-list";
import { RecordMark, type RecordKind } from "@corelithzw/module-records/components/record-mark";

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
  PERSON: { label: "People", kind: "person", href: (id) => `/crm/people/${id}` },
  COMPANY: { label: "Companies", kind: "company", href: (id) => `/crm/companies/${id}` },
  DEAL: { label: "Deals", kind: "deal", href: (id) => `/crm/deals/${id}` },
  SITE: { label: "Sites", kind: "site", href: (id) => `/crm/sites/${id}` },
  LEAD: { label: "Leads", kind: "lead", href: (id) => `/crm/leads/${id}` },
};

export function ListDetailPage({ listId }: { listId: string }) {
  const listQuery = useQuery({
    queryKey: ["crm", "list", listId],
    queryFn: () => fetchCrmList(listId),
  });

  const list = listQuery.data;
  const entity = list ? ENTITY[list.entity] : undefined;

  // The list stores plain record ids, so the records themselves come from
  // whichever collection the list is over. Fetched once and filtered here
  // rather than one request per member, which for a list of two hundred would
  // be two hundred round trips.
  const recordsQuery = useQuery({
    queryKey: ["crm", "list-records", list?.entity, listId],
    enabled: Boolean(list),
    queryFn: async () => {
      switch (list!.entity) {
        case "PERSON":
          return (await fetchCrmPeople({ limit: 500 })).data.map((person) => ({
            id: person.id,
            title: person.fullName,
            subtitle: [person.jobTitle, person.client?.name].filter(Boolean).join(" · "),
            emoji: person.emoji,
            avatarUrl: person.avatarUrl,
          }));
        case "COMPANY":
          return (await fetchCrmCompanies({ limit: 500 })).data.map((company) => ({
            id: company.id,
            title: company.name,
            subtitle: [company.clientNo, company.city].filter(Boolean).join(" · "),
            emoji: company.emoji,
            avatarUrl: company.avatarUrl,
          }));
        case "SITE":
          return (await fetchCrmSites({ limit: 500 })).data.map((site) => ({
            id: site.id,
            title: site.name,
            subtitle: [site.siteNo, site.city].filter(Boolean).join(" · "),
            emoji: site.emoji,
            avatarUrl: site.avatarUrl,
          }));
        default:
          return (await fetchCrmDeals({ page: 1, limit: 500 })).data.map((deal) => ({
            id: deal.id,
            title: deal.title,
            subtitle: [deal.dealNo, deal.client?.name].filter(Boolean).join(" · "),
            emoji: null as string | null,
            avatarUrl: null as string | null,
          }));
      }
    },
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
