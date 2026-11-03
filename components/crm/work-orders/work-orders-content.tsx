"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, Button } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { ListSearch } from "@/components/crm/records/list-search";
import { CrmFinding } from "@/components/crm/crm-finding";
import { StatusDot } from "@/components/management/ui";
import { RecordMark } from "@/components/records/record-mark";
import { RecordListPager } from "@/components/records/record-list";
import {
  RecordCell,
  RecordTable,
  RecordTableName,
  type RecordTableColumn,
} from "@/components/records/record-table";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchCrmSites } from "@/lib/crm/crm-v2";
import { useDebounced } from "@/hooks/use-debounced";
import {
  WORK_ORDER_QUEUE_LABELS,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderQueue,
} from "@/lib/crm/work-orders";
import { Building2, CalendarCheck, Checklist, Funnel, MapPin, Tag, User, Wrench } from "@/lib/icons";
import {
  ci_alert,
  ci_apps,
  ci_calendar_check,
  ci_calendar_clock,
  ci_check_circle,
  ci_clock,
  ci_download,
  ci_user,
} from "@/components/books/icons/glyphs";
import type { CiGlyph } from "@/components/books/icons/types";
import { CiGlyphIcon } from "@/components/books/icons/glyph-icon";
import { downloadCsv } from "@/components/books/bk-list";

import { RaiseJobSheet } from "./raise-job-sheet";
import { jobHref, jobWindow, type JobRow, type JobStatus } from "./job-types";

const WORK_ORDER_TONE: Record<string, "neutral" | "success" | "warn" | "danger"> = {
  DRAFT: "neutral",
  SCHEDULED: "neutral",
  IN_PROGRESS: "warn",
  BLOCKED: "danger",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

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

const QUEUE_GLYPHS: Record<JobQueue, CiGlyph> = {
  ALL: ci_apps,
  TODAY: ci_calendar_check,
  SCHEDULED: ci_calendar_clock,
  IN_PROGRESS: ci_clock,
  BLOCKED: ci_alert,
  MINE: ci_user,
  DONE: ci_check_circle,
};

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

const PAGE_SIZE = 50;

const ANY = "any";

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
  const [status, setStatus] = useState<string>(ANY);
  const [assignee, setAssignee] = useState<string>(ANY);
  const [site, setSite] = useState<string>(ANY);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounced(search, 300);

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
    queryFn: () => fetchCrmSites({ limit: 100 }),
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
  const chooseQueue = useCallback((next: JobQueue) => {
    setQueue(next);
    setPage(1);
    const admissible = QUEUE_STATUSES[next];
    if (admissible.length < 2 || !admissible.includes(status as JobStatus)) setStatus(ANY);
    if (next === "MINE") setAssignee(ANY);
  }, [status]);

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
        // What the job delivers, and what it is invoiced against.
        id: "deal",
        label: "Deal",
        icon: Funnel,
        width: "14rem",
        cell: (job) => (
          <RecordCell
            kind="relation"
            value={job.deal?.title ?? null}
            href={job.deal ? `/crm/deals/${job.deal.id}` : null}
          />
        ),
      },
      {
        id: "status",
        label: "Status",
        icon: Tag,
        width: "11rem",
        cell: (job) => (
          <div className="flex items-center gap-2">
            <StatusDot
              tone={WORK_ORDER_TONE[job.status] ?? "neutral"}
              label={WORK_ORDER_STATUS_LABELS[job.status] ?? job.status}
            />
            {job.isOverdue ? (
              <span className="rounded bg-[var(--badge-bad-bg)] px-1.5 py-0.5 text-sm font-medium text-[var(--badge-bad-fg)]">
                Late
              </span>
            ) : null}
          </div>
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

  const emptyTitle = narrowed ? "No jobs match that" : EMPTY_MESSAGES[queue];
  const emptyBody = narrowed
    ? queue === "ALL"
      ? "Nothing in the register matches the search and the filters above."
      : `Nothing in ${QUEUE_LABELS[queue]} matches the search and the filters above.`
    : "A job is the work a won deal turns into — raise one and it lands on the crew's list.";

  const overdueCount = useMemo(() => rows.filter((j) => j.isOverdue).length, [rows]);
  const blockedCount = useMemo(() => rows.filter((j) => j.status === "BLOCKED").length, [rows]);
  const unassignedCount = useMemo(
    () => rows.filter((j) => !j.assignedTo && j.status !== "COMPLETED" && j.status !== "CANCELLED").length,
    [rows],
  );

  const handleExportCsv = () => {
    const head = [
      "Job No",
      "Title",
      "Deal",
      "Status",
      "Window Start",
      "Window End",
      "Crew Lead",
      "Site",
      "Customer",
      "Progress",
    ];
    const data = rows.map((job) => [
      job.workOrderNo,
      job.title,
      job.deal?.title ?? "",
      WORK_ORDER_STATUS_LABELS[job.status] ?? job.status,
      job.scheduledStart ?? "",
      job.scheduledEnd ?? "",
      job.assignedTo?.name ?? "",
      job.site?.name ?? "",
      job.client?.name ?? "",
      job.itemCount > 0 ? `${job.completionPercent}%` : "",
    ]);
    downloadCsv("jobs.csv", head, data);
  };

  return (
    <div className="crm-bk-worksheet">
      <PageChrome
        title="Jobs"
        primary={{
          label: "Raise a job",
          icon: "plus",
          shortcut: "N",
          onClick: () => setCreateOpen(true),
        }}
      />

      {blockedCount > 0 || overdueCount > 0 ? (
        <CrmFinding
          label={blockedCount > 0 ? "Blocked" : "Overdue"}
          tone="danger"
          fact={
            blockedCount > 0
              ? `${blockedCount} ${blockedCount === 1 ? "job is" : "jobs are"} blocked on site`
              : `${overdueCount} ${overdueCount === 1 ? "job is" : "jobs are"} late past scheduled window`
          }
          rest={
            blockedCount > 0 && overdueCount > 0
              ? `· ${overdueCount} late${unassignedCount > 0 ? ` · ${unassignedCount} unassigned` : ""}.`
              : unassignedCount > 0
                ? `— ${unassignedCount} jobs without a crew lead.`
                : undefined
          }
          action={
            blockedCount > 0 && queue !== "BLOCKED"
              ? {
                  label: "Show blocked →",
                  onClick: () => chooseQueue("BLOCKED"),
                }
              : unassignedCount > 0 && assignee !== UNASSIGNED
                ? {
                    label: "Show unassigned →",
                    onClick: () => {
                      setAssignee(UNASSIGNED);
                      setPage(1);
                    },
                  }
                : undefined
          }
        />
      ) : null}

      <div className="crm-bk-tabs-bar" role="tablist" aria-label="Job queue">
        <div className="crm-bk-tabs">
          {QUEUES.map((value) => {
            const active = queue === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                data-active={active || undefined}
                onClick={() => chooseQueue(value)}
                className="crm-bk-tab"
              >
                <CiGlyphIcon glyph={QUEUE_GLYPHS[value]} size={16} className="shrink-0" />
                <span>{QUEUE_LABELS[value]}</span>
                {active ? <span className="n">{total}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="crm-bk-tools">
        <ListSearch
          value={search}
          onChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          narrow
          placeholder="Search jobs by number or title…"
        />

        {QUEUE_STATUSES[queue].length > 1 ? (
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink-1)]"
            aria-label="Filter by status"
          >
            <option value={ANY}>All statuses</option>
            {Array.from(statusOptions.entries()).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        ) : null}

        {queue !== "MINE" ? (
          <select
            value={assignee}
            onChange={(e) => {
              setAssignee(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink-1)]"
            aria-label="Filter by crew"
          >
            <option value={ANY}>All crews</option>
            {Array.from(crewOptions.entries()).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={site}
          onChange={(e) => {
            setSite(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink-1)]"
          aria-label="Filter by site"
        >
          <option value={ANY}>All sites</option>
          {Array.from(siteOptions.entries()).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-[var(--color-ink-3)]">
            {rows.length} of {total} jobs
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            className="h-7 text-sm font-medium"
          >
            <CiGlyphIcon glyph={ci_download} size={14} className="mr-1.5 shrink-0" />
            Export
          </Button>
        </div>
      </div>

      {jobsQuery.error ? (
        <div className="px-6 py-3">
          <Alert tone="danger" title="Couldn't load jobs">
            {getApiErrorMessage(jobsQuery.error)}
          </Alert>
        </div>
      ) : null}

      <RecordTable
        rows={rows}
        columns={tableColumns}
        rowHref={(job) => jobHref(job.id)}
        isLoading={jobsQuery.isLoading}
        emptyTitle={emptyTitle}
        emptyBody={emptyBody}
        emptyAction={
          narrowed ? (
            <Button variant="ghost" size="sm" onClick={clearNarrowing}>
              Clear filters
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              Raise a job
            </Button>
          )
        }
      />

      <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <RaiseJobSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        currentUserId={session?.user?.id}
      />
    </div>
  );
}

