"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { NumericCell } from "@/components/ui/numeric-cell";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchCrmReps, type CrmRepSummary } from "@/lib/crm/crm-v2";

import { RecordMark } from "@/components/records/record-mark";
import { RecordList, type RecordListRow } from "@/components/records/record-list";
import { RecordCell, RecordTable, RecordTableName, type RecordTableColumn } from "@/components/records/record-table";
import { RecordListShell, type RecordListTab } from "@/components/crm/records/record-list-shell";
import { formatMoney } from "@/components/crm/documents/document-types";

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Owner",
  MANAGER: "Sales manager",
  SALES_REP: "Sales rep",
  SALES_EXEC: "Sales executive",
};

/**
 * The team as a Books worksheet directory.
 */
export function RepsContent() {
  const { data: session } = useSession();
  const me = session?.user?.id;
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const debouncedSearch = useDebounced(search, 300);

  const repsQuery = useQuery({
    queryKey: ["crm", "reps"],
    queryFn: () => fetchCrmReps(),
  });

  const reps = useMemo(() => repsQuery.data?.data ?? [], [repsQuery.data]);
  const mayOpenEveryone = repsQuery.data?.mayOpenEveryone ?? false;

  const filteredReps = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return reps.filter((rep) => {
      if (roleFilter === "MANAGER" && rep.role !== "MANAGER" && rep.role !== "SUPERADMIN") return false;
      if (roleFilter === "REP" && rep.role !== "SALES_REP" && rep.role !== "SALES_EXEC") return false;
      if (!needle) return true;
      return `${rep.name ?? ""} ${rep.email ?? ""}`.toLowerCase().includes(needle);
    });
  }, [debouncedSearch, reps, roleFilter]);

  const columns = useMemo<RecordTableColumn<CrmRepSummary>[]>(
    () => [
      {
        id: "member",
        label: "Member",
        cell: (rep) => (
          <RecordTableName
            leading={<RecordMark kind="rep" name={rep.name ?? rep.email} size="sm" />}
            title={rep.name ?? rep.email ?? "Unnamed"}
            subtitle={rep.email ?? undefined}
          />
        ),
      },
      {
        id: "role",
        label: "Role",
        width: "10rem",
        cell: (rep) => <RecordCell value={ROLE_LABELS[rep.role] ?? rep.role} />,
      },
      {
        id: "leads",
        label: "Open leads",
        width: "8rem",
        align: "end",
        cell: (rep) => <RecordCell kind="number" value={rep.openLeads} />,
      },
      {
        id: "deals",
        label: "Open deals",
        width: "8rem",
        align: "end",
        cell: (rep) => <RecordCell kind="number" value={rep.openDeals} />,
      },
      {
        id: "tasks",
        label: "Open tasks",
        width: "8rem",
        align: "end",
        cell: (rep) => <RecordCell kind="number" value={rep.openTasks} />,
      },
      {
        id: "pipeline",
        label: "Open pipeline",
        width: "10rem",
        align: "end",
        cell: (rep) => (
          <NumericCell className="whitespace-nowrap">
            {formatMoney(rep.openLeadValue + rep.openDealValue, "USD")}
          </NumericCell>
        ),
      },
      {
        id: "collected",
        label: "Collected",
        width: "10rem",
        align: "end",
        cell: (rep) =>
          rep.performance ? (
            <NumericCell className="whitespace-nowrap">
              {formatMoney(rep.performance.collectedAmount, "USD")}
            </NumericCell>
          ) : (
            <RecordCell value={null} />
          ),
      },
      {
        id: "winRate",
        label: "Win rate",
        width: "7.5rem",
        align: "end",
        cell: (rep) =>
          rep.performance ? (
            <RecordCell kind="number" value={`${rep.performance.winRate}%`} />
          ) : (
            <RecordCell value={null} />
          ),
      },
    ],
    [],
  );

  const mobileRows = useMemo<RecordListRow[]>(
    () =>
      filteredReps.map((rep) => ({
        id: rep.id,
        href: mayOpenEveryone || rep.id === me ? `/crm/reps/${rep.id}` : "",
        leading: <RecordMark kind="rep" name={rep.name ?? rep.email} size="md" />,
        title: rep.name ?? rep.email ?? "Unnamed",
        subtitle: [
          ROLE_LABELS[rep.role] ?? rep.role,
          `${rep.openLeads} leads`,
          `${rep.openDeals} deals`,
        ].join(" · "),
        facts: [
          {
            value: formatMoney(rep.openLeadValue + rep.openDealValue, "USD"),
            mono: true,
            primary: true,
          },
        ],
      })),
    [filteredReps, mayOpenEveryone, me],
  );

  const tabs = useMemo<RecordListTab[]>(
    () => [
      { value: "ALL", label: "All team", count: reps.length },
      {
        value: "MANAGER",
        label: "Leadership & managers",
        count: reps.filter((r) => r.role === "MANAGER" || r.role === "SUPERADMIN").length,
      },
      {
        value: "REP",
        label: "Sales reps",
        count: reps.filter((r) => r.role === "SALES_REP" || r.role === "SALES_EXEC").length,
      },
    ],
    [reps],
  );

  return (
    <RecordListShell
      title="Team"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by name or email"
      count={filteredReps.length}
      tabs={tabs}
      activeTab={roleFilter}
      onTabChange={setRoleFilter}
      error={repsQuery.error}
    >
      <RecordTable
        rows={filteredReps}
        columns={columns}
        rowHref={(rep) => (mayOpenEveryone || rep.id === me ? `/crm/reps/${rep.id}` : "")}
        isLoading={repsQuery.isLoading}
        emptyTitle={debouncedSearch ? "Nobody matches that search" : "Nobody on the team yet"}
        mobile={<RecordList rows={mobileRows} isLoading={repsQuery.isLoading} emptyTitle="Nobody on the team yet" />}
      />
    </RecordListShell>
  );
}
