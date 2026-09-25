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
import { useQuery } from "@tanstack/react-query";

import { Button } from "@corelithzw/react";
import { EntityLink } from "@/components/records/entity-link";
import { RecordList, RecordListPager, type RecordListRow } from "@/components/records/record-list";
import {
  RecordCell,
  RecordTable,
  RecordTableName,
  type RecordTableColumn,
} from "@/components/records/record-table";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { StatusChip } from "@/components/ui/status-chip";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchJson } from "@/lib/api-client";
import { fetchCrmCompanies } from "@/lib/crm/crm-v2";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/crm/project-status";
import { PROJECT_STATUS } from "@/lib/crm/tones";
import { Building2, Coins, Tag, User, Work, Wrench } from "@/lib/icons";

import { formatMoney } from "./money";
import type { ProjectCosts } from "./project-cost-strip";
import { StartProjectSheet } from "./start-project-sheet";

type ProjectRow = {
  id: string;
  projectNo: string;
  name: string;
  status: ProjectStatus;
  currency: string;
  client: { id: string; name: string } | null;
  deal: { id: string; dealNo: string; title: string } | null;
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

/** What is left of the budget, or by how much it is over. Null when there is none. */
function budgetLeft(costs: ProjectCosts): { text: string; over: boolean } | null {
  if (costs.budget === null || costs.remaining === null) return null;
  const remaining = Number(costs.remaining);
  return remaining < 0
    ? { text: `Over by ${formatMoney(Math.abs(remaining), costs.currency)}`, over: true }
    : { text: formatMoney(costs.remaining, costs.currency), over: false };
}

function statusChip(project: ProjectRow) {
  return (
    <StatusChip
      status={PROJECT_STATUS[project.status] ?? "inactive"}
      label={PROJECT_STATUS_LABELS[project.status]}
    />
  );
}

export function ProjectsContent() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(FILTER_ANY);
  const [owner, setOwner] = useState<string>(FILTER_ANY);
  const [client, setClient] = useState<string>(FILTER_ANY);
  const [budget, setBudget] = useState<string>(FILTER_ANY);
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

  const columns = useMemo<RecordTableColumn<ProjectRow>[]>(
    () => [
      {
        id: "name",
        label: "Project",
        icon: Work,
        cell: (project) => <RecordTableName title={project.name} subtitle={project.projectNo} />,
      },
      { id: "status", label: "Status", icon: Tag, width: "9rem", cell: statusChip },
      {
        id: "owner",
        label: "Owner",
        icon: User,
        width: "10rem",
        cell: (project) => (
          <RecordCell
            kind="relation"
            value={project.manager?.name}
            href={project.manager ? `/crm/reps/${project.manager.id}` : null}
          />
        ),
      },
      {
        id: "customer",
        label: "Customer",
        icon: Building2,
        width: "12rem",
        cell: (project) =>
          project.client ? (
            <span className="block truncate">
              <EntityLink href={`/crm/companies/${project.client.id}`}>{project.client.name}</EntityLink>
            </span>
          ) : (
            <RecordCell value={null} />
          ),
      },
      {
        id: "jobs",
        label: "Jobs",
        icon: Wrench,
        width: "5rem",
        align: "end",
        cell: (project) => <RecordCell kind="number" value={project._count.workOrders} />,
      },
      {
        id: "spent",
        label: "Spent",
        icon: Coins,
        width: "9rem",
        align: "end",
        cell: (project) => (
          <RecordCell kind="money" value={formatMoney(project.costs.spent, project.costs.currency)} />
        ),
      },
      {
        id: "left",
        label: "Budget left",
        icon: Coins,
        width: "10rem",
        align: "end",
        cell: (project) => {
          const left = budgetLeft(project.costs);
          if (!left) return <span className="text-[var(--text-subtle)]">No budget</span>;
          return (
            <RecordCell
              kind="money"
              value={left.text}
              className={left.over ? "text-[var(--badge-bad-fg)]" : undefined}
            />
          );
        },
      },
    ],
    [],
  );

  const listRows = useMemo<RecordListRow[]>(
    () =>
      rows.map((project) => {
        const left = budgetLeft(project.costs);
        return {
          id: project.id,
          href: `/crm/projects/${project.id}`,
          title: project.name,
          subtitle: [project.projectNo, project.client?.name, project.manager?.name]
            .filter(Boolean)
            .join(" · "),
          status: statusChip(project),
          facts: [
            { label: "Spent", value: formatMoney(project.costs.spent, project.costs.currency), kind: "money" },
            { label: "Left", value: left?.text ?? "No budget", kind: left ? "money" : undefined },
          ],
        };
      }),
    [rows],
  );

  const empty = narrowed
    ? {
        title: "No projects match",
        body: "Nothing fits those filters. Clear one and look again.",
        action: undefined,
      }
    : {
        title: "No projects yet",
        body: "A project is what a won deal turns into — start one from the deal, or raise one here for work that never went through the pipeline.",
        action: (
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            New project
          </Button>
        ),
      };

  const resetPage = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  return (
    <RecordListShell
      title="Projects"
      search={search}
      onSearchChange={resetPage(setSearch)}
      searchPlaceholder="Search projects by name or number"
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
      <RecordTable
        rows={rows}
        columns={columns}
        rowHref={(project) => `/crm/projects/${project.id}`}
        isLoading={projectsQuery.isLoading}
        emptyTitle={empty.title}
        emptyBody={empty.body}
        emptyAction={empty.action}
        mobile={
          <RecordList
            rows={listRows}
            isLoading={projectsQuery.isLoading}
            emptyTitle={empty.title}
            emptyBody={empty.body}
            emptyAction={empty.action}
          />
        }
      />

      <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <StartProjectSheet open={creating} onOpenChange={setCreating} />
    </RecordListShell>
  );
}
