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

import { Button } from "@corelithzw/react";
import { StatusDot } from "@/components/management/ui";
import {
  RecordCell,
  RecordTable,
  RecordTableName,
  type RecordTableColumn,
} from "@/components/records/record-table";
import { RecordListPager } from "@/components/records/record-list";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchJson } from "@/lib/api-client";
import { fetchCrmCompanies } from "@/lib/crm/crm-v2";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/crm/project-status";
import { PROJECT_TONE } from "@/lib/crm/tones";
import { cn } from "@/lib/utils";
import { ciNavIcon } from "@/components/books/icons/nav-icon";
import {
  ci_apps,
  ci_calendar_clock,
  ci_clock,
  ci_alert,
  ci_check_circle,
  ci_x_circle,
} from "@/components/books/icons/glyphs";

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
  // Money in and out links here as "projects over budget", so the budget
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
    queryFn: () => fetchCrmCompanies({ limit: 100 }),
    staleTime: 5 * 60_000,
  });

  const rows = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data]);
  const total = projectsQuery.data?.pagination?.total ?? rows.length;

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

  const filterCount = [owner, client, budget].filter((value) => value !== FILTER_ANY).length;
  const narrowed = Boolean(debouncedSearch.trim()) || filterCount > 0 || status !== FILTER_ANY;

  const resetPage = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  const overBudgetCount = useMemo(
    () => rows.filter((p) => p.costs.budget !== null && Number(p.costs.remaining) < 0).length,
    [rows],
  );
  const unownedCount = useMemo(() => rows.filter((p) => !p.manager).length, [rows]);

  const finding = useMemo(() => {
    if (projectsQuery.isLoading || rows.length === 0) return null;
    if (overBudgetCount > 0) {
      return {
        tone: "bad" as const,
        children: (
          <>
            <b>
              {overBudgetCount} {overBudgetCount === 1 ? "project is" : "projects are"} over budget
            </b>{" "}
            on this view
            {unownedCount > 0 ? ` · ${unownedCount} without an assigned project owner.` : "."}
          </>
        ),
        action:
          budget !== "over"
            ? {
                label: "Filter over budget →",
                onClick: () => {
                  setBudget("over");
                  setPage(1);
                },
              }
            : {
                label: "Show all budgets",
                onClick: () => {
                  setBudget(FILTER_ANY);
                  setPage(1);
                },
              },
      };
    }
    if (unownedCount > 0) {
      return {
        tone: "warn" as const,
        children: (
          <>
            <b>
              {unownedCount} {unownedCount === 1 ? "project has" : "projects have"} no owner
            </b>{" "}
            assigned to answer for the budget and schedule.
          </>
        ),
        action:
          owner !== NOBODY
            ? {
                label: "Show unowned →",
                onClick: () => {
                  setOwner(NOBODY);
                  setPage(1);
                },
              }
            : undefined,
      };
    }
    return null;
  }, [budget, overBudgetCount, owner, projectsQuery.isLoading, rows.length, unownedCount]);

  const statusTabs = useMemo(
    () => [
      {
        value: FILTER_ANY,
        label: "All projects",
        count: status === FILTER_ANY ? total : undefined,
        icon: ciNavIcon(ci_apps),
      },
      ...PROJECT_STATUSES.map((value) => {
        const glyph =
          value === "PLANNING"
            ? ci_calendar_clock
            : value === "ACTIVE"
              ? ci_clock
              : value === "ON_HOLD"
                ? ci_alert
                : value === "COMPLETED"
                  ? ci_check_circle
                  : ci_x_circle;
        return {
          value,
          label: PROJECT_STATUS_LABELS[value],
          count: status === value ? total : undefined,
          icon: ciNavIcon(glyph),
        };
      }),
    ],
    [status, total],
  );

  const columns = useMemo<RecordTableColumn<ProjectRow>[]>(
    () => [
      {
        id: "project",
        label: "Project",
        cell: (row) => (
          <RecordTableName
            title={row.name}
            subtitle={`${row.projectNo} · ${row.deal.dealNo}`}
          />
        ),
      },
      {
        id: "status",
        label: "Status",
        width: "8.5rem",
        cell: (row) => (
          <StatusDot
            tone={PROJECT_TONE[row.status] ?? "neutral"}
            label={PROJECT_STATUS_LABELS[row.status]}
          />
        ),
      },
      {
        id: "customer",
        label: "Customer",
        width: "12rem",
        cell: (row) => (
          <RecordCell
            kind="relation"
            value={row.client?.name ?? "—"}
            href={row.client ? `/crm/companies/${row.client.id}` : null}
          />
        ),
      },
      {
        id: "owner",
        label: "Owner",
        width: "10rem",
        cell: (row) => (
          <RecordCell
            kind="text"
            value={row.manager?.name ?? "No owner"}
            className={!row.manager ? "font-medium text-[var(--color-warn)]" : undefined}
          />
        ),
      },
      {
        id: "jobs",
        label: "Jobs",
        width: "5rem",
        align: "end",
        cell: (row) => <RecordCell kind="number" value={row._count.workOrders} />,
      },
      {
        id: "spent",
        label: "Spent",
        width: "8.5rem",
        align: "end",
        cell: (row) => (
          <RecordCell kind="money" value={formatMoney(row.costs.spent, row.costs.currency)} />
        ),
      },
      {
        id: "left",
        label: "Budget left",
        width: "9.5rem",
        align: "end",
        cell: (row) => {
          const left = budgetLeft(row.costs);
          if (!left) return <span className="font-mono text-sm text-[var(--color-ink-3)]">—</span>;
          return (
            <span
              className={cn(
                "font-mono text-sm tabular-nums",
                left.over
                  ? "font-semibold text-[var(--color-bad)]"
                  : "font-medium text-[var(--color-ink)]",
              )}
            >
              {left.text}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <RecordListShell
      title="Projects"
      finding={finding}
      tabs={statusTabs}
      activeTab={status}
      onTabChange={resetPage(setStatus)}
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
        emptyTitle={narrowed ? "No projects match that search" : "No projects yet"}
        emptyBody={
          narrowed
            ? "Try changing your search term, owner, or budget filter."
            : "When a deal is won, start a project to track its budget, jobs, and spend."
        }
        emptyAction={
          !narrowed ? (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              New project
            </Button>
          ) : undefined
        }
      />

      <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <StartProjectDialog open={creating} onOpenChange={setCreating} />
    </RecordListShell>
  );
}
