"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { useDebounced } from "@corelithzw/ui/hooks/use-debounced";
import { fetchCrmReps } from "../../crm-v2";

import { RecordList, type RecordListRow } from "@corelithzw/module-records/components/record-list";
import { RecordMark } from "@corelithzw/module-records/components/record-mark";
import { RecordListShell } from "../records/record-list-shell";
import { formatMoney } from "../documents/document-types";

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Owner",
  MANAGER: "Sales manager",
  SALES_REP: "Sales rep",
  SALES_EXEC: "Sales executive",
};

/**
 * The sales team as a directory.
 *
 * Rep performance was a table inside a report, which answers "who is ahead"
 * and nothing else. Here a rep is a record: the numbers are still the point,
 * but they sit beside the workload, and the row opens onto everything that
 * person is carrying.
 */
export function RepsContent() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);

  const repsQuery = useQuery({
    queryKey: ["crm", "reps"],
    queryFn: () => fetchCrmReps(),
  });

  const reps = useMemo(() => repsQuery.data?.data ?? [], [repsQuery.data]);

  const rows = useMemo<RecordListRow[]>(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    // The roster is small enough that filtering it in the browser beats a
    // round trip — a company with a thousand salespeople is not this product.
    const filtered = needle
      ? reps.filter((rep) =>
          `${rep.name ?? ""} ${rep.email ?? ""}`.toLowerCase().includes(needle),
        )
      : reps;

    return filtered.map((rep) => {
      const pipeline = rep.openLeadValue + rep.openDealValue;
      return {
        id: rep.id,
        href: `/crm/reps/${rep.id}`,
        leading: <RecordMark kind="rep" name={rep.name ?? rep.email} size="md" />,
        title: rep.name ?? rep.email ?? "Unnamed",
        subtitle: [
          `${rep.openLeads} lead${rep.openLeads === 1 ? "" : "s"}`,
          `${rep.openDeals} deal${rep.openDeals === 1 ? "" : "s"}`,
          rep.openTasks > 0 ? `${rep.openTasks} open task${rep.openTasks === 1 ? "" : "s"}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        status: (
          <Badge tone="neutral" size="sm">
            {ROLE_LABELS[rep.role] ?? rep.role}
          </Badge>
        ),
        facts: [
          {
            label: "Open pipeline",
            value: formatMoney(pipeline, "USD"),
            mono: true,
            // What a rep's row is about, and the one figure worth the width
            // on a phone.
            primary: true,
          },
          // A dash, not a zero: "not shown to you" and "sold nothing" are
          // different facts and must not look the same.
          {
            label: "Collected",
            value: rep.performance
              ? formatMoney(rep.performance.collectedAmount, "USD")
              : "—",
            mono: true,
          },
          {
            label: "Win rate",
            value: rep.performance ? `${rep.performance.winRate}%` : "—",
            mono: true,
          },
        ],
      };
    });
  }, [debouncedSearch, reps]);

  return (
    <RecordListShell
      title="Sales reps"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search the team by name or email"
      error={repsQuery.error}
    >
      {repsQuery.data && !repsQuery.data.canSeeEveryone ? (
        <p className="text-sm text-[var(--text-muted)]">
          You can see the whole team and what they are carrying. Sales figures are
          your own.
        </p>
      ) : null}

      <RecordList
        rows={rows}
        isLoading={repsQuery.isLoading}
        emptyTitle={debouncedSearch ? "Nobody matches that search" : "No sales reps yet"}
        emptyBody={
          debouncedSearch
            ? undefined
            : "Give somebody the sales rep or sales manager role and they appear here."
        }
      />
    </RecordListShell>
  );
}
