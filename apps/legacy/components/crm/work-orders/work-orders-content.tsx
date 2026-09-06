"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Button } from "@corelithzw/react";
import { ColumnPicker } from "@corelithzw/ui/components/column-picker";
import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";
import { StatusChip } from "@corelithzw/ui/components/status-chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { RecordMark } from "@/components/records/record-mark";
import { LayoutSwitch, type RecordLayout } from "@/components/crm/records/layout-switch";
import {
  RecordList,
  RecordListPager,
  type RecordListRow,
} from "@/components/crm/records/record-list";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import {
  RecordCell,
  RecordTable,
  RecordTableName,
  type RecordTableColumn,
} from "@/components/records/record-table";
import { ViewToolbarChip } from "@/components/records/view-toolbar";
import { fetchJson } from "@corelithzw/platform/api-client";
import { fetchCrmSites } from "@/lib/crm/crm-v2";
import { useDebounced } from "@corelithzw/ui/hooks/use-debounced";
import { WORK_ORDER_STATUS } from "@/lib/crm/tones";
import {
  WORK_ORDER_QUEUE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUSES,
  type WorkOrderQueue,
} from "@/lib/crm/work-orders";
import { useVisibleColumns, type ColumnOption } from "@corelithzw/ui/lib/ui/visible-columns";
import { Building2, CalendarCheck, Checklist, MapPin, Tag, User, Wrench } from "@corelithzw/ui/lib/icons";

import { RaiseJobSheet } from "./raise-job-sheet";
import { jobHref, jobWindow, type JobRow, type JobStatus } from "./job-types";

/**
 * The queues, and the whole register beside them.
 *
 * Every queue is a status filter with a name, and between them the six name
 * neither DRAFT nor CANCELLED — so a job raised without a slot booked, which
 * is exactly the job somebody comes here to find and schedule, appeared in no
 * queue at all. "All" is the register itself.
 */
type JobQueue = WorkOrderQueue | "ALL";

const QUEUES: JobQueue[] = [
  "ALL",
  "TODAY",
  "SCHEDULED",
  "IN_PROGRESS",
  "BLOCKED",
  "MINE",
  "DONE",
];

const QUEUE_LABELS: Record<JobQueue, string> = { ...WORK_ORDER_QUEUE_LABELS, ALL: "All" };

/**
 * Which statuses each queue can hold.
 *
 * The Status chip narrows *within* the queue — the server ANDs the two — so a
 * queue that already pins one status has nothing left to ask, and offering the
 * other five there would be a control whose only effect is to empty the list.
 */
const QUEUE_STATUSES: Record<JobQueue, readonly JobStatus[]> = {
  ALL: WORK_ORDER_STATUSES,
  TODAY: ["SCHEDULED", "IN_PROGRESS"],
  SCHEDULED: ["SCHEDULED"],
  IN_PROGRESS: ["IN_PROGRESS"],
  BLOCKED: ["BLOCKED"],
  MINE: ["SCHEDULED", "IN_PROGRESS", "BLOCKED"],
  DONE: ["COMPLETED"],
};

const EMPTY_MESSAGES: Record<JobQueue, string> = {
  ALL: "No jobs yet.",
  TODAY: "No jobs booked for today.",
  SCHEDULED: "Nothing scheduled yet.",
  IN_PROGRESS: "Nobody is on site right now.",
  BLOCKED: "Nothing is blocked.",
  MINE: "You have no jobs on.",
  DONE: "No jobs completed yet.",
};

const JOB_COLUMNS: ColumnOption[] = [
  { id: "name", label: "Job", required: true },
  { id: "status", label: "Status" },
  { id: "when", label: "Window" },
  { id: "assignee", label: "Crew lead" },
  { id: "site", label: "Site" },
  { id: "customer", label: "Customer", hiddenByDefault: true },
  { id: "progress", label: "Progress" },
];

const PAGE_SIZE = 50;

/** Everything, as an option value — "" would be indistinguishable from unset. */
const ANY = "__any";

/** The server's own word for "nobody has it", on the crew filter. */
const UNASSIGNED = "none";

/**
 * The jobs register.
 *
 * This was a column of buttons in a `max-w-3xl` box with no search, no
 * columns, no way to raise a job and nowhere for a row to go. It is the day's
 * work for a service business, so it gets the same register every other CRM
 * object has: edge to edge, one toolbar, and every row a link to the job's own
 * page.
 *
 * The queue, the search box and the three chips are one question, asked of the
 * server: it narrows, it counts, and the page shows fifty rows at a time. It
 * used to pull the first hundred rows of a queue and narrow those in the
 * browser, so the search box only searched whatever page one happened to hold
 * while the count beside it quoted the server's total for the unsearched
 * queue — "12 of 250" over a search of a hundred rows, with jobs 101 and up
 * unreachable by any control on the page.
 *
 * The chips are built from stable sets — the statuses a queue can hold, the
 * team, the site directory — rather than from the rows on screen. A chip
 * assembled from the current rows can only offer what is already visible, and
 * vanishes when the rows change under it, taking with it the only control that
 * could have cleared it.
 */
export function WorkOrdersContent() {
  const { data: session } = useSession();
  const [queue, setQueue] = useState<JobQueue>("TODAY");
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<RecordLayout>("TABLE");
  const [status, setStatus] = useState<string>(ANY);
  const [assignee, setAssignee] = useState<string>(ANY);
  const [site, setSite] = useState<string>(ANY);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounced(search, 300);
  const columns = useVisibleColumns("crm.jobs.columns", JOB_COLUMNS);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (queue !== "ALL") params.set("queue", queue);

    const needle = debouncedSearch.trim();
    if (needle) params.set("q", needle);
    if (assignee !== ANY) params.set("assignedToId", assignee);
    if (site !== ANY) params.set("siteId", site);

    if (status !== ANY) {
      params.set("status", status);
    } else if (queue === "ALL") {
      // Naming every status is how this route is told the caller means the
      // whole register: with no queue and nothing narrowing, it falls back to
      // today's work, which is the one answer "All" must not give.
      params.set("status", WORK_ORDER_STATUSES.join(","));
    }

    return params.toString();
  }, [assignee, debouncedSearch, page, queue, site, status]);

  const jobsQuery = useQuery({
    queryKey: ["crm", "jobs", query],
    queryFn: () =>
      fetchJson<{ data: JobRow[]; pagination?: { total: number } }>(
        `/api/v2/crm/work-orders?${query}`,
      ),
    placeholderData: (previous) => previous,
  });

  const rows = useMemo(() => jobsQuery.data?.data ?? [], [jobsQuery.data]);
  const total = jobsQuery.data?.pagination?.total ?? rows.length;

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string | null }> }>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
  });

  // The site chip is a picker over the directory, not a tally of the sites in
  // view. It is capped like every other picker here; a site past the cap is
  // still reachable through its own record page, which lists its jobs.
  const sitesQuery = useQuery({
    queryKey: ["crm", "sites", "job-filter"],
    queryFn: () => fetchCrmSites({ sort: { field: "name", direction: "asc" }, limit: 100 }),
    staleTime: 5 * 60_000,
  });

  const statusOptions = useMemo(
    () =>
      new Map(QUEUE_STATUSES[queue].map((value) => [value, WORK_ORDER_STATUS_LABELS[value]])),
    [queue],
  );

  const crewOptions = useMemo(() => {
    const people = new Map<string, string>();
    // Mine is already "assigned to me", so there is nobody else to choose.
    if (queue === "MINE") return people;
    // A job nobody has been given is the row a coordinator opens this page to
    // find, so it is an answer in its own right rather than part of "Anyone".
    people.set(UNASSIGNED, "Nobody");
    for (const member of teamQuery.data?.data ?? []) {
      people.set(member.id, member.name ?? "Unnamed");
    }
    return people;
  }, [queue, teamQuery.data]);

  const siteOptions = useMemo(
    () => new Map((sitesQuery.data?.data ?? []).map((record) => [record.id, record.name])),
    [sitesQuery.data],
  );

  const filterCount = [status, assignee, site].filter((value) => value !== ANY).length;
  const narrowed = Boolean(debouncedSearch.trim()) || filterCount > 0;

  /**
   * Switching queues, and dropping whatever the new one cannot hold.
   *
   * A filter left set behind a chip the new queue no longer draws is a list
   * narrowed to nothing by something invisible — and the count, the empty
   * state and the phone's "Filters (1)" all keep referring to it.
   */
  const chooseQueue = (next: JobQueue) => {
    setQueue(next);
    setPage(1);
    const admissible = QUEUE_STATUSES[next];
    if (admissible.length < 2 || !admissible.includes(status as JobStatus)) setStatus(ANY);
    if (next === "MINE") setAssignee(ANY);
  };

  const clearNarrowing = () => {
    setSearch("");
    setStatus(ANY);
    setAssignee(ANY);
    setSite(ANY);
    setPage(1);
  };

  const tableColumns = useMemo<RecordTableColumn<JobRow>[]>(
    () => [
      {
        id: "name",
        label: "Job",
        icon: Wrench,
        cell: (job) => (
          <RecordTableName
            leading={<RecordMark kind="work-order" name={job.title} size="sm" />}
            title={job.title}
            subtitle={job.workOrderNo}
          />
        ),
      },
      {
        id: "status",
        label: "Status",
        icon: Tag,
        width: "11rem",
        cell: (job) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <StatusChip
              status={WORK_ORDER_STATUS[job.status] ?? "inactive"}
              label={WORK_ORDER_STATUS_LABELS[job.status]}
            />
            {/* A job that should have started and hasn't is the row somebody
                opened this page to find, so it says so in the danger ink
                rather than looking like every other scheduled job. */}
            {job.isOverdue ? (
              <span className="shrink-0 text-sm font-medium text-[var(--badge-bad-fg)]">
                Late
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "when",
        label: "Window",
        icon: CalendarCheck,
        width: "13rem",
        cell: (job) => (
          <RecordCell kind="date" value={jobWindow(job.scheduledStart, job.scheduledEnd)} />
        ),
      },
      {
        id: "assignee",
        label: "Crew lead",
        icon: User,
        width: "11rem",
        cell: (job) => (
          <RecordCell
            kind="relation"
            value={job.assignedTo?.name ?? null}
            href={job.assignedTo ? `/crm/reps/${job.assignedTo.id}` : null}
          />
        ),
      },
      {
        id: "site",
        label: "Site",
        icon: MapPin,
        width: "12rem",
        cell: (job) => (
          <RecordCell
            kind="relation"
            value={job.site?.name ?? null}
            href={job.site ? `/crm/sites/${job.site.id}` : null}
          />
        ),
      },
      {
        id: "customer",
        label: "Customer",
        icon: Building2,
        width: "12rem",
        cell: (job) => (
          <RecordCell
            kind="relation"
            value={job.client?.name ?? null}
            href={job.client ? `/crm/companies/${job.client.id}` : null}
          />
        ),
      },
      {
        id: "progress",
        label: "Progress",
        icon: Checklist,
        width: "7rem",
        align: "end",
        cell: (job) => (
          <RecordCell
            kind="number"
            value={job.itemCount > 0 ? `${job.completionPercent}%` : null}
          />
        ),
      },
    ],
    [],
  );

  const visible = useMemo(
    () => tableColumns.filter((column) => columns.isVisible(column.id)),
    [columns, tableColumns],
  );

  // An empty list has two causes and they want two different sentences. The
  // queue narrows as much as the chips do, so the narrowed message names it —
  // "nothing matches" over a Blocked queue sends somebody looking for a fault
  // in their search when the answer is that nothing is blocked.
  const empty = narrowed
    ? {
        title: "No jobs match that",
        body:
          queue === "ALL"
            ? "Nothing in the register matches the search and the filters above."
            : `Nothing in ${QUEUE_LABELS[queue]} matches the search and the filters above — the queue narrows this list too.`,
        // Offered instead of "Raise a job": a search with no hits wants the
        // search widened, not a second job nobody asked for. Widening the
        // queue keeps the search and the chips — it is the same question of
        // the whole register, which is usually where the job actually is.
        action: (
          <span className="flex flex-wrap items-center justify-center gap-2">
            {queue === "ALL" ? null : (
              <Button variant="secondary" size="sm" onClick={() => chooseQueue("ALL")}>
                Look in every queue
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={clearNarrowing}>
              Clear the filters
            </Button>
          </span>
        ),
      }
    : {
        title: EMPTY_MESSAGES[queue],
        body: "A job is the work a won deal turns into — raise one and it lands on the crew's list.",
        action: (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            Raise a job
          </Button>
        ),
      };

  const listRows = useMemo<RecordListRow[]>(
    () =>
      rows.map((job) => ({
        id: job.id,
        href: jobHref(job.id),
        leading: <RecordMark kind="work-order" name={job.title} size="md" />,
        title: job.title,
        subtitle: [job.workOrderNo, job.site?.name, jobWindow(job.scheduledStart, job.scheduledEnd)]
          .filter(Boolean)
          .join(" · "),
        status: (
          <StatusChip
            status={WORK_ORDER_STATUS[job.status] ?? "inactive"}
            label={WORK_ORDER_STATUS_LABELS[job.status]}
          />
        ),
        facts: [
          { label: "Crew", value: job.assignedTo?.name ?? "Unassigned" },
          ...(job.itemCount > 0
            ? [{ label: "Done", value: `${job.completionPercent}%`, primary: true, mono: true }]
            : []),
        ],
      })),
    [rows],
  );

  const register = (
    <RecordList
      rows={listRows}
      isLoading={jobsQuery.isLoading}
      emptyTitle={empty.title}
      emptyBody={empty.body}
      emptyAction={empty.action}
    />
  );

  return (
    <RecordListShell
      title="Jobs"
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      searchPlaceholder="Search jobs by number or title"
      searchNoun="jobs"
      createLabel="New job"
      onCreate={() => setCreateOpen(true)}
      error={jobsQuery.error}
      // Both halves now count the same set: the rows on this page, out of
      // everything the server matched for this queue, search and chips.
      count={`${rows.length} of ${total}`}
      filterCount={filterCount}
      layout={<LayoutSwitch value={layout} onChange={setLayout} options={["TABLE", "LIST"]} />}
      display={<ColumnPicker columns={JOB_COLUMNS} state={columns} />}
      filters={
        <>
          <SegmentedControl
            value={queue}
            onValueChange={chooseQueue}
            ariaLabel="Job queue"
            options={QUEUES.map((value) => ({ value, label: QUEUE_LABELS[value] }))}
          />
          <JobFilterChip
            label="Status"
            value={status}
            anyLabel="Any"
            options={statusOptions}
            onChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
          />
          <JobFilterChip
            label="Crew"
            value={assignee}
            anyLabel="Anyone"
            options={crewOptions}
            onChange={(next) => {
              setAssignee(next);
              setPage(1);
            }}
          />
          <JobFilterChip
            label="Site"
            value={site}
            anyLabel="Anywhere"
            options={siteOptions}
            onChange={(next) => {
              setSite(next);
              setPage(1);
            }}
          />
        </>
      }
    >
      {layout === "TABLE" ? (
        <RecordTable
          rows={rows}
          columns={visible}
          rowHref={(job) => jobHref(job.id)}
          isLoading={jobsQuery.isLoading}
          emptyTitle={empty.title}
          emptyBody={empty.body}
          emptyAction={empty.action}
          mobile={register}
        />
      ) : (
        register
      )}

      <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <RaiseJobSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        currentUserId={session?.user?.id}
      />
    </RecordListShell>
  );
}

/**
 * One of the toolbar's chips, over a set that does not depend on the rows.
 *
 * A chip with nothing to choose between is a control that can only be set back
 * to where it already is, so it does not draw until there are two answers to
 * the question it asks — unless it is already narrowing the list, in which case
 * it draws whatever its options say. A filter you cannot see is a filter you
 * cannot clear, and it empties the list from off screen.
 */
function JobFilterChip({
  label,
  value,
  anyLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  /** What "no filter" is called — "Anyone", "Anywhere". */
  anyLabel: string;
  options: Map<string, string>;
  onChange: (next: string) => void;
}) {
  if (options.size < 2 && value === ANY) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ViewToolbarChip label={label} value={options.get(value) ?? anyLabel} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value={ANY}>{anyLabel}</DropdownMenuRadioItem>
          {[...options.entries()].map(([id, name]) => (
            <DropdownMenuRadioItem key={id} value={id}>
              {name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
