"use client";

/**
 * Projects, with what each has cost.
 *
 * A list of project names is a list nobody opens twice, so every row carries
 * its own money: what has been spent and what is left of the budget. Those
 * two, not all four of the rollup's figures — a register is scanned down a
 * column, and the question a column answers is "which of these is in
 * trouble". The rest of the rollup is on the project.
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Button, Skeleton } from "@corelithzw/react";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  StatusDot,
} from "@/components/management/ui";
import { RecordListPager } from "@/components/records/record-list";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchJson } from "@/lib/api-client";
import { fetchCrmCompanies } from "@/lib/crm/crm-v2";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/crm/project-status";
import { PROJECT_TONE } from "@/lib/crm/tones";

import { formatMoney } from "./money";
import type { ProjectCosts } from "./project-cost-strip";
import { StartProjectDialog } from "./start-project-dialog";

type ProjectRow = {
  id: string;
  projectNo: string;
  name: string;
  status: ProjectStatus;
  currency: string;
  client: { id: string; name: string } | null;
  deal: { id: string; dealNo: string; title: string };
  manager: { id: string; name: string | null } | null;
  _count: { workOrders: number };
  costs: ProjectCosts;
};

const PAGE_SIZE = 50;

/** The server's own word for "nobody owns it", on the owner filter. */
const NOBODY = "none";

/**
 * Spend against budget. "Within" includes projects with no budget at all: a
 * project nobody budgeted is not over one.
 */
const BUDGET_OPTIONS = new Map([
  ["over", "Over budget"],
  ["within", "Within budget"],
]);

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 1080;

/** What is left of the budget, or by how much it is over. Null when there is none. */
function budgetLeft(costs: ProjectCosts): { text: string; over: boolean } | null {
  if (costs.budget === null || costs.remaining === null) return null;
  const remaining = Number(costs.remaining);
  return remaining < 0
    ? { text: `Over by ${formatMoney(Math.abs(remaining), costs.currency)}`, over: true }
    : { text: formatMoney(costs.remaining, costs.currency), over: false };
}

export function ProjectsContent() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(FILTER_ANY);
  const [owner, setOwner] = useState<string>(FILTER_ANY);
  const [client, setClient] = useState<string>(FILTER_ANY);
  // The finance overview links here as "projects over budget", so the budget
  // filter can arrive already set.
  const [budget, setBudget] = useState<string>(() =>
    BUDGET_OPTIONS.has(searchParams.get("budget") ?? "") ? searchParams.get("budget")! : FILTER_ANY,
  );
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebounced(search, 300);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    const needle = debouncedSearch.trim();
    if (needle) params.set("search", needle);
    if (status !== FILTER_ANY) params.set("status", status);
    if (owner !== FILTER_ANY) params.set("managerId", owner);
    if (client !== FILTER_ANY) params.set("clientId", client);
    if (budget !== FILTER_ANY) params.set("budget", budget);
    return params.toString();
  }, [budget, client, debouncedSearch, owner, page, status]);

  const projectsQuery = useQuery({
    queryKey: ["crm", "projects", query],
    queryFn: () =>
      fetchJson<{ data: ProjectRow[]; pagination?: { total: number } }>(
        `/api/v2/crm/projects?${query}`,
      ),
    placeholderData: (previous) => previous,
  });

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string | null }> }>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
  });

  // A picker over the directory, not a tally of the customers on this page.
  const companiesQuery = useQuery({
    queryKey: ["crm", "companies", "project-filter"],
    queryFn: () => fetchCrmCompanies({ sort: { field: "name", direction: "asc" }, limit: 100 }),
    staleTime: 5 * 60_000,
  });

  const rows = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data]);
  const total = projectsQuery.data?.pagination?.total ?? rows.length;

  const statusOptions = useMemo(
    () => new Map(PROJECT_STATUSES.map((value) => [value, PROJECT_STATUS_LABELS[value]])),
    [],
  );
  const ownerOptions = useMemo(() => {
    // A project nobody owns is the one most worth finding, so it is an answer
    // in its own right rather than folded into "Anyone".
    const people = new Map<string, string>([[NOBODY, "Nobody"]]);
    for (const member of teamQuery.data?.data ?? []) people.set(member.id, member.name ?? "Unnamed");
    return people;
  }, [teamQuery.data]);
  const clientOptions = useMemo(
    () => new Map((companiesQuery.data?.data ?? []).map((record) => [record.id, record.name])),
    [companiesQuery.data],
  );

  const filterCount = [status, owner, client, budget].filter((value) => value !== FILTER_ANY).length;
  const narrowed = Boolean(debouncedSearch.trim()) || filterCount > 0;

  const empty = narrowed ? "No projects match." : "No projects yet.";

  const resetPage = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  return (
    <RecordListShell
      title="Projects"
      search={search}
      onSearchChange={resetPage(setSearch)}
      searchPlaceholder="Search by name or number"
      searchNoun="projects"
      createLabel="New project"
      onCreate={() => setCreating(true)}
      error={projectsQuery.error}
      count={`${rows.length} of ${total}`}
      filterCount={filterCount}
      filters={
        <>
          <ViewToolbarFilter
            label="Status"
            value={status}
            anyLabel="Any"
            options={statusOptions}
            onChange={resetPage(setStatus)}
          />
          <ViewToolbarFilter
            label="Owner"
            value={owner}
            anyLabel="Anyone"
            options={ownerOptions}
            onChange={resetPage(setOwner)}
          />
          <ViewToolbarFilter
            label="Customer"
            value={client}
            anyLabel="Any"
            options={clientOptions}
            onChange={resetPage(setClient)}
          />
          <ViewToolbarFilter
            label="Budget"
            value={budget}
            anyLabel="Any"
            options={BUDGET_OPTIONS}
            onChange={resetPage(setBudget)}
          />
        </>
      }
    >
      {projectsQuery.isLoading ? (
        <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : (
        <div className="space-y-3">
          {/* The customer and owner ride under the name; the columns are the
              ones scanned down — where it is, what it has cost, what is left.
              A project's state is a dot and a word (rule 5). */}
          <ColumnList
            label="Projects"
            maxWidth={WIDTH}
            empty={empty}
            columns={[
              { id: "project", label: "Project" },
              { id: "status", label: "Status", hideBelow: "sm" },
              { id: "jobs", label: "Jobs", align: "end", hideBelow: "md" },
              { id: "spent", label: "Spent", align: "end", hideBelow: "sm" },
              { id: "left", label: "Budget left", align: "end" },
            ]}
            rows={rows.map((project) => {
              const left = budgetLeft(project.costs);
              return {
                id: project.id,
                cells: {
                  project: (
                    <ColumnName
                      code={project.projectNo}
                      name={project.name}
                      // The deal it delivers, by number: the project is
                      // usually named after it, so its title would repeat.
                      meta={[project.deal.dealNo, project.client?.name, project.manager?.name ?? "No owner"]
                        .filter(Boolean)
                        .join(" · ")}
                      href={`/crm/projects/${project.id}`}
                    />
                  ),
                  status: (
                    <StatusDot tone={PROJECT_TONE[project.status] ?? "neutral"} label={PROJECT_STATUS_LABELS[project.status]} />
                  ),
                  jobs: <ColumnFigure tone="muted">{project._count.workOrders}</ColumnFigure>,
                  spent: <ColumnFigure>{formatMoney(project.costs.spent, project.costs.currency)}</ColumnFigure>,
                  left: left ? (
                    <ColumnFigure tone={left.over ? "danger" : "default"}>{left.text}</ColumnFigure>
                  ) : (
                    <ColumnFigure tone="muted">No budget</ColumnFigure>
                  ),
                },
              };
            })}
          />
          {rows.length === 0 && !narrowed ? (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              New project
            </Button>
          ) : null}
        </div>
      )}

      <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <StartProjectDialog open={creating} onOpenChange={setCreating} />
    </RecordListShell>
  );
}
