"use client";

import { useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchCrmList } from "@/lib/crm/crm-v2";

import { RecordList, type RecordListRow } from "@/components/records/record-list";
import { RecordMark } from "@/components/records/record-mark";
import { jobHref, type JobRow } from "@/components/crm/work-orders/job-types";
import { CrmFinding } from "@/components/crm/crm-finding";

/**
 * A group of jobs.
 *
 * Every other kind of group opens as its own list narrowed to the group
 * (`groupHref`), where it can be searched, sorted and exported. Jobs are not
 * on the list engine yet, so their groups are drawn here, from the jobs
 * endpoint's own `group` narrowing.
 */
export function ListDetailPage({ listId }: { listId: string }) {
  const listQuery = useQuery({
    queryKey: ["crm", "list", listId],
    queryFn: () => fetchCrmList(listId),
  });

  const list = listQuery.data;

  const jobsQuery = useQuery({
    queryKey: ["crm", "jobs", "group", listId],
    enabled: list?.entity === "WORK_ORDER",
    queryFn: () =>
      fetchJson<{ data: JobRow[] }>(`/api/v2/crm/work-orders?group=${listId}&limit=100`),
  });

  const rows: RecordListRow[] = (jobsQuery.data?.data ?? []).map((job) => ({
    id: job.id,
    href: jobHref(job.id),
    title: job.title,
    subtitle: [job.workOrderNo, job.client?.name].filter(Boolean).join(" · "),
    leading: <RecordMark kind="work-order" name={job.title} size="md" />,
  }));

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
        <AlertTitle>Group not found</AlertTitle>
        <AlertDescription>
          {listQuery.error
            ? getApiErrorMessage(listQuery.error)
            : "It may have been deleted, or it belongs to somebody else."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="crm-bk-worksheet">
      <PageChrome title={list.name} />

      <div className="crm-bk-tabs-bar">
        <div className="crm-bk-tabs">
          <span className="crm-bk-tab" data-active="true">
            <span>Jobs in group</span>
            <span className="cnt">{list.recordIds.length}</span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
          {list.isShared ? <span>Shared with the team</span> : <span>Private group</span>}
        </div>
      </div>

      {list.description ? (
        <CrmFinding label="Group" text={list.description} />
      ) : null}

      <RecordList
        rows={rows}
        isLoading={jobsQuery.isLoading}
        emptyTitle="Nothing in this group yet"
        emptyBody="Open a job and add it to this group from its Groups menu."
      />
    </div>
  );
}
