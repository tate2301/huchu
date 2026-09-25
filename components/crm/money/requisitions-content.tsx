"use client";

/**
 * Requisitions: asking for money, and answering.
 *
 * Several queues because different people open this page. A rep wants
 * theirs. An approver wants what is waiting on them. Whoever holds the cash
 * wants what is approved and unpaid, and what is out and unaccounted for. A
 * single list sorted by date serves none of them. The queue is in the URL, so
 * "the ones waiting on you" is a link somebody can send.
 *
 * Rows open the requisition, and that is where it moves: one page decides what
 * a requisition can do next and who may do it, rather than a row of buttons
 * here and a second set of rules there.
 */

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@corelithzw/react";
import { RecordListPager } from "@/components/records/record-list";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchJson } from "@/lib/api-client";

import type { RequisitionRow } from "./money";
import { RaiseRequisitionSheet } from "./raise-requisition-sheet";
import { RequisitionTable } from "./requisition-table";

type Queue = "MINE" | "AWAITING_DECISION" | "APPROVED" | "OUTSTANDING";

type ListResponse = {
  data: RequisitionRow[];
  pagination?: { total: number };
  queueCounts: Partial<Record<Queue, number>>;
  permissions: { mayApprove: boolean; mayDisburse: boolean };
};

const QUEUES: Array<{ value: Queue; label: string }> = [
  { value: "MINE", label: "Mine" },
  { value: "AWAITING_DECISION", label: "Waiting on me" },
  { value: "APPROVED", label: "Approved" },
  { value: "OUTSTANDING", label: "Outstanding" },
];

const EMPTY: Record<Queue, { title: string; body: string }> = {
  MINE: {
    title: "You have not asked for anything",
    body: "Ask for money for fuel, materials or anything else the work needs. It goes straight to whoever approves.",
  },
  AWAITING_DECISION: {
    title: "Nothing is waiting on you",
    body: "Requests somebody has sent for approval land here. Your own go to somebody else.",
  },
  APPROVED: {
    title: "Nothing to pay out",
    body: "Approved requests land here until somebody marks them paid.",
  },
  OUTSTANDING: {
    title: "Nothing outstanding",
    body: "Money paid out lands here until the person who asked accounts for what it went on.",
  },
};

const PAGE_SIZE = 50;

/** The server's word for "not for a project", on the project filter. */
const NO_PROJECT = "none";

export function RequisitionsContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("queue");
  const queue: Queue = QUEUES.find((option) => option.value === requested)?.value ?? "MINE";

  const [search, setSearch] = useState("");
  const [project, setProject] = useState<string>(FILTER_ANY);
  const [person, setPerson] = useState<string>(FILTER_ANY);
  // The page belongs to the queue it was turned in: switching queues starts
  // the new one at its first page rather than at page three of nothing.
  const [paging, setPaging] = useState({ queue, page: 1 });
  const page = paging.queue === queue ? paging.page : 1;
  const setPage = (next: number) => setPaging({ queue, page: next });
  const [raising, setRaising] = useState(false);
  const debouncedSearch = useDebounced(search, 300);

  const query = useMemo(() => {
    const params = new URLSearchParams({ queue, page: String(page), limit: String(PAGE_SIZE) });
    const needle = debouncedSearch.trim();
    if (needle) params.set("q", needle);
    if (project !== FILTER_ANY) params.set("projectId", project);
    // Mine is already "asked by me"; a second person would narrow it to nothing.
    if (person !== FILTER_ANY && queue !== "MINE") params.set("requestedById", person);
    return params.toString();
  }, [debouncedSearch, page, person, project, queue]);

  const listQuery = useQuery({
    queryKey: ["crm", "requisitions", query],
    queryFn: () => fetchJson<ListResponse>(`/api/v2/crm/requisitions?${query}`),
    placeholderData: (previous) => previous,
  });

  const projectsQuery = useQuery({
    queryKey: ["crm", "projects", "requisition-filter"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; projectNo: string; name: string }> }>(
        "/api/v2/crm/projects?costs=false&limit=100",
      ),
    staleTime: 5 * 60_000,
  });

  const permissions = listQuery.data?.permissions ?? { mayApprove: false, mayDisburse: false };
  const canSeeOthers = permissions.mayApprove || permissions.mayDisburse;

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string | null }> }>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
    enabled: canSeeOthers,
  });

  const rows = useMemo(() => listQuery.data?.data ?? [], [listQuery.data]);
  const total = listQuery.data?.pagination?.total ?? rows.length;
  const counts = listQuery.data?.queueCounts ?? {};

  const projectOptions = useMemo(() => {
    // Fuel and airtime are asked for with no project behind them, and finding
    // those is a real question, so it is an answer in its own right.
    const options = new Map<string, string>([[NO_PROJECT, "Not for a project"]]);
    for (const option of projectsQuery.data?.data ?? []) options.set(option.id, option.name);
    return options;
  }, [projectsQuery.data]);

  const personOptions = useMemo(
    () => new Map((teamQuery.data?.data ?? []).map((member) => [member.id, member.name ?? "Unnamed"])),
    [teamQuery.data],
  );

  const filterCount = [project, person].filter((value) => value !== FILTER_ANY).length;
  const narrowed = Boolean(debouncedSearch.trim()) || filterCount > 0;
  const empty = narrowed
    ? { title: "Nothing matches", body: "Nothing in this queue fits those filters." }
    : EMPTY[queue];

  const queueHref = (value: Queue) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "MINE") next.delete("queue");
    else next.set("queue", value);
    const rendered = next.toString();
    return rendered ? `${pathname}?${rendered}` : pathname;
  };

  return (
    <div className="space-y-3">
      {/* The queues are the page's tabs, on their own row; the filters are a
          different question and sit on the toolbar under them. A rep has one
          queue — their own — so there is nothing to switch between. */}
      {canSeeOthers ? (
        <SectionTabs label="Requisition queues">
          {QUEUES.map((option) => (
            <SectionTab
              key={option.value}
              to={queueHref(option.value)}
              active={queue === option.value}
              count={counts[option.value] || undefined}
            >
              {option.label}
            </SectionTab>
          ))}
        </SectionTabs>
      ) : null}

      <RecordListShell
        title="Requisitions"
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search by what it was for, or its number"
        searchNoun="requisitions"
        createLabel="Ask for money"
        onCreate={() => setRaising(true)}
        error={listQuery.error}
        count={`${rows.length} of ${total}`}
        filterCount={filterCount}
        filters={
          <>
            <ViewToolbarFilter
              label="Project"
              value={project}
              anyLabel="Any"
              options={projectOptions}
              onChange={(next) => {
                setProject(next);
                setPage(1);
              }}
            />
            {canSeeOthers && queue !== "MINE" ? (
              <ViewToolbarFilter
                label="Asked by"
                value={person}
                anyLabel="Anyone"
                options={personOptions}
                onChange={(next) => {
                  setPerson(next);
                  setPage(1);
                }}
              />
            ) : null}
          </>
        }
      >
        <RequisitionTable
          rows={rows}
          isLoading={listQuery.isLoading}
          showRequester={queue !== "MINE"}
          rowHref={(row) => `/crm/requisitions/${row.id}`}
          emptyTitle={empty.title}
          emptyBody={empty.body}
          emptyAction={
            queue === "MINE" && !narrowed ? (
              <Button variant="primary" size="sm" onClick={() => setRaising(true)}>
                Ask for money
              </Button>
            ) : undefined
          }
        />

        <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      </RecordListShell>

      <RaiseRequisitionSheet open={raising} onOpenChange={setRaising} />
    </div>
  );
}
